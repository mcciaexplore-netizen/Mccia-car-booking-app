// Fleet, roster, queue scheduling and the views each app receives. Ported from the old mock-api server.
import { randomInt } from 'node:crypto'
import nodemailer from 'nodemailer'
import { db, save, type Coords, type Ride } from './db'

export const CARS = [
  { name: 'Ertiga', seats: 6, plate: 'MH 12 AB 1001', pickupEtaMin: 22, depot: { lat: 18.5308, lon: 73.8475 } },
  { name: 'Innova', seats: 6, plate: 'MH 12 CD 1002', pickupEtaMin: 34, depot: { lat: 18.5089, lon: 73.9259 } },
]
export const ARRIVAL_OPTIONS = [5, 10, 15]

const SEED = [
  ['nilesh-gaikwad', 'Nilesh Gaikwad'], ['rajiv-shiraskar', 'Rajiv Shiraskar'], ['nilesh-patil', 'Nilesh Patil'],
  ['uttam-karde', 'Uttam Karde'], ['bharat-bajare', 'Bharat Bajare'], ['mahendra-krishnan', 'Mahendra Krishnan'], ['datta-paul', 'Datta Paul'],
].map(([id, name], i) => ({ id, name, demoPhone: `+91 90000 0000${i + 1}` }))

export const roster = () => [
  ...SEED,
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

type Slot = { startAt: number; endAt: number; position: number; waitMin: number; ready: boolean; blockedBy: 'car' | 'driver' | 'both' | null }

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
export const forRider = (ride: Ride, s = schedule()) => ({ ...ride, driverPhone: phoneOf(ride.driverId), slot: slotOf(s, ride) })

/* ---------- Admin snapshot ---------- */
export function overview() {
  const s = schedule()
  const view = (r: Ride) => {
    const sl = s.slots[r.id]
    const live = LIVE.includes(r.status)
    const from = new Date(r.startedAt ?? r.acceptedAt ?? r.createdAt).getTime()
    const elapsed = Math.max(0, (s.now - from) / 60_000)
    const total = (r.status === 'accepted' ? r.arrivalMin ?? 10 : 0) + r.tripMin
    return {
      id: r.id, status: r.status, riderName: r.riderName, phone: r.phone, passengers: r.passengers, extraPassengers: Math.max(0, r.passengers - 1),
      pickup: r.pickup, destination: r.destination, pickupCoords: r.pickupCoords ?? null, destinationCoords: r.destinationCoords ?? null,
      driverId: r.driverId, driverName: r.driverName, vehicle: r.vehicle, plate: r.plate, tripMin: r.tripMin, createdAt: r.createdAt,
      startedAt: r.startedAt, acceptedAt: r.acceptedAt,
      phase: r.status === 'started' ? 'on-trip' : r.status === 'accepted' ? 'to-pickup' : 'waiting',
      progress: live ? Math.min(0.97, elapsed / total) : 0, etaMin: live ? Math.max(1, Math.ceil(total - elapsed)) : null,
      waitMin: sl?.waitMin ?? 0, startAt: sl ? iso(sl.startAt) : null, blockedBy: sl?.blockedBy ?? null,
    }
  }
  const queue = db.rides.filter((r) => r.status === 'requested').sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)).map(view)
  const trips = db.rides.filter((r) => LIVE.includes(r.status)).map(view)
  const cars = CARS.map((c) => ({
    name: c.name, plate: c.plate, seats: c.seats, depot: c.depot,
    status: trips.some((t) => t.vehicle === c.name) ? 'busy' : 'idle',
    freeInMin: trips.find((t) => t.vehicle === c.name)?.etaMin ?? 0,
    trip: trips.find((t) => t.vehicle === c.name) ?? null,
    queued: queue.filter((q) => q.vehicle === c.name).length,
  }))
  return { now: iso(s.now), cars, trips, queue }
}

// Best-effort address lookup (OpenStreetMap Photon), biased to Pune. Returns null if offline or not found.
export async function geocode(text: string): Promise<Coords | null> {
  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=1&lat=18.5204&lon=73.8567`, { signal: AbortSignal.timeout(4000) })
    const [lon, lat] = (await res.json()).features?.[0]?.geometry?.coordinates ?? []
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
  } catch { return null }
}
