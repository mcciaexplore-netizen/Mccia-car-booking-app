// Booking rules: validating a rider's request, and the admin allocating a car and driver to it.
import { db, type Coords, type Ride } from './db'
import { CARS, rideWindow, roster, slotLengthMin, tripMinutes, validCoords, windowConflict } from './dispatch'

type Result<T> = { ok: true; value: T } | { ok: false; error: string; status: number }
const bad = (error: string, status = 400): { ok: false; error: string; status: number } => ({ ok: false, error, status })

const text = (v: unknown, max = 300) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max)
const ms = (v: unknown) => new Date(String(v ?? '')).getTime()
const DAY = 24 * 3_600_000
const IST = 'Asia/Kolkata'
const clock = (t: number) => new Date(t).toLocaleString('en-IN', { timeZone: IST, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export type RideRequest = Pick<Ride, 'pickup' | 'destination' | 'pickupCoords' | 'destinationCoords' | 'stops' | 'tripType' | 'startAt' | 'endAt' | 'passengers' | 'tripMin'>

// A rider's (or a walk-in's) request: route with optional layover stops, and when: now, one date/time, or a date range.
export function parseRequest(x: Record<string, unknown>): Result<RideRequest> {
  const pickup = text(x.pickup), destination = text(x.destination)
  if (!pickup || !destination) return bad('Enter a pickup and a destination.')
  const rawStops = Array.isArray(x.stops) ? x.stops : []
  if (rawStops.length > 5) return bad('You can add up to 5 stops.')
  const stops = rawStops.map((s) => {
    const o = s as { label?: unknown; coords?: unknown }
    return { label: text(o?.label), coords: validCoords(o?.coords) as Coords | null }
  }).filter((s) => s.label)

  const now = Date.now()
  let tripType: Ride['tripType'] = x.tripType === 'scheduled' || x.tripType === 'multiday' ? x.tripType : x.startAt ? 'scheduled' : 'now'
  let startAt: string | null = null, endAt: string | null = null
  if (tripType !== 'now') {
    const start = ms(x.startAt)
    if (!Number.isFinite(start)) return bad('Choose a pickup date and time.')
    if (start < now - 5 * 60_000) return bad('The pickup time is in the past.')
    if (start > now + 90 * DAY) return bad('Choose a date within the next 90 days.')
    startAt = new Date(start).toISOString()
    if (tripType === 'multiday') {
      const end = ms(x.endAt)
      if (!Number.isFinite(end)) return bad('Choose the date and time you need the car until.')
      if (end <= start) return bad('The end must be after the start.')
      if (end - start > 30 * DAY) return bad('A booking can cover at most 30 days.')
      endAt = new Date(end).toISOString()
    }
  } else tripType = 'now'

  const maxSeats = Math.max(0, ...CARS.map((c) => c.seats))
  const passengers = Math.floor(Number(x.passengers) || 1)
  if (passengers < 1) return bad('Choose how many people are travelling.')
  if (passengers > maxSeats) return bad(`Our largest car seats ${maxSeats}. Please split this into more than one request.`)

  return {
    ok: true,
    value: {
      pickup, destination, pickupCoords: validCoords(x.pickupCoords), destinationCoords: validCoords(x.destinationCoords),
      stops, tripType, startAt, endAt, passengers, tripMin: tripMinutes(pickup, destination),
    },
  }
}

// The admin approves a request by choosing the car and the driver. Also used to change the allocation of an approved ride.
export function allocate(ride: Ride, x: { car?: unknown; driverId?: unknown }): Result<true> {
  if (!['requested', 'held', 'approved'].includes(ride.status)) return bad(`Ride is ${ride.status}. Only waiting or approved requests can be allocated.`, 409)
  const car = CARS.find((c) => c.name === x.car)
  if (!car) return bad('Choose a car.')
  const driver = roster().find((d) => d.id === x.driverId)
  if (!driver) return bad('Choose a driver.')
  if (!db.drivers.some((a) => a.driverId === driver.id)) return bad(`${driver.name} has not signed up in the driver app yet.`)
  if (ride.passengers > car.seats) return bad(`${car.name} seats ${car.seats} and this booking has ${ride.passengers} riders.`)

  const now = Date.now()
  const start = ride.startAt ? ms(ride.startAt) : now
  if (ride.tripType !== 'multiday' && start < now - 60 * 60_000) return bad('The requested pickup time has already passed. Cancel this request and ask the rider to book again.')
  const end = ride.endAt ? ms(ride.endAt) : start + slotLengthMin(ride.tripMin, ride.stops?.length ?? 0) * 60_000
  const clash = windowConflict(ride.id, car.name, driver.id, start, end)
  if (clash) return bad(`${clash.what} is already booked from ${clock(clash.from)} to ${clock(clash.to)}. Choose another ${clash.what === car.name ? 'car' : 'driver'} or time.`, 409)

  ride.vehicle = car.name
  ride.plate = car.plate
  ride.pickupEtaMin = car.pickupEtaMin
  ride.driverId = driver.id
  ride.driverName = driver.name
  ride.status = 'approved'
  ride.approvedAt = new Date(now).toISOString()
  ride.holdNote = undefined
  ride.returnedNote = undefined
  return { ok: true, value: true }
}

// Which cars and drivers are free for a request's window, so the admin's approve dialog can warn before saving.
export function availabilityFor(ride: Ride) {
  const now = Date.now()
  const start = ride.startAt ? ms(ride.startAt) : now
  const end = ride.endAt ? ms(ride.endAt) : start + slotLengthMin(ride.tripMin, ride.stops?.length ?? 0) * 60_000
  const busy = (car: string, driverId: string) => {
    const c = windowConflict(ride.id, car, driverId, start, end)
    return c ? `booked ${clock(c.from)} – ${clock(c.to)}` : null
  }
  return {
    cars: CARS.map((c) => ({ name: c.name, plate: c.plate, seats: c.seats, fits: c.seats >= ride.passengers, busy: busy(c.name, ''), defaultDriverId: c.defaultDriverId ?? '' })),
    drivers: roster().map((d) => ({ id: d.id, name: d.name, registered: db.drivers.some((a) => a.driverId === d.id), busy: busy('', d.id) })),
  }
}

export { rideWindow }
