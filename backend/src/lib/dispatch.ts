// Fleet, roster, queue scheduling and the views each app receives. Ported from the old mock-api server.
import { randomInt } from 'node:crypto'
import { db, save, type Coords, type Ride } from './db'

export const CARS = db.cars // live list, edited from the admin dashboard
export const ARRIVAL_OPTIONS = [5, 10, 15]

// No pre-filled drivers: the roster is exactly the drivers who have signed up or were added by an admin.
const SEED: { id: string; name: string; demoPhone: string }[] = []

export const roster = () => [
  ...SEED.filter((d) => !db.removed.includes(d.id)),
  ...db.drivers.filter((a) => a.name && !SEED.some((d) => d.id === a.driverId)).map((a) => ({ id: a.driverId, name: a.name as string, demoPhone: '' })),
]
export const phoneOf = (driverId: string) => db.drivers.find((a) => a.driverId === driverId)?.phone ?? roster().find((d) => d.id === driverId)?.demoPhone ?? ''

export function newOtp() {
  for (let i = 0; i < 50; i++) {
    const otp = String(randomInt(0, 10000)).padStart(4, '0')
    if (!db.rides.some((r) => r.otp === otp && ['requested', 'held', 'approved', 'accepted', 'started'].includes(r.status))) return otp
  }
  throw new Error('No free PINs')
}

// Illustrative trip duration (not traffic-based): stable 12-38 min derived from the route text.
export function tripMinutes(pickup: string, destination: string) {
  let h = 0
  for (const c of `${pickup}|${destination}`.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 997
  return 12 + (h % 27)
}

export const validCoords = (c: unknown): Coords | null => {
  const x = c as Partial<Coords> | null
  return x && Number.isFinite(x.lat) && Number.isFinite(x.lon) ? { lat: x.lat as number, lon: x.lon as number } : null
}

/* ---------- Time windows and conflicts ----------
 * Requests wait for an admin. The admin approves one by choosing a car and a driver; from then on the ride holds that car and
 * driver for its time window. One car and one driver can never be booked for two overlapping windows. */
export const LIVE = ['accepted', 'started']
export const BOOKED = ['approved', 'accepted', 'started'] // rides that hold a car and a driver
export const OPEN = ['requested', 'held', 'approved', 'accepted', 'started']
const QUEUED_PICKUP_MIN = 10
const STOP_MIN = 10 // time allowed for each layover
export const ACCEPT_EARLY_MIN = 30 // a driver can start heading to pickup this long before the planned start
export const slotLengthMin = (tripMin: number, stops = 0) => QUEUED_PICKUP_MIN + tripMin + stops * STOP_MIN

const ms = (iso?: string | null) => (iso ? new Date(iso).getTime() : NaN)

// Planned start and end (epoch ms) of a ride. "Now" rides start when they are approved; multi-day rides run until endAt.
export function rideWindow(r: Ride, now = Date.now()) {
  const live = LIVE.includes(r.status)
  const start = live ? ms(r.startedAt ?? r.acceptedAt) : Number.isFinite(ms(r.startAt)) ? ms(r.startAt) : ms(r.approvedAt ?? r.createdAt)
  let end = Number.isFinite(ms(r.endAt)) ? ms(r.endAt) : start + slotLengthMin(r.tripMin, r.stops?.length ?? 0) * 60_000
  if (live) end = Math.max(end, now + 5 * 60_000)
  return { start, end }
}

const iso = (t: number) => new Date(t).toISOString()

// Another approved or live ride that overlaps the window on the same car or driver, if any.
export function windowConflict(rideId: string, car: string, driverId: string, start: number, end: number) {
  const now = Date.now()
  for (const o of db.rides) {
    if (o.id === rideId || !BOOKED.includes(o.status)) continue
    if (o.vehicle !== car && o.driverId !== driverId) continue
    const w = rideWindow(o, now)
    if (start < w.end && end > w.start) return { ride: o, what: o.vehicle === car ? car : o.driverName, from: w.start, to: w.end }
  }
  return null
}

// Can the driver start heading to pickup yet?
export const canStartNow = (r: Ride, now = Date.now()) => r.tripType === 'now' || !r.startAt || now >= ms(r.startAt) - ACCEPT_EARLY_MIN * 60_000

// The PIN belongs to the rider; driver-facing data never includes it or the rider's email.
export const forDriver = (ride: Ride) => {
  const { otp: _o, riderEmail: _e, riderId: _r, ...rest } = ride
  const w = rideWindow(ride)
  return { ...rest, window: { start: iso(w.start), end: iso(w.end) }, canStart: ride.status === 'approved' && canStartNow(ride) }
}
export const forRider = (ride: Ride) => {
  const w = rideWindow(ride)
  const seats = CARS.find((c) => c.name === ride.vehicle)?.seats ?? null
  return {
    ...ride,
    otp: BOOKED.includes(ride.status) ? ride.otp : undefined, // the PIN is shown once a car and driver are assigned
    driverPhone: ride.driverId ? phoneOf(ride.driverId) : '', carSeats: seats,
    window: { start: iso(w.start), end: iso(w.end) },
    driverLive: ride.driverId && LIVE.includes(ride.status) ? liveOf(ride.driverId) : null,
  }
}

/* ---------- Admin snapshot ---------- */
export function overview() {
  const now = Date.now()
  const view = (r: Ride) => {
    const live = LIVE.includes(r.status)
    const w = rideWindow(r, now)
    const from = new Date(r.startedAt ?? r.acceptedAt ?? r.createdAt).getTime()
    const elapsed = Math.max(0, (now - from) / 60_000)
    const total = (r.status === 'accepted' ? r.arrivalMin ?? 10 : 0) + r.tripMin
    return {
      id: r.id, status: r.status, riderName: r.riderName, phone: r.phone, riderEmail: r.riderEmail ?? '', passengers: r.passengers,
      otp: OPEN.includes(r.status) ? r.otp : null,
      tripType: r.tripType ?? 'now', startAt: r.startAt ?? null, endAt: r.endAt ?? null, stops: r.stops ?? [],
      holdNote: r.holdNote ?? '', returnedNote: r.returnedNote ?? '', driverRegistered: !r.driverId || db.drivers.some((a) => a.driverId === r.driverId),
      extraPassengers: Math.max(0, r.passengers - 1),
      pickup: r.pickup, destination: r.destination, pickupCoords: r.pickupCoords ?? null, destinationCoords: r.destinationCoords ?? null,
      driverId: r.driverId, driverName: r.driverName, vehicle: r.vehicle, plate: r.plate, tripMin: r.tripMin, createdAt: r.createdAt,
      approvedAt: r.approvedAt ?? null, startedAt: r.startedAt, acceptedAt: r.acceptedAt,
      reachedAt: r.reachedAt ?? null,
      phase: r.status === 'started' ? (r.reachedAt ? 'reached' : 'on-trip') : r.status === 'accepted' ? 'to-pickup' : r.status === 'approved' ? 'assigned' : 'waiting',
      progress: live ? Math.min(0.97, elapsed / total) : 0, etaMin: live ? Math.max(1, Math.ceil(total - elapsed)) : null,
      window: { start: iso(w.start), end: iso(w.end) },
      live: live && r.driverId ? liveOf(r.driverId) : null,
    }
  }
  const byNewest = (a: Ride, b: Ride) => +new Date(b.createdAt) - +new Date(a.createdAt)
  const activity = [...db.rides].sort(byNewest).slice(0, 100).map(view)
  // The queue is every request still waiting for the admin: new ones and ones on hold, oldest first.
  const queue = db.rides.filter((r) => r.status === 'requested' || r.status === 'held').sort((a, b) => -byNewest(a, b)).map(view)
  const upcoming = db.rides.filter((r) => r.status === 'approved').sort((a, b) => rideWindow(a, now).start - rideWindow(b, now).start).map(view)
  const trips = db.rides.filter((r) => LIVE.includes(r.status)).map(view)
  const cars = CARS.map((c) => ({
    name: c.name, plate: c.plate, seats: c.seats, depot: c.depot, model: c.model ?? '', color: c.color ?? '', fuel: c.fuel ?? '', year: c.year ?? null, notes: c.notes ?? '', gpsId: c.gpsId ?? '', gps: gpsOf(c), pickupEtaMin: c.pickupEtaMin,
    status: trips.some((t) => t.vehicle === c.name) ? 'busy' : 'idle',
    freeInMin: trips.find((t) => t.vehicle === c.name)?.etaMin ?? 0,
    trip: trips.find((t) => t.vehicle === c.name) ?? null,
    queued: upcoming.filter((q) => q.vehicle === c.name).length,
  }))
  return { now: iso(now), cars, trips, queue, upcoming, activity }
}

// Best-effort address lookup (OpenStreetMap Photon), biased to Pune. Returns null if offline or not found.
export async function geocode(text: string): Promise<Coords | null> {
  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=1&lat=18.5204&lon=73.8567`, { signal: AbortSignal.timeout(4000) })
    const [lon, lat] = (await res.json()).features?.[0]?.geometry?.coordinates ?? []
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
  } catch { return null }
}

/* ---------- Live vehicle tracking ----------
 * The driver app sends the phone's GPS position every few seconds while a ride is active.
 * "moving" = real movement seen in the last MOVING_MS; "stopped" = fresh signal but no movement; "offline" = no signal. */
export const MOVING_MS = 15_000
export const OFFLINE_MS = 30_000
const MOVE_SPEED = 1.2 // m/s (about 4 km/h) counts as moving
const DEG = Math.PI / 180

export function metres(a: Coords, b: Coords) {
  const dLat = (b.lat - a.lat) * DEG
  const dLon = (b.lon - a.lon) * DEG
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

export function recordLocation(driverId: string, input: { lat: number; lon: number; speed?: unknown; heading?: unknown; accuracy?: unknown }) {
  const now = Date.now()
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const accuracy = num(input.accuracy)
  const prev = db.locations.find((l) => l.driverId === driverId)
  let speed = num(input.speed)
  let movedAt = prev?.movedAt ?? 0
  if (prev) {
    const d = metres(prev, input)
    const dt = Math.max((now - prev.ts) / 1000, 0.5)
    // GPS jitter while parked can show 10-20 m of drift, so small hops only count when the device also reports speed.
    const noise = Math.max(10, (accuracy ?? 0) * 1.5)
    if (speed === null) speed = d >= noise ? d / dt : 0
    if (speed >= MOVE_SPEED && (d >= 3 || num(input.speed) !== null)) movedAt = now
    else if (d >= noise * 2) movedAt = now
  } else if (speed === null) speed = 0
  const next = { driverId, lat: input.lat, lon: input.lon, speed: speed ?? 0, heading: num(input.heading), accuracy, ts: now, movedAt, firstTs: prev?.firstTs ?? now }
  if (prev) Object.assign(prev, next)
  else db.locations.push(next)
  save.locations()
  // The driver's phone also confirms arrival when the car has no GPS tracker of its own.
  const trip = db.rides.find((r) => r.driverId === driverId && r.status === 'started')
  if (trip && !db.carGps.some((g) => g.plate === trip.plate && Date.now() - g.ts < GPS_OFFLINE_MS)) checkReached(trip.vehicle, input)
  return liveOf(driverId)
}

/* ---------- Car GPS trackers ----------
 * Each car's own GPS unit (or the tracking vendor's webhook) posts reports to /api/gps/ingest. They are matched to a car by
 * its tracker id (gpsId) or plate, kept as the car's latest state, and shown on the admin dashboard. */
export const GPS_OFFLINE_MS = 5 * 60_000
export const REACHED_M = 150 // a car this close to the destination counts as having arrived

// Marks a trip in progress as "reached" the first time the car is within REACHED_M of its destination.
function checkReached(carName: string, pos: Coords) {
  const ride = db.rides.find((r) => r.vehicle === carName && r.status === 'started' && !r.reachedAt)
  if (!ride?.destinationCoords || metres(pos, ride.destinationCoords) > REACHED_M) return
  ride.reachedAt = new Date().toISOString()
  save.rides()
}

export function findCarByGps(ref: string) {
  const key = ref.trim().toUpperCase().replace(/[\s-]+/g, '')
  if (!key) return undefined
  return CARS.find((c) => (c.gpsId && c.gpsId.toUpperCase() === ref.trim().toUpperCase()) || c.plate.toUpperCase().replace(/[\s-]+/g, '') === key)
}

// Accepts one report from a tracker. Field names vary between vendors, so common aliases are understood.
export function recordCarGps(raw: Record<string, unknown>): { ok: true; car: string } | { ok: false; error: string; status: number } {
  const num = (...keys: string[]) => { for (const k of keys) { const v = Number(raw[k]); if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '' && Number.isFinite(v)) return v } return null }
  const ref = String(raw.deviceId ?? raw.imei ?? raw.gpsId ?? raw.plate ?? raw.vehicle ?? '')
  const car = findCarByGps(ref)
  if (!car) return { ok: false, error: `No car is linked to tracker "${ref}". Set the tracker id on the car in the admin dashboard.`, status: 404 }
  const lat = num('lat', 'latitude'), lon = num('lon', 'lng', 'longitude')
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { ok: false, error: 'Invalid position.', status: 400 }
  const now = Date.now()
  let deviceTs = num('ts', 'timestamp') ?? now
  if (deviceTs < 1e12) deviceTs *= 1000 // seconds -> ms
  if (!Number.isFinite(deviceTs) || deviceTs > now + 3_600_000) deviceTs = now
  const ign = raw.ignition ?? raw.acc
  const next = {
    plate: car.plate, lat, lon, speedKmh: Math.max(0, Math.round(num('speedKmh', 'speed') ?? 0)), heading: num('heading', 'course', 'bearing'),
    ignition: ign === undefined || ign === null ? null : ign === true || ign === 1 || ign === '1' || String(ign).toLowerCase() === 'on' || String(ign).toLowerCase() === 'true',
    fuelPct: num('fuelPct', 'fuel'), odometerKm: num('odometerKm', 'odometer'), batteryV: num('batteryV', 'battery'), ts: now, deviceTs,
  }
  const prev = db.carGps.find((g) => g.plate === car.plate)
  if (prev) Object.assign(prev, next); else db.carGps.push(next)
  save.carGps()
  checkReached(car.name, { lat, lon })
  return { ok: true, car: car.name }
}

export function gpsOf(car: { plate: string }) {
  const g = db.carGps.find((x) => x.plate === car.plate)
  if (!g) return null
  const age = Date.now() - g.ts
  const state = age > GPS_OFFLINE_MS ? 'offline' : g.speedKmh > 2 ? 'moving' : 'stopped'
  return { ...g, ts: new Date(g.ts).toISOString(), ageSec: Math.round(age / 1000), state }
}

export type Live = { lat: number; lon: number; speedKmh: number; heading: number | null; ts: string; ageSec: number; state: 'moving' | 'stopped' | 'offline'; stoppedForSec: number }

export function liveOf(driverId: string): Live | null {
  const l = db.locations.find((x) => x.driverId === driverId)
  if (!l) return null
  const now = Date.now()
  const age = now - l.ts
  const state = age > OFFLINE_MS ? 'offline' : now - l.movedAt <= MOVING_MS ? 'moving' : 'stopped'
  return {
    lat: l.lat, lon: l.lon, speedKmh: state === 'moving' ? Math.round(l.speed * 3.6) : 0, heading: l.heading,
    ts: new Date(l.ts).toISOString(), ageSec: Math.round(age / 1000), state,
    stoppedForSec: state === 'stopped' ? Math.round((now - Math.max(l.movedAt, l.firstTs ?? l.ts)) / 1000) : 0,
  }
}
