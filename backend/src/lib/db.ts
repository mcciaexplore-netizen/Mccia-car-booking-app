// Storage. Locally (no DATABASE_URL) data lives in backend/data/*.json. On Vercel set DATABASE_URL to a Postgres
// connection string (Neon): every collection is then one row in a `kv` table, reloaded at the start of each request
// and written before the response is sent, so separate serverless instances stay in sync.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
  status: 'requested' | 'accepted' | 'started' | 'completed' | 'cancelled' | 'declined'
  // Set when an admin assigns a car, driver and time slot (used when the rider's choice is unavailable).
  allocation?: { allocatedAt: string; slotStart: string; slotEnd: string }
  arrivalMin: number | null; createdAt: string; acceptedAt: string | null; startedAt: string | null; completedAt?: string | null
}

// Last known GPS position of each driver (updated by the driver app while a ride is active).
export type Location = { driverId: string; lat: number; lon: number; speed: number; heading: number | null; accuracy: number | null; ts: number; movedAt: number; firstTs: number }

type Key = 'drivers' | 'riders' | 'admins' | 'rides' | 'locations' | 'removed'
const KEYS: Key[] = ['drivers', 'riders', 'admins', 'rides', 'locations', 'removed']
// `removed` lists starter-driver ids an admin has deleted, so they stop appearing in the roster.
type Store = { drivers: DriverAccount[]; riders: Account[]; admins: Account[]; rides: Ride[]; locations: Location[]; removed: string[]; counter: number }

export const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? ''
const sql = DATABASE_URL ? neon(DATABASE_URL) : null
// On Vercel the filesystem is read-only and resets, so a database is mandatory there.
export const missingDatabase = !!process.env.VERCEL && !sql
export const DATA_DIR = path.join(process.cwd(), 'data')
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
    counter: 1,
  }
}
g.__rideops.locations ??= [] // stores created before live tracking existed
g.__rideops.removed ??= []
export const db = g.__rideops

const nextCounter = () => db.rides.reduce((max, r) => Math.max(max, Number(String(r.id).replace(/\D/g, '')) || 0), 0) + 1

// Call at the start of every request: refreshes the in-memory copy from Postgres (no-op for the file store).
export async function sync() {
  if (sql) {
    await (g.__rideopsReady ??= sql`create table if not exists kv (key text primary key, value jsonb not null)`)
    const rows = (await sql`select key, value from kv`) as { key: string; value: unknown }[]
    for (const key of KEYS) (db[key] as unknown[]) = (rows.find((r) => r.key === key)?.value as unknown[]) ?? []
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
  try { writeFileSync(path.join(DATA_DIR, `${key}.json`), JSON.stringify(db[key], null, 2)) } catch (e) { console.log(`Could not save ${key}:`, (e as Error).message) }
}
export const save = {
  drivers: () => persist('drivers'),
  riders: () => persist('riders'),
  admins: () => persist('admins'),
  rides: () => persist('rides'),
  locations: () => persist('locations'),
  removed: () => persist('removed'),
}
// Call before sending the response so serverless functions are not frozen with writes still in flight.
export async function flush() { await Promise.all(pending.splice(0)) }

export const hasSecretFile = () => existsSync(path.join(DATA_DIR, '.secret'))
