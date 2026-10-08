// Driver management for the admin "Driver activity" CRM: register, report and delete drivers.
import { randomBytes } from 'node:crypto'
import { hashPw, newSalt, normPhone, phoneKey } from './auth'
import { db, save } from './db'
import { LIVE, liveOf, phoneOf, roster } from './dispatch'

const SEED_IDS = new Set<string>()

type Result<T> = { ok: true; value: T } | { ok: false; error: string; status: number }

// Used by driver self sign-up and by admins adding a driver. Typing a starter name claims that starter entry.
// keepPlain: an admin adding a driver also keeps the password in readable form so it can be shown in the driver table.
export function registerDriver(input: { name?: unknown; phone?: unknown; password?: unknown }, keepPlain = false): Result<{ id: string; name: string; phone: string }> {
  const name = String(input.name ?? '').trim().replace(/\s+/g, ' ')
  const phone = normPhone(input.phone)
  const password = String(input.password ?? '')
  if (name.length < 2) return { ok: false, error: 'Enter the driver\'s full name.', status: 400 }
  if (phone.replace(/\D/g, '').length < 7) return { ok: false, error: 'Enter a valid phone number.', status: 400 }
  if (password.length < 4) return { ok: false, error: 'Password must be at least 4 characters.', status: 400 }
  const existing = roster().find((d) => d.name.toLowerCase() === name.toLowerCase())
  if (existing && db.drivers.some((a) => a.driverId === existing.id)) return { ok: false, error: 'A driver with this name already exists. Add a middle name or initial.', status: 409 }
  if (db.drivers.some((a) => phoneKey(a.phone) === phoneKey(phone))) return { ok: false, error: 'That phone number is already registered.', status: 409 }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'driver'
  const driver = existing ?? { id: roster().some((d) => d.id === slug) ? `${slug}-${randomBytes(2).toString('hex')}` : slug, name }
  // Re-adding a starter driver an admin deleted earlier brings that entry back.
  const at = db.removed.indexOf(driver.id)
  if (at >= 0) { db.removed.splice(at, 1); save.removed() }
  const salt = newSalt()
  db.drivers.push({ driverId: driver.id, name: driver.name, phone, salt, hash: hashPw(password, salt), createdAt: new Date().toISOString(), ...(keepPlain ? { plainPassword: password } : {}) })
  save.drivers()
  return { ok: true, value: { id: driver.id, name: driver.name, phone } }
}

const iso = (ms: number) => new Date(ms).toISOString()

// One row per driver for the admin CRM view: status, current job, history counts, last activity and recent rides.
export function driverReport() {
  return roster().map((d) => {
    const account = db.drivers.find((a) => a.driverId === d.id)
    const rides = db.rides.filter((r) => r.driverId === d.id)
    const count = (s: string) => rides.filter((r) => r.status === s).length
    const active = rides.find((r) => r.status === 'started') ?? rides.find((r) => r.status === 'accepted')
    const stamps = rides.flatMap((r) => [r.createdAt, r.acceptedAt, r.startedAt, r.completedAt].filter(Boolean) as string[]).map((t) => new Date(t).getTime())
    const loc = db.locations.find((l) => l.driverId === d.id)
    if (loc) stamps.push(loc.ts)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const completed = rides.filter((r) => r.status === 'completed')
    const tripMinutes = completed.filter((r) => r.startedAt && r.completedAt).map((r) => (new Date(r.completedAt as string).getTime() - new Date(r.startedAt as string).getTime()) / 60_000)
    return {
      id: d.id,
      name: d.name,
      phone: account ? account.phone : '',
      registered: !!account,
      joinedAt: account?.createdAt ?? null,
      notes: account?.notes ?? '',
      status: active ? (active.status === 'started' ? 'on-trip' : 'to-pickup') : account ? 'available' : 'not-registered',
      password: account?.plainPassword ?? null,
      // Every open ride for this driver with the OTP the rider gives them at pickup.
      otps: rides.filter((r) => ['requested', 'accepted', 'started'].includes(r.status)).map((r) => ({ rideId: r.id, rider: r.riderName, status: r.status, otp: r.otp })),
      current: active ? { rideId: active.id, otp: active.otp, car: active.vehicle, plate: active.plate, rider: active.riderName, passengers: active.passengers, pickup: active.pickup, destination: active.destination } : null,
      live: active ? liveOf(d.id) : null,
      queued: count('requested'),
      total: rides.length,
      completed: completed.length,
      completedToday: completed.filter((r) => new Date(r.completedAt ?? 0) >= today).length,
      declined: count('declined'),
      cancelled: count('cancelled'),
      avgTripMin: tripMinutes.length ? Math.round(tripMinutes.reduce((a, b) => a + b, 0) / tripMinutes.length) : null,
      lastActive: stamps.length ? iso(Math.max(...stamps)) : null,
      recent: rides.slice(-6).reverse().map((r) => ({ id: r.id, rider: r.riderName, pickup: r.pickup, destination: r.destination, vehicle: r.vehicle, status: r.status, otp: ['requested', 'accepted', 'started'].includes(r.status) ? r.otp : null, at: r.completedAt ?? r.startedAt ?? r.acceptedAt ?? r.createdAt })),
    }
  })
}

// Deleting a driver removes their login and roster entry. Past rides stay in history. Blocked during a live trip.
export function removeDriver(id: string): Result<{ declined: number }> {
  const known = roster().some((d) => d.id === id)
  if (!known) return { ok: false, error: 'Driver not found.', status: 404 }
  if (db.rides.some((r) => r.driverId === id && LIVE.includes(r.status))) return { ok: false, error: 'This driver has a trip in progress. End the trip first.', status: 409 }
  // Riders still waiting for this driver are told the driver is unavailable.
  let declined = 0
  for (const r of db.rides) if (r.driverId === id && r.status === 'requested') { r.status = 'declined'; declined++ }
  if (declined) save.rides()
  const at = db.drivers.findIndex((a) => a.driverId === id)
  if (at >= 0) { db.drivers.splice(at, 1); save.drivers() }
  const loc = db.locations.findIndex((l) => l.driverId === id)
  if (loc >= 0) { db.locations.splice(loc, 1); save.locations() }
  if (SEED_IDS.has(id) && !db.removed.includes(id)) { db.removed.push(id); save.removed() }
  return { ok: true, value: { declined } }
}

export const setDriverNotes = (id: string, notes: string): boolean => {
  const account = db.drivers.find((a) => a.driverId === id)
  if (!account) return false
  account.notes = notes.slice(0, 1000)
  save.drivers()
  return true
}

export { phoneOf }
