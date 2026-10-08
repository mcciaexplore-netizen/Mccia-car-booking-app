// Single API entry point for the rider app, driver app and admin dashboard.
import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { checkPw, hashPw, issueToken, newSalt, normEmail, normPhone, phoneKey, readToken } from '@/lib/auth'
import { db, flush, missingDatabase, save, sync, type Account, type Ride } from '@/lib/db'
import {
  ALLOC_GRACE_MIN, ARRIVAL_OPTIONS, CARS, LIVE, slotLengthMin, windowConflict, deliverOtp, forDriver, forRider, maskEmail, minsFree, newOtp, overview,
  geocode, liveOf, phoneOf, recordLocation, roster, schedule, tripMinutes, validCoords,
} from '@/lib/dispatch'
import { driverReport, registerDriver, removeDriver, setDriverNotes } from '@/lib/drivers'
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
      const made = registerDriver(await body(req))
      if (!made.ok) return fail(made.error, made.status)
      return json({ token: issueToken('driver', made.value.id), user: made.value }, 201)
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
    if (!driverId || !roster().some((d) => d.id === driverId)) return fail('Please sign in again.', 401)
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
        if (!sl?.ready) return fail(sl.blockedBy === 'slot'
          ? `This ride is scheduled for ${new Date(sl.startAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}. You can accept it ${ALLOC_GRACE_MIN} minutes before.`
          : `Not yet: ${sl.blockedBy === 'driver' ? 'you have' : `the ${ride.vehicle} has`} ${sl.position} ride${sl.position > 1 ? 's' : ''} ahead. Slot starts in about ${sl.waitMin} min.`, 409)
        const x = await body(req)
        ride.status = 'accepted'
        ride.arrivalMin = ARRIVAL_OPTIONS.includes(Number(x.arrivalMin)) ? Number(x.arrivalMin) : 10
        ride.acceptedAt = new Date().toISOString()
        save.rides()
        return json(forDriver(ride))
      }
    }
    // The driver phone reports its GPS position while a ride is active.
    if (b === 'location' && m === 'POST') {
      const x = await body(req)
      const lat = Number(x.lat), lon = Number(x.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return fail('Invalid position')
      return json({ ok: true, live: recordLocation(driverId, { lat, lon, speed: x.speed, heading: x.heading, accuracy: x.accuracy }) })
    }
    if (b === 'location' && m === 'GET') return json({ live: liveOf(driverId) })
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
    const adminId = auth(req, 'admin')
    const me = adminId ? db.admins.find((x) => x.id === adminId) : undefined
    if (!me) return fail('Admin sign-in required.', 401)
    // Admins change their own password (they must know the current one).
    if (b === 'password' && m === 'POST') {
      const x = await body(req)
      if (!checkPw(String(x.current ?? ''), me.salt, me.hash)) return fail('Current password is incorrect.')
      const next = String(x.next ?? '')
      if (next.length < 6) return fail('New password must be at least 6 characters.')
      if (next === String(x.current)) return fail('Choose a password different from the current one.')
      me.salt = newSalt(); me.hash = hashPw(next, me.salt)
      save.admins()
      return json({ ok: true })
    }
    if (b === 'overview' && m === 'GET') return json({ ...overview(), drivers: driverReport() })
    // Driver activity (CRM): add, annotate and delete drivers.
    if (b === 'drivers' && !c && m === 'POST') {
      const made = registerDriver(await body(req), true)
      return made.ok ? json({ driver: made.value }, 201) : fail(made.error, made.status)
    }
    if (b === 'drivers' && c && m === 'PATCH') {
      const x = await body(req)
      return setDriverNotes(c, String(x.notes ?? '')) ? json({ ok: true }) : fail('Driver not found or not signed up yet.', 404)
    }
    if (b === 'drivers' && c && m === 'DELETE') {
      const gone = removeDriver(c)
      return gone.ok ? json({ ok: true, declinedRequests: gone.value.declined }) : fail(gone.error, gone.status)
    }
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
    if (b === 'rides' && c && d === 'allocate' && m === 'POST') {
      // The rider's driver or car is unavailable: the admin assigns a car, a driver and a time slot.
      const ride = db.rides.find((r) => r.id === c)
      if (!ride) return fail('Ride not found', 404)
      if (ride.status !== 'requested') return fail(`Ride is ${ride.status}. Only waiting requests can be allocated.`, 409)
      const x = await body(req)
      const car = CARS.find((cr) => cr.name === x.car)
      const driver = roster().find((dr) => dr.id === x.driverId)
      if (!car) return fail('Choose a car.')
      if (!driver) return fail('Choose a driver.')
      if (!db.drivers.some((a) => a.driverId === driver.id)) return fail(`${driver.name} has not signed up in the driver app yet.`)
      const startMs = new Date(String(x.slotStart ?? '')).getTime()
      if (!Number.isFinite(startMs)) return fail('Choose a time slot.')
      if (startMs < Date.now() - 10 * 60_000) return fail('That time slot is in the past.')
      if (startMs > Date.now() + 14 * 24 * 3_600_000) return fail('Choose a slot within the next 14 days.')
      if (ride.passengers > car.seats) return fail(`${car.name} seats ${car.seats} and this booking has ${ride.passengers} riders.`)
      const endMs = startMs + slotLengthMin(ride.tripMin) * 60_000
      const clash = windowConflict(ride.id, car.name, driver.id, startMs, endMs)
      if (clash) return fail(`${clash.what} is already booked from ${new Date(clash.from).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} to ${new Date(clash.to).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} (${clash.ride.riderName}). Pick another slot.`, 409)
      ride.vehicle = car.name
      ride.plate = car.plate
      ride.pickupEtaMin = car.pickupEtaMin
      ride.driverId = driver.id
      ride.driverName = driver.name
      ride.allocation = { allocatedAt: new Date().toISOString(), slotStart: new Date(startMs).toISOString(), slotEnd: new Date(endMs).toISOString() }
      save.rides()
      return json({ ok: true, allocation: ride.allocation })
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
