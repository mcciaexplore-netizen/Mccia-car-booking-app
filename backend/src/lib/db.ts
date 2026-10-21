// Storage. Locally (no DATABASE_URL) data lives in backend/data/*.json. On Vercel set DATABASE_URL to a Postgres
// connection string (Neon): every collection is then one row in a `kv` table, reloaded at the start of each request
// and written before the response is sent, so separate serverless instances stay in sync.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { neon } from '@neondatabase/serverless'

export type Coords = { lat: number; lon: number }
export type Account = { id: string; name: string; email?: string; phone: string; salt: string; hash: string; createdAt: string }
export type DriverAccount = { driverId: string; name?: string; phone: string; salt: string; hash: string; createdAt: string; notes?: string; plainPassword?: string }
export type Ride = {
  id: string; riderId?: string; riderName: string; riderEmail: string; phone: string
  pickup: string; destination: string; pickupCoords: Coords | null; destinationCoords: Coords | null
  passengers: number; pickupTime: string
  driverId: string; driverName: string; vehicle: string; plate: string
  pickupEtaMin: number; tripMin: number
  otp: string; otpDelivery: string; emailMasked: string
  // requested = waiting for admin approval, held = admin paused it, approved = car + driver assigned by the admin,
  // accepted = driver is on the way to pick up, started = trip in progress.
  status: 'requested' | 'held' | 'approved' | 'accepted' | 'started' | 'completed' | 'cancelled' | 'declined'
  // Layover stops between pickup and destination (optional), in order.
  stops?: { label: string; coords: Coords | null }[]
  // now = leave as soon as approved, scheduled = one date and time, multiday = from startAt until endAt.
  tripType?: 'now' | 'scheduled' | 'multiday'
  startAt?: string | null
  endAt?: string | null
  approvedAt?: string | null
  holdNote?: string
  reachedAt?: string | null // set automatically when the car's GPS first comes within range of the destination
  returnedNote?: string // set when a driver sent an approved ride back to the queue
  cancelledBy?: 'admin' | 'rider'
  cancelReason?: string
  arrivalMin: number | null; createdAt: string; acceptedAt: string | null; startedAt: string | null; completedAt?: string | null
}

// In-app notifications (pop-ups) for riders and drivers. Reminders and approvals are created by the server.
export type Notification = {
  id: string; role: 'rider' | 'driver'; userId: string; rideId: string
  kind: 'approved' | 'held' | 'cancelled' | 'reminder' | 'assigned' | 'returned'
  title: string; message: string; createdAt: string; read: boolean; data?: Record<string, unknown>
}

// gpsId = the tracker's device id / IMEI, so reports from the car's GPS unit can be matched to this car.
// defaultDriverId = the driver pre-selected when this car is assigned to a ride (the admin can still pick someone else).
export type Car = { name: string; plate: string; seats: number; pickupEtaMin: number; depot: Coords; model?: string; color?: string; fuel?: string; year?: number; notes?: string; gpsId?: string; defaultDriverId?: string }

// Last report from each car's own GPS tracker, keyed by car plate.
export type CarGps = { plate: string; lat: number; lon: number; speedKmh: number; heading: number | null; ignition: boolean | null; fuelPct: number | null; odometerKm: number | null; batteryV: number | null; ts: number; deviceTs: number }
export const DEFAULT_CARS: Car[] = [
  { name: 'Ertiga', seats: 6, plate: 'MH 12 YH 2582', pickupEtaMin: 22, depot: { lat: 18.5308, lon: 73.8475 } },
  { name: 'Innova', seats: 6, plate: 'MH 12 YN 1745', pickupEtaMin: 34, depot: { lat: 18.5089, lon: 73.9259 } },
]

// Last known GPS position of each driver (updated by the driver app while a ride is active).
export type Location = { driverId: string; lat: number; lon: number; speed: number; heading: number | null; accuracy: number | null; ts: number; movedAt: number; firstTs: number }

type Key = 'drivers' | 'riders' | 'admins' | 'rides' | 'locations' | 'removed' | 'cars' | 'notifications' | 'carGps'
const KEYS: Key[] = ['drivers', 'riders', 'admins', 'rides', 'locations', 'removed', 'cars', 'notifications', 'carGps']
// `removed` lists starter-driver ids an admin has deleted, so they stop appearing in the roster.
type Store = { drivers: DriverAccount[]; riders: Account[]; admins: Account[]; rides: Ride[]; locations: Location[]; removed: string[]; cars: Car[]; notifications: Notification[]; carGps: CarGps[]; counter: number }

export const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? ''
const sql = DATABASE_URL ? neon(DATABASE_URL) : null
// On Vercel the filesystem is read-only and resets, so a database is mandatory there.
export const missingDatabase = !!process.env.VERCEL && !sql
export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data') // set DATA_DIR to keep data on a mounted volume
export const usingDatabase = !!sql

function loadFile<T>(file: string): T[] {
  try { return JSON.parse(readFileSync(path.join(DATA_DIR, `${file}.json`), 'utf8').replace(/^﻿/, '')) as T[] } catch { return [] }
}

const g = globalThis as unknown as { __rideops?: Store; __rideopsReady?: Promise<unknown> }
if (!g.__rideops) {
  if (!sql) { try { mkdirSync(DATA_DIR, { recursive: true }) } catch { /* read-only filesystem */ } }
  g.__rideops = {
    drivers: sql ? [] : loadFile<DriverAccount>('drivers'),
    riders: sql ? [] : loadFile<Account>('riders'),
    admins: sql ? [] : loadFile<Account>('admins'),
    rides: sql ? [] : loadFile<Ride>('rides'),
    locations: sql ? [] : loadFile<Location>('locations'),
    removed: sql ? [] : loadFile<string>('removed'),
    cars: sql ? [] : loadFile<Car>('cars'),
    notifications: sql ? [] : loadFile<Notification>('notifications'),
    carGps: sql ? [] : loadFile<CarGps>('carGps'),
    counter: 1,
  }
}
g.__rideops.locations ??= [] // stores created before live tracking existed
g.__rideops.removed ??= []
g.__rideops.cars ??= []
g.__rideops.notifications ??= []
g.__rideops.carGps ??= []
if (!g.__rideops.cars.length) g.__rideops.cars.push(...DEFAULT_CARS) // starter fleet until an admin edits it
export const db = g.__rideops

const nextCounter = () => db.rides.reduce((max, r) => Math.max(max, Number(String(r.id).replace(/\D/g, '')) || 0), 0) + 1

// File store: remember each file's last-seen modification time, so several API replicas sharing one data folder pick up
// each other's writes. (Postgres is still the recommended store for more than one replica: it avoids write races.)
const seen: Record<string, number> = {}
const mtime = (key: Key) => { try { return statSync(path.join(DATA_DIR, `${key}.json`)).mtimeMs } catch { return 0 } }
for (const key of KEYS) seen[key] = mtime(key)

// Call at the start of every request: refreshes the in-memory copy from Postgres or, for the file store, from changed files.
export async function sync() {
  if (sql) {
    await (g.__rideopsReady ??= sql`create table if not exists kv (key text primary key, value jsonb not null)`)
    const rows = (await sql`select key, value from kv`) as { key: string; value: unknown }[]
    for (const key of KEYS) {
      const value = (rows.find((r) => r.key === key)?.value as unknown[]) ?? []
      // `cars` is shared by reference (CARS in dispatch.ts), so refresh it in place.
      if (key === 'cars') db.cars.splice(0, db.cars.length, ...((value.length ? value : DEFAULT_CARS) as Car[]))
      else (db[key] as unknown[]) = value
    }
  }
  else {
    for (const key of KEYS) {
      const m = mtime(key)
      if (!m || m === seen[key]) continue
      seen[key] = m
      const value = loadFile<unknown>(key)
      if (key === 'cars') db.cars.splice(0, db.cars.length, ...((value.length ? value : DEFAULT_CARS) as Car[]))
      else (db[key] as unknown[]) = value
    }
  }
  db.counter = Math.max(db.counter, nextCounter())
}

const pending: Promise<unknown>[] = []
function persist(key: Key) {
  if (sql) {
    const value = JSON.stringify(db[key])
    pending.push(sql`insert into kv (key, value) values (${key}, ${value}::jsonb) on conflict (key) do update set value = excluded.value`)
    return
  }
  try { writeFileSync(path.join(DATA_DIR, `${key}.json`), JSON.stringify(db[key], null, 2)); seen[key] = mtime(key) } catch (e) { console.log(`Could not save ${key}:`, (e as Error).message) }
}
export const save = {
  drivers: () => persist('drivers'),
  riders: () => persist('riders'),
  admins: () => persist('admins'),
  rides: () => persist('rides'),
  locations: () => persist('locations'),
  removed: () => persist('removed'),
  cars: () => persist('cars'),
  notifications: () => persist('notifications'),
  carGps: () => persist('carGps'),
}
// Call before sending the response so serverless functions are not frozen with writes still in flight.
export async function flush() { await Promise.all(pending.splice(0)) }

export const hasSecretFile = () => existsSync(path.join(DATA_DIR, '.secret'))
