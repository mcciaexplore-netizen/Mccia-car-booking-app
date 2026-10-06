// Single API entry point for the rider app, driver app and admin dashboard.
import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { checkPw, hashPw, issueToken, newSalt, normEmail, normPhone, phoneKey, readToken } from '@/lib/auth'
import { db, flush, missingDatabase, save, sync, type Account, type Ride } from '@/lib/db'
import {
  ARRIVAL_OPTIONS, CARS, LIVE, deliverOtp, forDriver, forRider, maskEmail, minsFree, newOtp, overview,
  geocode, phoneOf, roster, schedule, tripMinutes, validCoords,
} from '@/lib/dispatch'
import { auth, body, fail, json } from '@/lib/http'

const publicAccount = ({ salt: _s, hash: _h, ...a }: Account) => a
type Ctx = { params: Promise<{ path: string[] }> }

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const p = (await ctx.params).path
  const m = req.method
  const url = new URL(req.url)
  const [a, b, c, d] = p

  if (a === 'health') return json({ ok: true })
  if (a === 'cars' && m === 'GET') return json(CARS.map(({ depot: _d, ...car }) => car))

  if (a === 'availability' && m === 'GET') {
    const s = schedule()
    return json({
      cars: Object.fromEntries(CARS.map((car) => [car.name, minsFree(s, s.carFree[car.name])])),
      drivers: Object.fromEntries(roster().map((dr) => [dr.id, minsFree(s, s.driverFree[dr.id])])),
    })
  }
  if (a === 'drivers' && m === 'GET') return json(roster().map((dr) => ({ id: dr.id, name: dr.name, phone: phoneOf(dr.id), registered: db.drivers.some((x) => x.driverId === dr.id) })))

  /* ----- Auth ----- */
  if (a === 'auth') {
    if (b === 'me' && m === 'GET') {
      const claims = readToken(req)
      if (!claims) return fail('Please sign in again.', 401)
      if (claims.role === 'driver') {
        const dr = roster().find((x) => x.id === claims.id)
        return dr ? json({ role: 'driver', user: { id: dr.id, name: dr.name, phone: phoneOf(dr.id) } }) : fail('Please sign in again.', 401)
      }
      const acct = (claims.role === 'rider' ? db.riders : db.admins).find((x) => x.id === claims.id)
      return acct ? json({ role: claims.role, user: publicAccount(acct) }) : fail('Please sign in again.', 401)
    }
    if ((b === 'rider' || b === 'admin') && m === 'POST' && (c === 'signup' || c === 'signin')) {
      const list = b === 'rider' ? db.riders : db.admins
      const x = await body(req)
      const email = normEmail(x.email)
      const password = String(x.password ?? '')
      if (c === 'signin') {
        const acct = list.find((u) => u.email === email)
        if (!acct || !checkPw(password, acct.salt, acct.hash)) return fail('Incorrect email or password.', 401)
        return json({ token: issueToken(b, acct.id), user: publicAccount(acct) })
      }
      const name = String(x.name ?? '').trim()
      if (name.length < 2) return fail('Enter your full name.')
      if (!/^\S+@\S+\.\S+$/.test(email)) return fail('Enter a valid email address.')
      if (password.length < 6) return fail('Password must be at least 6 characters.')
      if (list.some((u) => u.email === email)) return fail('An account with this email already exists. Try signing in.', 409)
      const salt = newSalt()
      const acct: Account = { id: randomBytes(8).toString('hex'), name, email, phone: normPhone(x.phone), salt, hash: hashPw(password, salt), createdAt: new Date().toISOString() }
      list.push(acct)
      save[b === 'rider' ? 'riders' : 'admins']()
      return json({ token: issueToken(b, acct.id), user: publicAccount(acct) }, 201)
    }
    if (b === 'driver' && c === 'signup' && m === 'POST') {
      const x = await body(req)
      const name = String(x.name ?? '').trim().replace(/\s+/g, ' ')
      const phone = normPhone(x.phone)
      if (name.length < 2) return fail('Enter your full name.')
      if (phone.replace(/\D/g, '').length < 7) return fail('Enter a valid phone number.')
      if (String(x.password ?? '').length < 4) return fail('Password must be at least 4 characters.')
      const existing = roster().find((dr) => dr.name.toLowerCase() === name.toLowerCase())
      if (existing && db.drivers.some((acct) => acct.driverId === existing.id)) return fail('A driver with this name already has an account. Sign in instead, or add a middle name or initial.', 409)
      if (db.drivers.some((acct) => phoneKey(acct.phone) === phoneKey(phone))) return fail('That phone number is already registered.', 409)
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'driver'
      const driver = existing ?? { id: roster().some((dr) => dr.id === slug) ? `${slug}-${randomBytes(2).toString('hex')}` : slug, name }
      const salt = newSalt()
      db.drivers.push({ driverId: driver.id, name: driver.name, phone, salt, hash: hashPw(String(x.password), salt), createdAt: new Date().toISOString() })
      save.drivers()
      return json({ token: issueToken('driver', driver.id), user: { id: driver.id, name: driver.name, phone } }, 201)
    }
    if (b === 'driver' && c === 'signin' && m === 'POST') {
      const x = await body(req)
      const acct = db.drivers.find((u) => phoneKey(u.phone) === phoneKey(x.phone))
      if (!acct || !checkPw(String(x.password ?? ''), acct.salt, acct.hash)) return fail('Incorrect phone number or password.', 401)
      const dr = roster().find((r) => r.id === acct.driverId)!
      return json({ token: issueToken('driver', dr.id), user: { id: dr.id, name: dr.name, phone: acct.phone } })
    }
    return fail('Not found', 404)
  }

  /* ----- Driver ----- */
  if (a === 'driver') {
    const driverId = auth(req, 'driver')
    if (!driverId) return fail('Please sign in again.', 401)
    if (b === 'rides' && !c && m === 'GET') {
      const s = schedule()
      return json(db.rides.filter((r) => r.driverId === driverId).map((r) => forDriver(r, s)).reverse())
    }
    if (b === 'rides' && c && d && m === 'POST') {
      const ride = db.rides.find((r) => r.id === c && r.driverId === driverId)
      if (!ride) return fail('Ride not found', 404)
      if (d === 'decline' || d === 'complete') {
        if (d === 'decline') {
          if (!['requested', 'accepted'].includes(ride.status)) return fail(`Ride is ${ride.status}`, 409)
          ride.status = 'declined'
        } else {
          if (ride.status !== 'started') return fail('Only a trip in progress can be ended.', 409)
          ride.status = 'completed'
          ride.completedAt = new Date().toISOString()
        }
        save.rides()
        return json(forDriver(ride))
      }
      if (d === 'accept') {
        if (ride.status !== 'requested') return fail(`Ride is ${ride.status}`, 409)
        const s = schedule()
        const sl = s.slots[ride.id]
        if (!sl?.ready) return fail(`Not yet: ${sl.blockedBy === 'driver' ? 'you have' : `the ${ride.vehicle} has`} ${sl.position} ride${sl.position > 1 ? 's' : ''} ahead. Slot starts in about ${sl.waitMin} min.`, 409)
        const x = await body(req)
        ride.status = 'accepted'
        ride.arrivalMin = ARRIVAL_OPTIONS.includes(Number(x.arrivalMin)) ? Number(x.arrivalMin) : 10
        ride.acceptedAt = new Date().toISOString()
        save.rides()
        return json(forDriver(ride))
      }
    }
    if (b === 'verify' && m === 'POST') {
      const x = await body(req)
      const otp = String(x.otp ?? '').trim()
      const ride = db.rides.find((r) => r.status === 'accepted' && r.driverId === driverId && r.otp === otp)
      if (!ride) return fail('Invalid PIN. Ask the rider for their 4-digit PIN.')
      ride.status = 'started'
      ride.startedAt = new Date().toISOString()
      save.rides()
      return json(forDriver(ride))
    }
    return fail('Not found', 404)
  }

  /* ----- Admin ----- */
  if (a === 'admin') {
    if (!auth(req, 'admin')) return fail('Admin sign-in required.', 401)
    if (b === 'overview' && m === 'GET') return json(overview())
    // Admins can book on behalf of a walk-in or phone caller. Addresses are looked up so the car shows on the map.
    if (b === 'rides' && !c && m === 'POST') {
      const x = await body(req)
      const driver = roster().find((dr) => dr.id === x.driverId)
      const car = CARS.find((cr) => cr.name === x.car)
      if (!driver || !car || !x.pickup || !x.destination || !x.riderName) return fail('Missing or invalid fields')
      const [pickupCoords, destinationCoords] = await Promise.all([geocode(String(x.pickup)), geocode(String(x.destination))])
      const ride: Ride = {
        id: `RIDE-${String(db.counter++).padStart(4, '0')}`,
        riderName: String(x.riderName), riderEmail: '', phone: String(x.phone ?? ''),
        pickup: String(x.pickup), destination: String(x.destination), pickupCoords, destinationCoords,
        passengers: Math.min(Math.max(Number(x.passengers) || 1, 1), car.seats), pickupTime: '',
        driverId: driver.id, driverName: driver.name, vehicle: car.name, plate: car.plate,
        pickupEtaMin: car.pickupEtaMin, tripMin: tripMinutes(String(x.pickup), String(x.destination)),
        otp: newOtp(), otpDelivery: 'not-configured', emailMasked: '',
        status: 'requested', arrivalMin: null, createdAt: new Date().toISOString(), acceptedAt: null, startedAt: null,
      }
      db.rides.push(ride)
      save.rides()
      return json({ id: ride.id }, 201)
    }
    if (b === 'rides' && c && d && m === 'POST') {
      const ride = db.rides.find((r) => r.id === c)
      if (!ride) return fail('Ride not found', 404)
      if (d === 'complete') {
        if (!LIVE.includes(ride.status)) return fail(`Ride is ${ride.status}`, 409)
        ride.status = 'completed'; ride.completedAt = new Date().toISOString()
      } else if (d === 'cancel') {
        if (!['requested', 'accepted'].includes(ride.status)) return fail(`Ride is ${ride.status}`, 409)
        ride.status = 'cancelled'
      } else return fail('Not found', 404)
      save.rides()
      return json({ ok: true })
    }
    return fail('Not found', 404)
  }

  /* ----- Rider ----- */
  if (a === 'rider') {
    const riderId = auth(req, 'rider')
    const me = riderId ? db.riders.find((r) => r.id === riderId) : undefined
    if (!me) return fail('Please sign in again.', 401)
    if (b === 'rides' && m === 'GET') {
      const s = schedule()
      return json(db.rides.filter((r) => r.riderId === me.id || (r.riderEmail && r.riderEmail.toLowerCase() === me.email)).map((r) => ({ ...forRider(r, s), otp: r.status === 'requested' || r.status === 'accepted' ? r.otp : undefined })).reverse())
    }
    if (b === 'profile' && m === 'PATCH') {
      const x = await body(req)
      me.name = String(x.name ?? me.name).trim() || me.name
      me.phone = normPhone(x.phone ?? me.phone)
      save.riders()
      return json({ user: publicAccount(me) })
    }
    if (b === 'password' && m === 'POST') {
      const x = await body(req)
      if (!checkPw(String(x.current ?? ''), me.salt, me.hash)) return fail('Current password is incorrect.')
      if (String(x.next ?? '').length < 6) return fail('New password must be at least 6 characters.')
      me.salt = newSalt(); me.hash = hashPw(String(x.next), me.salt)
      save.riders()
      return json({ ok: true })
    }
    if (b === 'account' && m === 'DELETE') {
      db.riders.splice(db.riders.indexOf(me), 1)
      save.riders()
      return json({ ok: true })
    }
    return fail('Not found', 404)
  }

  /* ----- Rides (riders book and follow their own trip) ----- */
  if (a === 'rides') {
    const riderId = auth(req, 'rider')
    const me = riderId ? db.riders.find((r) => r.id === riderId) : undefined
    if (!me) return fail('Please sign in again.', 401)
    if (!b && m === 'POST') {
      const x = await body(req)
      const driver = roster().find((dr) => dr.id === x.driverId)
      const car = CARS.find((cr) => cr.name === x.car)
      if (!driver || !car || !x.pickup || !x.destination) return fail('Missing or invalid fields')
      const ride: Ride = {
        id: `RIDE-${String(db.counter++).padStart(4, '0')}`,
        riderId: me.id, riderName: String(x.riderName || me.name), riderEmail: me.email ?? '', phone: String(x.phone || me.phone || ''),
        pickup: String(x.pickup), destination: String(x.destination),
        pickupCoords: validCoords(x.pickupCoords), destinationCoords: validCoords(x.destinationCoords),
        passengers: Math.min(Math.max(Number(x.passengers) || 1, 1), car.seats), pickupTime: String(x.pickupTime ?? ''),
        driverId: driver.id, driverName: driver.name, vehicle: car.name, plate: car.plate,
        pickupEtaMin: car.pickupEtaMin, tripMin: tripMinutes(String(x.pickup), String(x.destination)),
        otp: newOtp(), otpDelivery: 'pending', emailMasked: me.email ? maskEmail(me.email) : '',
        status: 'requested', arrivalMin: null, createdAt: new Date().toISOString(), acceptedAt: null, startedAt: null,
      }
      db.rides.push(ride)
      save.rides()
      await deliverOtp(ride)
      return json(forRider(ride), 201)
    }
    const ride = b ? db.rides.find((r) => r.id === b && (r.riderId === me.id || r.riderEmail.toLowerCase() === me.email)) : undefined
    if (!ride) return fail('Ride not found', 404)
    if (!c && m === 'GET') return json(forRider(ride))
    if (c === 'cancel' && m === 'POST') {
      if (!['requested', 'accepted'].includes(ride.status)) return fail(`Ride is ${ride.status}`, 409)
      ride.status = 'cancelled'
      save.rides()
      return json(forRider(ride))
    }
  }
  void url
  return fail('Not found', 404)
}

// CORS for the three browser apps (any origin: local demo). Tokens travel in the Authorization header, not cookies.
const cors = (res: Response) => {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  return res
}
const wrap = async (req: Request, ctx: Ctx) => {
  if (missingDatabase) return cors(NextResponse.json({ error: 'Server setup incomplete: add a Postgres database (DATABASE_URL) to the backend project on Vercel, then redeploy.' }, { status: 503 }))
  try { await sync(); const res = await handle(req, ctx); await flush(); return cors(res) } catch (e) {
    console.error(e)
    return cors(NextResponse.json({ error: 'Server error' }, { status: 500 }))
  }
}
export const GET = wrap, POST = wrap, PATCH = wrap, DELETE = wrap
export const OPTIONS = async () => cors(new NextResponse(null, { status: 204 }))
export const dynamic = 'force-dynamic'
