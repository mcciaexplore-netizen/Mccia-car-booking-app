// Creates demo accounts and a started trip so the live map has something to show.
//   node scripts/demo-setup.mjs [api-url]
// Then run:  node scripts/simulate-driver.mjs 9000000001 demo1234 [api-url] 40
const API = (process.argv[2] ?? 'http://localhost:4000/api').replace(/\/+$/, '')
const call = async (path, token, body) => {
  const res = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}
const sign = async (kind, up, inn) => {
  const r = await call(`/auth/${kind}/signup`, null, up)
  return r.status === 201 ? r.data : (await call(`/auth/${kind}/signin`, null, inn)).data
}

const admin = await sign('admin', { name: 'Demo Admin', email: 'demo-admin@mccia.test', password: 'demo1234' }, { email: 'demo-admin@mccia.test', password: 'demo1234' })
const rider = await sign('rider', { name: 'Demo Rider', email: 'demo-rider@mccia.test', phone: '9000000002', password: 'demo1234' }, { email: 'demo-rider@mccia.test', password: 'demo1234' })
const driver = await sign('driver', { name: 'Demo Driver', phone: '9000000001', password: 'demo1234' }, { phone: '9000000001', password: 'demo1234' })

const overview = (await call('/admin/overview', admin.token)).data
const busyMine = overview.trips.find((t) => t.driverId === driver.user.id)
let rideId = busyMine?.id
if (!rideId) {
  const car = overview.cars.find((c) => c.status === 'idle')?.name
  if (!car) { console.log('Both cars are busy with other trips. Finish or cancel them first.'); process.exit(1) }
  const ride = (await call('/rides', rider.token, {
    driverId: driver.user.id, car, passengers: 3,
    pickup: 'Shivajinagar, Pune', destination: 'Hadapsar, Pune',
    pickupCoords: { lat: 18.5308, lon: 73.8475 }, destinationCoords: { lat: 18.5089, lon: 73.9259 },
  })).data
  await call(`/driver/rides/${ride.id}/accept`, driver.token, { arrivalMin: 5 })
  await call('/driver/verify', driver.token, { otp: (await call(`/rides/${ride.id}`, rider.token)).data.otp })
  rideId = ride.id
}
console.log(`Trip ${rideId} is in progress.\n\nSign in with:\n  Admin  demo-admin@mccia.test / demo1234\n  Rider  demo-rider@mccia.test / demo1234\n  Driver 9000000001 / demo1234`)
