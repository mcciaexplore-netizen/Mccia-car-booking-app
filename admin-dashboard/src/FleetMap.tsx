import { useEffect, useRef, useState } from 'react'
import { metresBetween, PUNE } from './geo'
import LocateButton from './LocateButton'
import { fetchPath } from './routing'
import { createMap, type AdMarker, type AdShape, type LL, type MapAdapter } from './mapAdapter'

type Coords = { lat: number; lon: number }
export type Live = { lat: number; lon: number; speedKmh: number; state: 'moving' | 'stopped' | 'offline'; stoppedForSec: number; ageSec: number }
export type CarGps = { lat: number; lon: number; speedKmh: number; state: 'moving' | 'stopped' | 'offline'; ageSec: number }
export type MapCar = {
  name: string
  plate: string
  status: 'busy' | 'idle'
  depot: Coords
  gps: CarGps | null
  trip: {
    id: string
    phase: string
    progress: number
    etaMin: number | null
    driverName: string
    riderName: string
    pickupCoords: Coords | null
    destinationCoords: Coords | null
    live: Live | null
  } | null
}

const COLORS = ['#0b63ad', '#2fa84f', '#e0a82e', '#c2569b']

// Point at a fraction of the way along a polyline (used only until the driver's GPS reports in).
function along(path: LL[], t: number): LL {
  if (path.length < 2) return path[0]
  const lengths = path.slice(1).map((p, i) => metresBetween(path[i], p))
  let remaining = lengths.reduce((a, b) => a + b, 0) * Math.min(Math.max(t, 0), 1)
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] ? Math.min(remaining / lengths[i], 1) : 0
      return { lat: path[i].lat + (path[i + 1].lat - path[i].lat) * f, lng: path[i].lng + (path[i + 1].lng - path[i].lng) * f }
    }
    remaining -= lengths[i]
  }
  return path[path.length - 1]
}

const mins = (sec: number) => (sec < 60 ? `${Math.max(sec, 1)} s` : `${Math.round(sec / 60)} min`)

type Look = { tone: 'moving' | 'stopped' | 'nosignal' | 'idle' | 'waiting'; label: string }
function lookOf(car: MapCar): Look {
  const trip = car.status === 'busy' ? car.trip : null
  if (trip?.phase === 'reached') return { tone: 'stopped', label: 'Reached destination' }
  // The car's own GPS tracker is the most trustworthy source; fall back to the driver's phone.
  const live = car.gps && car.gps.state !== 'offline' ? car.gps : trip?.live
  if (!trip && car.gps) {
    if (car.gps.state === 'moving') return { tone: 'moving', label: `Moving · ${car.gps.speedKmh} km/h` }
    return car.gps.state === 'stopped' ? { tone: 'idle', label: 'Parked' } : { tone: 'nosignal', label: `No signal · ${mins(car.gps.ageSec)} ago` }
  }
  if (!trip) return { tone: 'idle', label: 'Idle at base' }
  if (!live) return { tone: 'waiting', label: 'Waiting for driver GPS' }
  if (live.state === 'moving') return { tone: 'moving', label: `Moving · ${live.speedKmh} km/h` }
  if (live.state === 'stopped') return { tone: 'stopped', label: 'stoppedForSec' in live ? `Stopped · ${mins(live.stoppedForSec)}` : 'Stopped' }
  return { tone: 'nosignal', label: `No signal · ${mins(live.ageSec)} ago` }
}

const pinHtml = (name: string) => `<div class="fleet-pin-body"><span class="fleet-pin-dot">&#128663;</span><span class="fleet-pin-tag"><b>${name}</b><i></i></span></div>`

type RouteGroup = { tripId: string; shapes: AdShape[] }

export default function FleetMap({ cars, filter, selected, onSelect }: { cars: MapCar[]; filter: string; selected: string; onSelect: (name: string) => void }) {
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const positions = useRef(new Map<string, LL>())
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<MapAdapter | null>(null)
  const markers = useRef(new Map<string, AdMarker>())
  const routeGroups = useRef(new Map<string, RouteGroup>())
  const routes = useRef(new Map<string, LL[]>())
  const fitted = useRef('')
  const [ready, setReady] = useState(false)

  // Create the map (Google when the key works, OpenStreetMap otherwise).
  useEffect(() => {
    let cancelled = false
    let created: MapAdapter | null = null
    const markerStore = markers.current
    const groupStore = routeGroups.current
    if (!box.current) return
    createMap(box.current, { center: PUNE, zoom: 12 }).then((m) => {
      if (cancelled) { m.destroy(); return }
      created = m
      map.current = m
      setReady(true)
    })
    return () => {
      cancelled = true
      markerStore.forEach((m) => m.remove()); markerStore.clear()
      groupStore.forEach((g) => g.shapes.forEach((s) => s.remove())); groupStore.clear()
      created?.destroy(); map.current = null
    }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!ready || !m) return
    let cancelled = false

    async function pathFor(trip: NonNullable<MapCar['trip']>): Promise<LL[]> {
      const cached = routes.current.get(trip.id)
      if (cached) return cached
      const a = trip.pickupCoords
      const b = trip.destinationCoords
      if (!a || !b) return []
      const path = await fetchPath({ lat: a.lat, lng: a.lon }, { lat: b.lat, lng: b.lon })
      routes.current.set(trip.id, path)
      return path
    }

    const clearGroup = (g: RouteGroup) => g.shapes.forEach((s) => s.remove())

    ;(async () => {
      const shown = cars.map((car, index) => ({ car, index })).filter(({ car }) => filter === 'all' || car.name === filter)
      const plans = await Promise.all(shown.map(async ({ car, index }) => {
        const trip = car.status === 'busy' ? car.trip : null
        const path = trip ? await pathFor(trip) : []
        const live = car.gps && car.gps.state !== 'offline' ? car.gps : trip?.live
        // Real GPS wins (car tracker, then driver phone); the simulated position along the route is only a placeholder.
        const position: LL = live ? { lat: live.lat, lng: live.lon } : car.gps ? { lat: car.gps.lat, lng: car.gps.lon } : path.length ? along(path, trip!.progress) : { lat: car.depot.lat, lng: car.depot.lon }
        return { car, color: COLORS[index % COLORS.length], path, position, look: lookOf(car), trip }
      }))
      if (cancelled) return

      // Remove cars that are filtered out or gone.
      const keep = new Set(plans.map((p) => p.car.name))
      for (const [name, marker] of markers.current) if (!keep.has(name)) { marker.remove(); markers.current.delete(name) }
      for (const [name, group] of routeGroups.current) if (!keep.has(name)) { clearGroup(group); routeGroups.current.delete(name) }

      for (const { car, color, path, position, look, trip } of plans) {
        // Route lines are redrawn only when the trip changes.
        const existing = routeGroups.current.get(car.name)
        if (existing && existing.tripId !== (trip?.id ?? '')) { clearGroup(existing); routeGroups.current.delete(car.name) }
        if (trip && path.length && !routeGroups.current.has(car.name)) {
          routeGroups.current.set(car.name, {
            tripId: trip.id,
            shapes: [
              m.addLine(path, { color: '#ffffff', weight: 9, opacity: 0.9 }),
              m.addLine(path, { color, weight: 5, opacity: 0.95 }),
              m.addDot(path[0], { radius: 6, fill: '#ffffff', stroke: color, strokeWidth: 3 }),
              m.addDot(path[path.length - 1], { radius: 7, fill: '#d6453d', stroke: '#ffffff', strokeWidth: 2 }),
            ],
          })
        }

        // One persistent marker per car: it glides to each new GPS fix instead of being recreated.
        let marker = markers.current.get(car.name)
        if (!marker) {
          marker = m.addMarker(position, pinHtml(car.name), 'fleet-pin')
          markers.current.set(car.name, marker)
          const name = car.name
          marker.getElement()?.querySelector('.fleet-pin-body')?.addEventListener('click', () => onSelectRef.current(name))
        } else marker.setPosition(position)
        positions.current.set(car.name, position)
        const el = marker.getElement()
        const dot = el?.querySelector<HTMLElement>('.fleet-pin-dot')
        const tag = el?.querySelector<HTMLElement>('.fleet-pin-tag i')
        if (dot) { dot.dataset.tone = look.tone; dot.style.setProperty('--car', color) }
        if (tag) tag.textContent = look.label
      }

      // Re-fit only when the visible cars or trips change, so the view does not jump on every refresh.
      const signature = `${filter}|${plans.map((p) => `${p.car.name}:${p.trip?.id ?? 'idle'}`).join(',')}`
      if (signature !== fitted.current && plans.length) {
        fitted.current = signature
        m.fitBounds(plans.flatMap((p) => [...p.path, p.position]), 60, 15)
      }
    })()
    return () => { cancelled = true }
  }, [ready, cars, filter])

  // Clicking a car zooms the map to it, then keeps it centred as its live position updates.
  const followed = useRef('')
  useEffect(() => {
    const m = map.current
    if (!ready || !m || !selected) { followed.current = ''; return }
    const at = positions.current.get(selected)
    if (!at) return
    if (followed.current !== selected) { followed.current = selected; m.fitBounds([at], 80, 16) }
    else m.panIfOutside(at)
  }, [ready, cars, selected])

  return <><div ref={box} className="gmap-box" role="img" aria-label="Live map of fleet vehicles in Pune" /><LocateButton getMap={() => map.current} /></>
}
