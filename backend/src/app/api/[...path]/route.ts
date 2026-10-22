// Single API entry point for the rider app, driver app and admin dashboard.
import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { checkPw, hashPw, issueToken, newSalt, normEmail, normPhone, phoneKey, readToken } from '@/lib/auth'
import { db, flush, missingDatabase, save, sync, type Account, type Ride } from '@/lib/db'
import {
  ARRIVAL_OPTIONS, CARS, LIVE, BOOKED, OPEN, canStartNow, forDriver, forRider, newOtp, overview,
  geocode, liveOf, phoneOf, recordCarGps, recordLocation, roster, tripMinutes, validCoords,
} from '@/lib/dispatch'
import { allocate, availabilityFor, parseRequest } from '@/lib/booking'
import { addNotification, maskEmail, notifyApproved, notifyCancelled, notifyHeld, runReminders } from '@/lib/notify'
import { driverReport, registerDriver, removeDriver, setDriverNotes, setDriverPassword } from '@/lib/drivers'
import { auth, body, fail, json } from '@/lib/http'
import { resolveMapLink } from '@/lib/maplink'

const publicAccount = ({ salt: _s, hash: _h, ...a }: Account) => a
// A car's default driver: '' or unknown ids clear it.
const defaultDriver = (v: unknown) => { const id = String(v ?? '').trim(); return id && roster().some((d) => d.id === id) ? id : undefined }
type Ctx = { params: Promise<{ path: string[] }> }

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const p = (await ctx.params).path
  const m = req.method
  const url = new URL(req.url)
  const [a, b, c, d] = p

  if (a === 'health') return json({ ok: true })
  if (a === 'cars' && m === 'GET') return json(CARS.map(({ depot: _d, defaultDriverId: _dd, ...car }) => car))

  // Used by the realtime (WebSocket) server: which role, if any, may watch this ride's live location.
  if (a === 'realtime' && b === 'access' && c && m === 'GET') {
    const claims = readToken(req)
    if (!claims) return fail('Sign in required.', 401)
    const ride = db.rides.find((r) => r.id === c)
    const ok = claims.role === 'admin' || (!!ride && (claims.role === 'driver' ? ride.driverId === claims.id : ride.riderId === claims.id))
    return ok ? json({ role: claims.role }) : fail('Not allowed.', 403)
  }

  // Car GPS trackers (or the tracking vendor's webhook) post here. Protected by the GPS_API_KEY shared secret.
  // Body: one report or an array, e.g. { "deviceId": "IMEI123", "lat": 18.52, "lon": 73.85, "speed": 42, "heading": 90, "ignition": true, "fuel": 60 }
  if (a === 'gps' && b === 'ingest' && m === 'POST') {
    const key = process.env.GPS_API_KEY ?? ''
    const given = req.headers.get('x-api-key') ?? (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!key) return fail('GPS_API_KEY is not configured on the server.', 503)
    if (given !== key) return fail('Invalid GPS API key.', 401)
    const raw = await req.json().catch(() => null) as unknown
    const reports = (Array.isArray(raw) ? raw : [raw]).filter((r): r is Record<string, unknown> => !!r && typeof r === 'object').slice(0, 200)
    if (!reports.length) return fail('Send a JSON position report.')
    const results = reports.map((r) => recordCarGps(r))
    const bad = results.find((r) => !r.ok)
    if (bad && results.every((r) => !r.ok)) return fail((bad as { error: string }).error, (bad as { status: number }).status)
    return json({ ok: true, accepted: results.filter((r) => r.ok).length, rejected: results.filter((r) => !r.ok).length })
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
    if (b === 'rides' && !c && m === 'GET') return json(db.rides.filter((r) => r.driverId === driverId && BOOKED.concat(['completed', 'cancelled', 'declined']).includes(r.status)).map(forDriver).reverse())
    // Pop-up notifications (new passenger, reminders, cancellations).
    if (b === 'notifications' && !c && m === 'GET') return json(db.notifications.filter((n) => n.role === 'driver' && n.userId === driverId).slice(-40).reverse())
    if (b === 'notifications' && c === 'read' && m === 'POST') {
      const x = await body(req)
      const ids = Array.isArray(x.ids) ? x.ids.map(String) : []
      for (const n of db.notifications) if (n.role === 'driver' && n.userId === driverId && (x.all === true || ids.includes(n.id))) n.read = true
      save.notifications()
      return json({ ok: true })
    }
    if (b === 'rides' && c && d && m === 'POST') {
      const ride = db.rides.find((r) => r.id === c && r.driverId === driverId)
      if (!ride) return fail('Ride not found', 404)
      if (d === 'complete') {
        if (ride.status !== 'started') return fail('Only a trip in progress can be ended.', 409)
        ride.status = 'completed'
        ride.completedAt = new Date().toISOString()
        save.rides()
        return json(forDriver(ride))
      }
      if (d === 'decline') {
        // The driver cannot take an assigned ride: it goes back to the admin's queue to be given to someone else.
        if (ride.status !== 'approved') return fail(`Ride is ${ride.status}`, 409)
        ride.returnedNote = `${ride.driverName} could not take this ride`
        ride.status = 'requested'
        ride.driverId = ''; ride.driverName = ''; ride.vehicle = ''; ride.plate = ''; ride.approvedAt = null
        save.rides()
        return json({ ok: true })
      }
      if (d === 'accept') {
        // "Start heading to pickup" for an assigned ride.
        if (ride.status !== 'approved') return fail(`Ride is ${ride.status}`, 409)
        if (!canStartNow(ride)) return fail('This ride starts later. You can start it 30 minutes before the pickup time.', 409)
        if (db.rides.some((r) => r.driverId === driverId && LIVE.includes(r.status))) return fail('Finish your current trip first.', 409)
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
    // Fleet: add, edit and remove cars. The car name is what riders pick and what rides are keyed on.
    if (b === 'cars' && !c && m === 'POST') {
      const x = await body(req)
      const name = String(x.name ?? '').trim()
      const plate = String(x.plate ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
      const seats = Math.floor(Number(x.seats))
      if (!name || !plate) return fail('Car name and car number are required.')
      if (!(seats >= 1 && seats <= 20)) return fail('Passenger seats must be between 1 and 20.')
      if (CARS.some((cr) => cr.name.toLowerCase() === name.toLowerCase())) return fail('A car with this name already exists.', 409)
      if (CARS.some((cr) => cr.plate === plate)) return fail('A car with this number already exists.', 409)
      const year = Math.floor(Number(x.year))
      const eta = Math.floor(Number(x.pickupEtaMin))
      CARS.push({
        name, plate, seats, pickupEtaMin: eta >= 1 && eta <= 180 ? eta : 20, depot: validCoords(x.depot) ?? { lat: 18.5204, lon: 73.8567 },
        model: String(x.model ?? '').trim() || undefined, color: String(x.color ?? '').trim() || undefined, fuel: String(x.fuel ?? '').trim() || undefined,
        year: year >= 1990 && year <= 2100 ? year : undefined, notes: String(x.notes ?? '').trim() || undefined, gpsId: String(x.gpsId ?? '').trim() || undefined,
        defaultDriverId: defaultDriver(x.defaultDriverId),
      })
      save.cars()
      return json({ ok: true }, 201)
    }
    if (b === 'cars' && c && m === 'PATCH') {
      const car = CARS.find((cr) => cr.name === decodeURIComponent(c))
      if (!car) return fail('Car not found.', 404)
      const x = await body(req)
      const name = String(x.name ?? car.name).trim()
      const plate = String(x.plate ?? car.plate).trim().toUpperCase().replace(/\s+/g, ' ')
      const seats = x.seats === undefined ? car.seats : Math.floor(Number(x.seats))
      if (!name || !plate) return fail('Car name and car number are required.')
      if (!(seats >= 1 && seats <= 20)) return fail('Passenger seats must be between 1 and 20.')
      if (CARS.some((cr) => cr !== car && cr.name.toLowerCase() === name.toLowerCase())) return fail('A car with this name already exists.', 409)
      if (CARS.some((cr) => cr !== car && cr.plate === plate)) return fail('A car with this number already exists.', 409)
      const open = db.rides.filter((r) => r.vehicle === car.name && ['requested', 'accepted', 'started'].includes(r.status))
      if (open.length && seats < Math.max(...open.map((r) => r.passengers))) return fail('An open ride has more passengers than that.', 409)
      const opt = (k: string, cur?: string) => (x[k] === undefined ? cur : String(x[k]).trim() || undefined)
      const year = x[ 'year' ] === undefined ? car.year : Math.floor(Number(x.year))
      const eta = x.pickupEtaMin === undefined ? car.pickupEtaMin : Math.floor(Number(x.pickupEtaMin))
      const oldName = car.name
      const oldPlate = car.plate
      Object.assign(car, {
        name, plate, seats, gpsId: opt('gpsId', car.gpsId), model: opt('model', car.model), color: opt('color', car.color), fuel: opt('fuel', car.fuel), notes: opt('notes', car.notes),
        year: year && year >= 1990 && year <= 2100 ? year : undefined, pickupEtaMin: eta >= 1 && eta <= 180 ? eta : car.pickupEtaMin,
        defaultDriverId: x.defaultDriverId === undefined ? car.defaultDriverId : defaultDriver(x.defaultDriverId),
      })
      // Rides are keyed on the car name and number, so keep them in step.
      for (const ride of db.rides) if (ride.vehicle === oldName) { ride.vehicle = name; ride.plate = plate }
      for (const g of db.carGps) if (g.plate === oldPlate) g.plate = plate
      save.cars(); save.rides(); save.carGps()
      return json({ ok: true })
    }
    if (b === 'cars' && c && m === 'DELETE') {
      const i = CARS.findIndex((cr) => cr.name === decodeURIComponent(c))
      if (i < 0) return fail('Car not found.', 404)
      if (CARS.length <= 1) return fail('Keep at least one car.')
      if (db.rides.some((r) => r.vehicle === CARS[i].name && ['requested', 'accepted', 'started'].includes(r.status))) return fail('This car has open rides. Finish or cancel them first.', 409)
      CARS.splice(i, 1)
      save.cars()
      return json({ ok: true })
    }
    // Driver activity (CRM): add, annotate and delete drivers.
    if (b === 'drivers' && !c && m === 'POST') {
      const made = registerDriver(await body(req), true)
      return made.ok ? json({ driver: made.value }, 201) : fail(made.error, made.status)
    }
    if (b === 'drivers' && c && d === 'password' && m === 'POST') {
      const x = await body(req)
      const done = setDriverPassword(c, String(x.password ?? ''))
      return done.ok ? json({ ok: true }) : fail(done.error, done.status)
    }
    if (b === 'drivers' && c && m === 'PATCH') {
      const x = await body(req)
      return setDriverNotes(c, String(x.notes ?? '')) ? json({ ok: true }) : fail('Driver not found or not signed up yet.', 404)
    }
    if (b === 'drivers' && c && m === 'DELETE') {
      const gone = removeDriver(c)
      return gone.ok ? json({ ok: true, declinedRequests: gone.value.declined }) : fail(gone.error, gone.status)
    }
    // The request queue: approve (assigns a car and a driver), hold, cancel.
    if (b === 'rides' && c && d === 'options' && m === 'GET') {
      const ride = db.rides.find((r) => r.id === c)
      return ride ? json(availabilityFor(ride)) : fail('Ride not found', 404)
    }
    // Admins can book on behalf of a walk-in or phone caller: the admin picks the car and driver, so it is approved straight away.
    if (b === 'rides' && !c && m === 'POST') {
      const x = await body(req)
      if (!x.riderName) return fail('Enter the rider name.')
      const parsed = parseRequest(x)
      if (!parsed.ok) return fail(parsed.error, parsed.status)
      const [pickupCoords, destinationCoords] = await Promise.all([parsed.value.pickupCoords ?? geocode(parsed.value.pickup).then((c) => c), parsed.value.destinationCoords ?? geocode(parsed.value.destination).then((c) => c)])
      const ride: Ride = {
        id: `RIDE-${String(db.counter++).padStart(4, '0')}`,
        riderName: String(x.riderName), riderEmail: '', phone: String(x.phone ?? ''),
        ...parsed.value, pickupCoords, destinationCoords, pickupTime: '',
        driverId: '', driverName: '', vehicle: '', plate: '', pickupEtaMin: 20,
        otp: newOtp(), otpDelivery: 'not-configured', emailMasked: '',
        status: 'requested', arrivalMin: null, createdAt: new Date().toISOString(), acceptedAt: null, startedAt: null,
      }
      const done = allocate(ride, x)
      if (!done.ok) { db.counter--; return fail(done.error, done.status) }
      db.rides.push(ride)
      save.rides()
      await notifyApproved(ride)
      return json({ id: ride.id }, 201)
    }
    if (b === 'rides' && c && d && m === 'POST') {
      const ride = db.rides.find((r) => r.id === c)
      if (!ride) return fail('Ride not found', 404)
      const x = await body(req)
      if (d === 'approve') {
        const done = allocate(ride, x)
        if (!done.ok) return fail(done.error, done.status)
        save.rides()
        await notifyApproved(ride)
        return json({ ok: true })
      }
      if (d === 'hold') {
        if (ride.status !== 'requested') return fail(`Ride is ${ride.status}. Only new requests can be put on hold.`, 409)
        ride.status = 'held'
        ride.holdNote = String(x.note ?? '').trim().slice(0, 300)
        save.rides()
        await notifyHeld(ride)
        return json({ ok: true })
      }
      if (d === 'cancel') {
        if (!['requested', 'held', 'approved', 'accepted'].includes(ride.status)) return fail(`Ride is ${ride.status}`, 409)
        ride.status = 'cancelled'
        ride.cancelledBy = 'admin'
        ride.cancelReason = String(x.reason ?? '').trim().slice(0, 300)
        save.rides()
        await notifyCancelled(ride)
        return json({ ok: true })
      }
      if (d === 'complete') {
        if (!LIVE.includes(ride.status)) return fail(`Ride is ${ride.status}`, 409)
        ride.status = 'completed'; ride.completedAt = new Date().toISOString()
        save.rides()
        return json({ ok: true })
      }
      return fail('Not found', 404)
    }
    return fail('Not found', 404)
  }

  /* ----- Rider ----- */
  if (a === 'rider') {
    const riderId = auth(req, 'rider')
    const me = riderId ? db.riders.find((r) => r.id === riderId) : undefined
    if (!me) return fail('Please sign in again.', 401)
    if (b === 'rides' && m === 'GET') {
      return json(db.rides.filter((r) => r.riderId === me.id || (r.riderEmail && r.riderEmail.toLowerCase() === me.email)).map(forRider).reverse())
    }
    // Pop-up notifications: "Request approved, driver assigned", reminders, holds and cancellations.
    if (b === 'notifications' && !c && m === 'GET') return json(db.notifications.filter((n) => n.role === 'rider' && n.userId === me.id).slice(-40).reverse())
    if (b === 'notifications' && c === 'read' && m === 'POST') {
      const x = await body(req)
      const ids = Array.isArray(x.ids) ? x.ids.map(String) : []
      for (const n of db.notifications) if (n.role === 'rider' && n.userId === me.id && (x.all === true || ids.includes(n.id))) n.read = true
      save.notifications()
      return json({ ok: true })
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
    // A Google Maps link pasted into From / To: returns the place's coordinates (and name when the link has one).
    if (b === 'maplink' && m === 'POST') {
      const x = await body(req)
      const found = await resolveMapLink(String(x.url ?? ''))
      return found.ok ? json(found.value) : fail(found.error, 422)
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
      const parsed = parseRequest(x)
      if (!parsed.ok) return fail(parsed.error, parsed.status)
      if (db.rides.filter((r) => r.riderId === me.id && ['requested', 'held'].includes(r.status)).length >= 5) return fail('You already have 5 requests waiting for approval.', 429)
      const ride: Ride = {
        id: `RIDE-${String(db.counter++).padStart(4, '0')}`,
        riderId: me.id, riderName: String(x.riderName || me.name), riderEmail: me.email ?? '', phone: String(x.phone || me.phone || ''),
        ...parsed.value, pickupTime: '',
        driverId: '', driverName: '', vehicle: '', plate: '', pickupEtaMin: 20, // the admin assigns the car and driver on approval
        otp: newOtp(), otpDelivery: 'pending', emailMasked: me.email ? maskEmail(me.email) : '',
        status: 'requested', arrivalMin: null, createdAt: new Date().toISOString(), acceptedAt: null, startedAt: null,
      }
      db.rides.push(ride)
      save.rides()
      return json(forRider(ride), 201)
    }
    const ride = b ? db.rides.find((r) => r.id === b && (r.riderId === me.id || r.riderEmail.toLowerCase() === me.email)) : undefined
    if (!ride) return fail('Ride not found', 404)
    if (!c && m === 'GET') return json(forRider(ride))
    if (c === 'cancel' && m === 'POST') {
      if (!['requested', 'held', 'approved'].includes(ride.status)) return fail(`Ride is ${ride.status}. It can no longer be cancelled here. Call your driver.`, 409)
      const driverId = ride.driverId
      ride.status = 'cancelled'
      ride.cancelledBy = 'rider'
      save.rides()
      if (driverId) await notifyCancelled(ride)
      return json({ ok: true })
    }
  }
  void url
  return fail('Not found', 404)
}

// CORS for the three browser apps. Set ALLOWED_ORIGINS (comma separated, e.g. https://admin.example.com,https://app.example.com)
// in production; unset allows any origin (local demo). Tokens travel in the Authorization header, not cookies.
const ALLOWED = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean)
const INSTANCE = process.env.INSTANCE_ID ?? process.env.HOSTNAME ?? `pid-${process.pid}`
const cors = (res: Response, req?: Request) => {
  const origin = req?.headers.get('origin') ?? ''
  if (!ALLOWED.length) res.headers.set('Access-Control-Allow-Origin', '*')
  else if (ALLOWED.includes(origin)) { res.headers.set('Access-Control-Allow-Origin', origin); res.headers.set('Vary', 'Origin') }
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.headers.set('X-Instance', INSTANCE) // which replica answered (visible through the load balancer)
  return res
}

// Brute-force guard for sign-in and sign-up: at most 12 attempts per client address every 5 minutes (per instance).
const attempts = new Map<string, { n: number; reset: number }>()
function tooManyAttempts(req: Request, path: string[]) {
  if (path[0] !== 'auth' || req.method !== 'POST') return false
  const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'local').split(',')[0].trim()
  const key = `${ip}|${path.join('/')}`
  const now = Date.now()
  if (attempts.size > 5000) for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k)
  const hit = attempts.get(key)
  if (!hit || hit.reset < now) { attempts.set(key, { n: 1, reset: now + 5 * 60_000 }); return false }
  return ++hit.n > 12
}

const wrap = async (req: Request, ctx: Ctx) => {
  if (missingDatabase) return cors(NextResponse.json({ error: 'Server setup incomplete: add a Postgres database (DATABASE_URL) to the backend project on Vercel, then redeploy.' }, { status: 503 }), req)
  try {
    if (tooManyAttempts(req, (await ctx.params).path)) return cors(NextResponse.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 }), req)
    await sync(); runReminders(); const res = await handle(req, ctx); await flush(); return cors(res, req)
  } catch (e) {
    console.error(e)
    return cors(NextResponse.json({ error: 'Server error' }, { status: 500 }), req)
  }
}
export const GET = wrap, POST = wrap, PATCH = wrap, DELETE = wrap
export const OPTIONS = async (req: Request) => cors(new NextResponse(null, { status: 204 }), req)
export const dynamic = 'force-dynamic'
