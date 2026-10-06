import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Coords } from './places'

type Props = {
  pickup?: Coords | null
  destination?: Coords | null
  status: 'requested' | 'accepted' | 'started' | 'cancelled' | 'declined' | 'completed'
  /** 0..1 progress of the driver toward pickup (demo simulation). */
  arrivalProgress: number
  /** 0..1 progress of the trip toward the destination (demo simulation). */
  tripProgress: number
}

type LatLng = [number, number]
const FALLBACK_CENTER: LatLng = [18.5204, 73.8567] // Pune
// Ola Maps raster tiles when its key is set (light, India-accurate); otherwise OpenStreetMap's standard tiles.
const OLA_KEY = import.meta.env.VITE_OLA_MAPS_API_KEY as string | undefined
const TILES = OLA_KEY
  ? { url: `https://api.olamaps.io/tiles/v1/styles/default-light-standard/{z}/{x}/{y}.png?api_key=${OLA_KEY}`, attribution: '© Ola Maps © OpenStreetMap contributors' }
  : { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' }

const dot = (cls: string) => L.divIcon({ className: '', html: `<span class="mk ${cls}"></span>`, iconSize: [22, 22], iconAnchor: [11, 11] })
const carIcon = L.divIcon({
  className: '',
  html: '<span class="mk car"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg></span>',
  iconSize: [34, 34], iconAnchor: [17, 17],
})

function lerp(a: LatLng, b: LatLng, t: number): LatLng { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] }

function pointAlong(path: LatLng[], t: number): LatLng {
  if (path.length < 2) return path[0]
  const lens = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]))
  let target = lens.reduce((a, b) => a + b, 0) * Math.min(1, Math.max(0, t))
  for (let i = 0; i < lens.length; i++) {
    if (target <= lens[i] || i === lens.length - 1) return lerp(path[i], path[i + 1], lens[i] ? Math.min(1, target / lens[i]) : 0)
    target -= lens[i]
  }
  return path[path.length - 1]
}

export default function MapView({ pickup, destination, status, arrivalProgress, tripProgress }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const car = useRef<L.Marker | null>(null)
  const [route, setRoute] = useState<LatLng[]>([])

  const a: LatLng | null = pickup ? [pickup.lat, pickup.lon] : null
  const b: LatLng | null = destination ? [destination.lat, destination.lon] : null
  const aKey = a?.join(','), bKey = b?.join(',')

  // Create the map once.
  useEffect(() => {
    if (!box.current) return
    const m = L.map(box.current, { zoomControl: false, attributionControl: true }).setView(a ?? FALLBACK_CENTER, 13)
    L.tileLayer(TILES.url, { maxZoom: 19, attribution: TILES.attribution }).addTo(m)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    map.current = m
    return () => { m.remove(); map.current = null; car.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Real driving route (free OSRM demo server); falls back to a straight line.
  useEffect(() => {
    if (!a || !b) return
    const ctrl = new AbortController()
    fetch(`https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => setRoute(d.routes?.[0]?.geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon]) ?? [a, b]))
      .catch((e) => { if (e.name !== 'AbortError') setRoute([a, b]) })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aKey, bKey])

  // Draw markers and route.
  useEffect(() => {
    const m = map.current
    if (!m) return
    const layers: L.Layer[] = []
    if (a) layers.push(L.marker(a, { icon: dot('pick') }).addTo(m))
    if (b) layers.push(L.marker(b, { icon: dot('drop') }).addTo(m))
    const path = route.length ? route : a && b ? [a, b] : []
    if (path.length) layers.push(L.polyline(path, { color: '#000', weight: 5, opacity: 0.9 }).addTo(m))
    const pts = [...(a ? [a] : []), ...(b ? [b] : []), ...path]
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [50, 50] })
    else if (a) m.setView(a, 15)
    return () => layers.forEach((l) => l.remove())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aKey, bKey, route])

  // Demo car: approaches the pickup, then follows the route. Not a live driver position.
  useEffect(() => {
    const m = map.current
    if (!m || !a || status !== 'accepted' && status !== 'started') { car.current?.remove(); car.current = null; return }
    const path = route.length ? route : b ? [a, b] : [a]
    const start: LatLng = [a[0] + 0.012, a[1] + 0.012]
    const pos = status === 'accepted' ? lerp(start, a, arrivalProgress) : pointAlong(path, tripProgress)
    if (car.current) car.current.setLatLng(pos)
    else car.current = L.marker(pos, { icon: carIcon, zIndexOffset: 1000 }).addTo(m)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, arrivalProgress, tripProgress, route, aKey, bKey])

  return <div ref={box} className="leaflet-box" role="img" aria-label="Map of your trip" />
}
