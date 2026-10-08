import { useEffect, useRef, useState } from 'react'
import { metresBetween, PUNE } from './geo'
import LocateButton from './LocateButton'
import { fetchPath } from './routing'
import { createMap, type AdMarker, type LL, type MapAdapter } from './mapAdapter'
import type { Coords } from './places'

type Props = {
  pickup?: Coords | null
  destination?: Coords | null
  status: 'requested' | 'accepted' | 'started' | 'cancelled' | 'declined' | 'completed'
  /** 0..1 progress of the driver toward pickup (used only until real GPS arrives). */
  arrivalProgress: number
  /** 0..1 progress of the trip toward the destination (used only until real GPS arrives). */
  tripProgress: number
  /** Real GPS position of the driver (when the driver app is sharing it). Replaces the simulation. */
  live?: { lat: number; lon: number; state: 'moving' | 'stopped' | 'offline' } | null
}

const CAR_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>'

const lerp = (a: LL, b: LL, t: number): LL => ({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t })

function pointAlong(path: LL[], t: number): LL {
  if (path.length < 2) return path[0]
  const lens = path.slice(1).map((p, i) => metresBetween(path[i], p))
  let target = lens.reduce((a, b) => a + b, 0) * Math.min(1, Math.max(0, t))
  for (let i = 0; i < lens.length; i++) {
    if (target <= lens[i] || i === lens.length - 1) return lerp(path[i], path[i + 1], lens[i] ? Math.min(1, target / lens[i]) : 0)
    target -= lens[i]
  }
  return path[path.length - 1]
}

export default function MapView({ pickup, destination, status, arrivalProgress, tripProgress, live }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<MapAdapter | null>(null)
  const car = useRef<AdMarker | null>(null)
  const [ready, setReady] = useState(false)
  const [route, setRoute] = useState<LL[]>([])

  const a: LL | null = pickup ? { lat: pickup.lat, lng: pickup.lon } : null
  const b: LL | null = destination ? { lat: destination.lat, lng: destination.lon } : null
  const aKey = a ? `${a.lat},${a.lng}` : '', bKey = b ? `${b.lat},${b.lng}` : ''

  // Create the map (Google when the key works, OpenStreetMap otherwise).
  useEffect(() => {
    let cancelled = false
    let created: MapAdapter | null = null
    if (!box.current) return
    createMap(box.current, { center: a ?? PUNE, zoom: 13 }).then((m) => {
      if (cancelled) { m.destroy(); return }
      created = m
      map.current = m
      setReady(true)
    })
    return () => { cancelled = true; car.current?.remove(); car.current = null; created?.destroy(); map.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Real driving route (Geoapify, then OSRM); falls back to a straight line.
  useEffect(() => {
    if (!a || !b) return
    const ctrl = new AbortController()
    fetchPath(a, b, ctrl.signal)
      .then(setRoute)
      .catch((e) => { if (e.name !== 'AbortError') setRoute([a, b]) })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aKey, bKey])

  // Pickup, destination and route line.
  useEffect(() => {
    const m = map.current
    if (!ready || !m) return
    const items: { remove: () => void }[] = []
    if (a) items.push(m.addMarker(a, '<span class="mk pick"></span>', 'gm-dot'))
    if (b) items.push(m.addMarker(b, '<span class="mk drop"></span>', 'gm-dot'))
    const path = route.length ? route : a && b ? [a, b] : []
    if (path.length) items.push(m.addLine(path, { color: '#0b63ad', weight: 5, opacity: 0.95 }))
    const pts = [...(a ? [a] : []), ...(b ? [b] : []), ...path]
    if (pts.length > 1) m.fitBounds(pts, 50)
    else if (a) m.setView(a, 15)
    return () => items.forEach((x) => x.remove())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, aKey, bKey, route])

  // The car: real GPS when the driver app reports it, otherwise a simulation until it does.
  useEffect(() => {
    const m = map.current
    if (!ready || !m || !a || (status !== 'accepted' && status !== 'started')) { car.current?.remove(); car.current = null; return }
    const path = route.length ? route : b ? [a, b] : [a]
    const start: LL = { lat: a.lat + 0.012, lng: a.lng + 0.012 }
    const pos: LL = live ? { lat: live.lat, lng: live.lon } : status === 'accepted' ? lerp(start, a, arrivalProgress) : pointAlong(path, tripProgress)
    if (live) m.panIfOutside(pos)
    if (car.current) car.current.setPosition(pos)
    else car.current = m.addMarker(pos, `<span class="mk car">${CAR_SVG}</span>`, 'car-pin')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, status, arrivalProgress, tripProgress, route, aKey, bKey, live?.lat, live?.lon])

  return <><div ref={box} className="gmap-box" role="img" aria-label="Map of your trip" /><LocateButton getMap={() => map.current} /></>
}
