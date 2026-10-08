// Demo helper: pretends to be a driver phone and "drives" the active ride along its real road route,
// so you can watch the car move (and stop) on the admin map and the rider screen without a GPS device.
//
//   node scripts/simulate-driver.mjs <driver-phone> <password> [api-url] [km/h]
//
// Prerequisite: the driver has an accepted or started ride that has pickup and destination coordinates.
const [phone, password, apiArg, kmhArg] = process.argv.slice(2)
if (!phone || !password) { console.log('Usage: node scripts/simulate-driver.mjs <driver-phone> <password> [api-url] [km/h]'); process.exit(1) }
const API = (apiArg ?? 'http://localhost:4000/api').replace(/\/+$/, '')
const KMH = Number(kmhArg) || 40
const TICK_S = 3

const call = async (path, token, body) => {
  const res = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? res.statusText)
  return data
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rad = Math.PI / 180
const dist = (a, b) => 2 * 6371000 * Math.asin(Math.sqrt(Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2))

const { token, user } = await call('/auth/driver/signin', null, { phone, password })
console.log(`Signed in as ${user.name}. Waiting for an accepted/started ride with coordinates…`)

let ride
while (!ride) {
  ride = (await call('/driver/rides', token)).find((r) => ['accepted', 'started'].includes(r.status) && r.pickupCoords && r.destinationCoords)
  if (!ride) await sleep(3000)
}
console.log(`Driving ${ride.id}: ${ride.pickup.split(',')[0]} -> ${ride.destination.split(',')[0]} at ${KMH} km/h`)

const a = ride.pickupCoords, b = ride.destinationCoords
let path = [a, b]
try {
  const r = await (await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`)).json()
  if (r.routes?.[0]) path = r.routes[0].geometry.coordinates.map(([lon, lat]) => ({ lat, lon }))
} catch { /* straight line */ }

const total = path.slice(1).reduce((s, p, i) => s + dist(path[i], p), 0)
const stepM = (KMH / 3.6) * TICK_S
const stopAt = total / 2 // simulate a traffic-light / pickup stop halfway
let travelled = 0, stoppedFor = 0, idx = 0, segDone = 0

while (travelled < total) {
  const stopping = travelled >= stopAt && stoppedFor < 30
  if (stopping) stoppedFor += TICK_S
  else {
    let left = stepM
    while (left > 0 && idx < path.length - 1) {
      const seg = dist(path[idx], path[idx + 1])
      if (segDone + left >= seg) { left -= seg - segDone; segDone = 0; idx++ } else { segDone += left; left = 0 }
    }
    travelled += stepM
  }
  const p = path[Math.min(idx, path.length - 1)]
  const next = path[Math.min(idx + 1, path.length - 1)]
  const f = idx < path.length - 1 ? segDone / Math.max(dist(p, next), 1) : 0
  const pos = { lat: p.lat + (next.lat - p.lat) * f, lon: p.lon + (next.lon - p.lon) * f }
  const res = await call('/driver/location', token, { ...pos, speed: stopping ? 0 : KMH / 3.6, accuracy: 6 })
  console.log(`${stopping ? 'STOPPED' : 'moving '}  ${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}  -> server says ${res.live?.state} ${res.live?.speedKmh ?? 0} km/h`)
  await sleep(TICK_S * 1000)
}
console.log('Arrived. Press Ctrl+C, or end the trip in the driver app.')
