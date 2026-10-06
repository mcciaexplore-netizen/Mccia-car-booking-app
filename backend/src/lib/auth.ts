// Signed bearer tokens (HMAC-SHA256, 7 days) for riders, drivers and admins. Passwords are scrypt-hashed.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DATA_DIR, DATABASE_URL } from './db'

export type Role = 'rider' | 'driver' | 'admin'
export type Claims = { role: Role; id: string; exp: number }

let cached: string | undefined
// AUTH_SECRET is required in production (Vercel). Locally a secret is generated once into data/.secret.
function secret() {
  if (cached) return cached
  if (process.env.AUTH_SECRET) return (cached = process.env.AUTH_SECRET)
  // No AUTH_SECRET set: derive a stable one from the private database URL so deployments still work.
  if (DATABASE_URL) return (cached = createHmac('sha256', 'mccia-cabs').update(DATABASE_URL).digest('hex'))
  if (process.env.NODE_ENV === 'production') throw new Error('Set the AUTH_SECRET environment variable.')
  const file = path.join(DATA_DIR, '.secret')
  try { return (cached = readFileSync(file, 'utf8')) } catch {
    cached = randomBytes(32).toString('hex')
    try { writeFileSync(file, cached) } catch { /* read-only filesystem */ }
    return cached
  }
}
const TTL_MS = 7 * 24 * 60 * 60 * 1000

const sign = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url')

export function issueToken(role: Role, id: string) {
  const body = Buffer.from(JSON.stringify({ role, id, exp: Date.now() + TTL_MS } satisfies Claims)).toString('base64url')
  return `${body}.${sign(body)}`
}

export function readToken(req: Request): Claims | null {
  const raw = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '')
  const [body, sig] = raw.split('.')
  if (!body || !sig) return null
  const expected = sign(body)
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as Claims
    return claims.exp > Date.now() ? claims : null
  } catch { return null }
}

export const newSalt = () => randomBytes(16).toString('hex')
export const hashPw = (pw: string, salt: string) => scryptSync(pw, salt, 32).toString('hex')
export const checkPw = (pw: string, salt: string, hash: string) => {
  const a = Buffer.from(hashPw(pw, salt))
  const b = Buffer.from(hash)
  return a.length === b.length && timingSafeEqual(a, b)
}
export const normEmail = (e: unknown) => String(e ?? '').trim().toLowerCase()
export const normPhone = (p: unknown) => String(p ?? '').replace(/[^+\d]/g, '')
export const phoneKey = (p: unknown) => String(p ?? '').replace(/\D/g, '').slice(-10)
