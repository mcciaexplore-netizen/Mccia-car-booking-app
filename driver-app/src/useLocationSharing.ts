import { useEffect, useRef, useState } from 'react'
import { api } from './api'

type Base = {
  status: 'off' | 'asking' | 'on' | 'denied' | 'unavailable'
  state: 'moving' | 'stopped' | null
  speedKmh: number
  accuracy: number | null
}
// The phone's own latest GPS reading (for the full-screen navigation map).
export type Position = { lat: number; lon: number; heading: number | null; speedKmh: number | null; accuracy: number | null }
export type Sharing = Base & { fix: Position | null }

type Fix = { lat: number; lon: number; speed: number | null; heading: number | null; accuracy: number | null; at: number }

const SEND_EVERY_MS = 3000

// Shares the phone's GPS position with the backend while `active` is true (a ride is accepted or started).
// The latest fix is re-sent every few seconds even when parked, so "stopped" is never confused with "no signal".
export function useLocationSharing(active: boolean): Sharing {
  const [sharing, setSharing] = useState<Base>({ status: 'off', state: null, speedKmh: 0, accuracy: null })
  const [fix, setFix] = useState<Position | null>(null)
  const lastShown = useRef(0)
  const latest = useRef<Fix | null>(null)

  useEffect(() => {
    if (!active) { latest.current = null; queueMicrotask(() => setFix(null)); return }
    if (!('geolocation' in navigator)) { queueMicrotask(() => setSharing({ status: 'unavailable', state: null, speedKmh: 0, accuracy: null })); return }
    queueMicrotask(() => setSharing((s) => (s.status === 'on' ? s : { ...s, status: 'asking' })))

    let alive = true
    let sending = false
    let wake: { release: () => Promise<void> } | null = null

    async function send() {
      const fix = latest.current
      if (!fix || sending || Date.now() - fix.at > 60_000) return
      sending = true
      try {
        const res = await api<{ live: { state: 'moving' | 'stopped' | 'offline'; speedKmh: number } | null }>('/driver/location', {
          body: { lat: fix.lat, lon: fix.lon, speed: fix.speed, heading: fix.heading, accuracy: fix.accuracy },
        })
        if (alive && res.live) setSharing({ status: 'on', state: res.live.state === 'moving' ? 'moving' : 'stopped', speedKmh: res.live.speedKmh, accuracy: fix.accuracy })
      } catch { /* offline: try again on the next tick */ }
      sending = false
    }

    const watch = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const first = latest.current === null
        latest.current = { lat: coords.latitude, lon: coords.longitude, speed: coords.speed, heading: coords.heading, accuracy: coords.accuracy, at: Date.now() }
        if (Date.now() - lastShown.current > 900) {
          lastShown.current = Date.now()
          setFix({ lat: coords.latitude, lon: coords.longitude, heading: coords.heading, speedKmh: coords.speed === null ? null : Math.round(coords.speed * 3.6), accuracy: coords.accuracy })
        }
        if (first) void send()
      },
      (err) => {
        if (!alive) return
        setSharing({ status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable', state: null, speedKmh: 0, accuracy: null })
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20_000 },
    )
    const timer = window.setInterval(send, SEND_EVERY_MS)

    // Keep the screen on so the browser keeps delivering GPS updates while driving.
    const keepAwake = async () => {
      try { wake = await (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null } catch { /* not supported */ }
    }
    void keepAwake()
    const onVisible = () => { if (document.visibilityState === 'visible') void keepAwake() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      alive = false
      navigator.geolocation.clearWatch(watch)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      void wake?.release().catch(() => undefined)
    }
  }, [active])

  return active ? { ...sharing, fix } : { status: 'off', state: null, speedKmh: 0, accuracy: null, fix: null }
}
