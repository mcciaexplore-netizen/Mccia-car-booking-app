// Subscribes to the driver's live GPS (WebSocket) for one ride. Returns the latest fix, or null until one arrives.
import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { getToken } from './api'

const REALTIME_URL = (import.meta.env.VITE_REALTIME_URL as string | undefined)?.replace(/[/]+$/, '') ?? `http://${window.location.hostname}:4100`

export type LiveFix = { lat: number; lon: number; bearing: number | null; speed: number | null; ts: number }

export function useLiveDriver(rideId: string, enabled: boolean): LiveFix | null {
  const [fix, setFix] = useState<LiveFix | null>(null)
  useEffect(() => {
    if (!enabled) return
    const socket = io(REALTIME_URL, { auth: { token: getToken() ?? '' }, query: { rideId }, transports: ['websocket'], reconnectionDelayMax: 5000 })
    socket.on('connect', () => socket.emit('join_ride', { rideId }))
    socket.on('driver_location_changed', (f: LiveFix) => setFix(f))
    return () => { socket.close(); setFix(null) }
  }, [rideId, enabled])
  return fix
}
