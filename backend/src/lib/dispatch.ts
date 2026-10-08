// Fleet, roster, queue scheduling and the views each app receives. Ported from the old mock-api server.
import { randomInt } from 'node:crypto'
import nodemailer from 'nodemailer'
import { db, save, type Coords, type Ride } from './db'

export const CARS = [
  { name: 'Ertiga', seats: 6, plate: 'MH 12 AB 1001', pickupEtaMin: 22, depot: { lat: 18.5308, lon: 73.8475 } },
  { name: 'Innova', seats: 6, plate: 'MH 12 CD 1002', pickupEtaMin: 34, depot: { lat: 18.5089, lon: 73.9259 } },
]
export const ARRIVAL_OPTIONS = [5, 10, 15]

// No pre-filled drivers: the roster is exactly the drivers who have signed up or were added by an admin.
const SEED: { id: string; name: string; demoPhone: string }[] = []

export const roster = () => [
  ...SEED.filter((d) => !db.removed.includes(d.id)),
  ...db.drivers.filter((a) => a.name && !SEED.some((d) => d.id === a.driverId)).map((a) => ({ id: a.driverId, name: a.name as string, demoPhone: '' })),
]
export const phoneOf = (driverId: string) => db.drivers.find((a) => a.driverId === driverId)?.phone ?? roster().find((d) => d.id === driverId)?.demoPhone ?? ''

/* ---------- PIN delivery ---------- */
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env
const mailer = SMTP_HOST && SMTP_USER && SMTP_PASS
  ? nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT ?? 465), secure: Number(SMTP_PORT ?? 465) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } })
  : null

export const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, (_m, a, d) => `${a}***${d}`)

export async function deliverOtp(ride: Ride) {
  if (!ride.riderEmail || !mailer) {
    console.log(`[demo] PIN for ${ride.id}: ${ride.otp} (${ride.riderEmail || 'no email'})`)
    ride.otpDelivery = 'not-configured'; save.rides()
    return
  }
  try {
    await mailer.sendMail({
      from: SMTP_FROM ?? SMTP_USER, to: ride.riderEmail, subject: `Your MCCIA ride PIN: ${ride.otp}`,
      text: `Hi ${ride.riderName},\n\nYour ride PIN is ${ride.otp}. Tell it to your driver (${ride.driverName}) to start the trip.\n\nRide ${ride.id}: ${ride.pickup} to ${ride.destination}\n`,
    })
    ride.otpDelivery = 'sent'
  } catch (err) {
    console.log(`[demo] email failed for ${ride.id}: ${(err as Error).message}`)
    ride.otpDelivery = 'failed'
  }
  save.rides()
}

export function newOtp() {
  for (let i = 0; i < 50; i++) {
    const otp = String(randomInt(0, 10000)).padStart(4, '0')
    if (!db.rides.some((r) => r.otp === otp && (r.status === 'requested' || r.status === 'accepted'))) return otp
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

/* ---------- Queue and time slots ----------
 * One physical car per type and one ride per driver at a time. Waiting requests are served first come, first served. */
export const LIVE = ['accepted', 'started']
const QUEUED_PICKUP_MIN = 10
export const ALLOC_GRACE_MIN = 10 // a driver may accept an admin-allocated ride this long before its slot starts
export const slotLengthMin = (tripMin: number) => QUEUED_PICKUP_MIN + tripMin

type Slot = { startAt: number; endAt: number; position: number; waitMin: number; ready: boolean; blockedBy: 'car' | 'driver' | 'both' | 'slot' | null }

export function schedule() {
  const now = Date.now()
  const carFree: Record<string, number> = {}
  const driverFree: Record<string, number> = {}
  const slots: Record<string, Slot> = {}
  const hold = (ride: Ride, end: number) => {
    carFree[ride.vehicle] = Math.max(carFree[ride.vehicle] ?? 0, end)
    driverFree[ride.driverId] = Math.max(driverFree[ride.driverId] ?? 0, end)
  }
  const ahead: Ride[] = []
  for (const r of db.rides.filter((x) => LIVE.includes(x.status))) {
    const from = new Date(r.startedAt ?? r.acceptedAt ?? r.createdAt).getTime()
    const est = from + ((r.status === 'started' ? 0 : r.arrivalMin ?? 10) + r.tripMin) * 60_000
    hold(r, Math.max(est, now + 5 * 60_000))
    slots[r.id] = { startAt: from, endAt: est, position: 0, waitMin: 0, ready: false, blockedBy: null }
    ahead.push(r)
  }
  const queued = db.rides.filter((x) => x.status === 'requested').sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
  for (const r of queued) {
    if (r.allocation) {
      // An admin fixed this ride's car, driver and time slot: honour it instead of the first-come-first-served estimate.
      const start = new Date(r.allocation.slotStart).getTime()
      const end = new Date(r.allocation.slotEnd).getTime()
      const ready = now >= start - ALLOC_GRACE_MIN * 60_000
      slots[r.id] = { startAt: start, endAt: end, position: ready ? 0 : 1, waitMin: Math.max(0, Math.ceil((start - now) / 60_000)), ready, blockedBy: ready ? null : 'slot' }
      hold(r, end)
      ahead.push(r)
      continue
    }
    const cf = carFree[r.vehicle] ?? 0
    const df = driverFree[r.driverId] ?? 0
    const start = Math.max(now, cf, df)
    const end = start + (QUEUED_PICKUP_MIN + r.tripMin) * 60_000
    const position = ahead.filter((o) => o.vehicle === r.vehicle || o.driverId === r.driverId).length
    const blockedBy = start <= now ? null : cf > now && df > now ? 'both' : cf > now ? 'car' : 'driver'
    slots[r.id] = { startAt: start, endAt: end, position, waitMin: Math.max(0, Math.ceil((start - now) / 60_000)), ready: position === 0, blockedBy }
    hold(r, end)
    ahead.push(r)
  }
  return { now, slots, carFree, driverFree }
}
export type Schedule = ReturnType<typeof schedule>

const iso = (ms: number) => new Date(ms).toISOString()
const slotOf = (s: Schedule, ride: Ride) => {
  const x = s.slots[ride.id]
  return x ? { ...x, startAt: iso(x.startAt), endAt: iso(x.endAt) } : null
}
export const minsFree = (s: Schedule, t?: number) => (t && t > s.now ? Math.ceil((t - s.now) / 60_000) : 0)

// The PIN belongs to the rider; driver-facing data never includes it or the rider's email.
export const forDriver = (ride: Ride, s = schedule()) => {
  const { otp: _o, riderEmail: _e, riderId: _r, ...rest } = ride
  return { ...rest, slot: slotOf(s, ride) }
}
export const forRider = (ride: Ride, s = schedule()) => ({ ...ride, driverPhone: phoneOf(ride.driverId), slot: slotOf(s, ride), driverLive: LIVE.includes(ride.status) ? liveOf(ride.driverId) : null })

/* ---------- Admin snapshot ---------- */
// Why a waiting request needs the admin: the rider's driver or car is busy or not signed up. Null when nothing is wrong.
function attentionOf(r: Ride, sl: Slot | undefined): { code: string; text: string } | null {
  if (r.status !== 'requested' || r.allocation) return null
  if (!db.drivers.some((a) => a.driverId === r.driverId)) return { code: 'driver-offline', text: `${r.driverName} has not signed up in the driver app` }
  if (sl?.blockedBy === 'both') return { code: 'both', text: `${r.vehicle} and ${r.driverName} are both busy` }
  if (sl?.blockedBy === 'car') return { code: 'car', text: `${r.vehicle} is out on another trip` }
  if (sl?.blockedBy === 'driver') return { code: 'driver', text: `${r.driverName} is on another job` }
  return null
}

// Another allocated or live ride that overlaps the window on the same car or driver, if any.
export function windowConflict(rideId: string, car: string, driverId: string, start: number, end: number) {
  const s = schedule()
  for (const o of db.rides) {
    if (o.id === rideId || !(LIVE.includes(o.status) || (o.status === 'requested' && o.allocation))) continue
    if (o.vehicle !== car && o.driverId !== driverId) continue
    const sl = s.slots[o.id]
    if (!sl) continue
    const oStart = sl.startAt
    const oEnd = Math.max(sl.endAt, LIVE.includes(o.status) ? s.now : 0)
    if (start < oEnd && end > oStart) return { ride: o, what: o.vehicle === car ? car : o.driverName, from: oStart, to: oEnd }
  }
  return null
}

export function overview() {
  const s = schedule()
  const view = (r: Ride) => {
    const sl = s.slots[r.id]
    const live = LIVE.includes(r.status)
    const from = new Date(r.startedAt ?? r.acceptedAt ?? r.createdAt).getTime()
    const elapsed = Math.max(0, (s.now - from) / 60_000)
    const total = (r.status === 'accepted' ? r.arrivalMin ?? 10 : 0) + r.tripMin
    return {
      id: r.id, status: r.status, riderName: r.riderName, phone: r.phone, riderEmail: r.riderEmail ?? '', passengers: r.passengers,
      otp: r.status === 'requested' || r.status === 'accepted' || r.status === 'started' ? r.otp : null,
      pickupTime: r.pickupTime || null, allocation: r.allocation ?? null, driverRegistered: db.drivers.some((a) => a.driverId === r.driverId),
      attention: attentionOf(r, sl), extraPassengers: Math.max(0, r.passengers - 1),
      pickup: r.pickup, destination: r.destination, pickupCoords: r.pickupCoords ?? null, destinationCoords: r.destinationCoords ?? null,
      driverId: r.driverId, driverName: r.driverName, vehicle: r.vehicle, plate: r.plate, tripMin: r.tripMin, createdAt: r.createdAt,
      startedAt: r.startedAt, acceptedAt: r.acceptedAt,
      phase: r.status === 'started' ? 'on-trip' : r.status === 'accepted' ? 'to-pickup' : 'waiting',
      progress: live ? Math.min(0.97, elapsed / total) : 0, etaMin: live ? Math.max(1, Math.ceil(total - elapsed)) : null,
      waitMin: sl?.waitMin ?? 0, startAt: sl ? iso(sl.startAt) : null, blockedBy: sl?.blockedBy ?? null,
      live: live ? liveOf(r.driverId) : null,
    }
  }
  const activity = [...db.rides].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 100).map(view)
  const queue = db.rides.filter((r) => r.status === 'requested').sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)).map(view)
  const trips = db.rides.filter((r) => LIVE.includes(r.status)).map(view)
  const cars = CARS.map((c) => ({
    name: c.name, plate: c.plate, seats: c.seats, depot: c.depot,
    status: trips.some((t) => t.vehicle === c.name) ? 'busy' : 'idle',
    freeInMin: trips.find((t) => t.vehicle === c.name)?.etaMin ?? 0,
    trip: trips.find((t) => t.vehicle === c.name) ?? null,
    queued: queue.filter((q) => q.vehicle === c.name).length,
  }))
  return { now: iso(s.now), cars, trips, queue, activity }
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
  return liveOf(driverId)
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
