// WebSocket link to the realtime server: pushes the driver's GPS every few seconds for the rides in progress.
import { io, type Socket } from 'socket.io-client'
import { getToken } from './api'

export const REALTIME_URL = (import.meta.env.VITE_REALTIME_URL as string | undefined)?.replace(/[/]+$/, '') ?? `http://${window.location.hostname}:4100`

export type Telemetry = { latitude: number; longitude: number; bearing: number | null; speed: number | null }

// One socket per ride: the ride id in the query lets the load balancer send the driver and the rider of that ride to the same replica.
export function connectDriverSocket(rideIds: string[]) {
  const sockets: Socket[] = rideIds.map((rideId) => {
    const socket = io(REALTIME_URL, { auth: { token: getToken() ?? '' }, query: { rideId }, transports: ['websocket'], reconnectionDelayMax: 5000 })
    socket.on('connect', () => socket.emit('join_ride', { rideId }))
    return socket
  })
  return {
    send(t: Telemetry) { sockets.forEach((socket, i) => { if (socket.connected) socket.emit('update_location', { rideId: rideIds[i], ...t }) }) },
    close() { sockets.forEach((socket) => socket.close()) },
  }
}
