// Live tracking over WebSockets: the driver app pushes GPS every 2-3 s, this server relays it to the rider in that
// ride's room. No map API is involved, so tracking costs nothing per update. Access is checked against the backend
// (same signed login token), so only the ride's rider, its driver and admins can join a ride room.
import http from 'node:http'
import { Server } from 'socket.io'

const PORT = Number(process.env.PORT ?? 4100)
const API = (process.env.API_URL ?? 'http://localhost:4000/api').replace(/\/+$/, '')
const ORIGINS = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true

const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return }
  res.writeHead(404); res.end()
})
const io = new Server(server, { cors: { origin: ORIGINS } })

const lastFix = new Map() // rideId -> latest telemetry, so a rider who opens the trip mid-drive sees the car at once

async function roleFor(token, rideId) {
  try {
    const res = await fetch(`${API}/realtime/access/${encodeURIComponent(rideId)}`, { headers: { Authorization: `Bearer ${token}` } })
    return res.ok ? (await res.json()).role : null
  } catch { return null }
}

io.on('connection', (socket) => {
  const token = String(socket.handshake.auth?.token ?? '')
  const roles = new Map() // rideId -> 'rider' | 'driver' | 'admin' for rides this socket joined

  socket.on('join_ride', async ({ rideId } = {}, ack) => {
    const role = rideId ? await roleFor(token, String(rideId)) : null
    if (!role) return ack?.({ ok: false })
    roles.set(String(rideId), role)
    socket.join(String(rideId))
    const last = lastFix.get(String(rideId))
    if (last) socket.emit('driver_location_changed', last)
    ack?.({ ok: true, role })
  })

  socket.on('leave_ride', ({ rideId } = {}) => { roles.delete(String(rideId)); socket.leave(String(rideId)) })

  socket.on('update_location', (t = {}) => {
    const rideId = String(t.rideId ?? '')
    if (roles.get(rideId) !== 'driver') return
    const lat = Number(t.latitude), lon = Number(t.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return
    const fix = {
      rideId, lat, lon,
      bearing: Number.isFinite(Number(t.bearing)) && t.bearing !== null ? Number(t.bearing) : null,
      speed: Number.isFinite(Number(t.speed)) && t.speed !== null ? Number(t.speed) : null,
      ts: Date.now(),
    }
    lastFix.set(rideId, fix)
    io.to(rideId).emit('driver_location_changed', fix)
  })
})

server.listen(PORT, () => console.log(`RideOps realtime server on :${PORT} (backend ${API})`))
