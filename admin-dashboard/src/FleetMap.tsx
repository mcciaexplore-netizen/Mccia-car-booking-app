import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Coords = { lat: number; lon: number }
export type MapCar = {
  name: string
  plate: string
  status: 'busy' | 'idle'
  depot: Coords
  trip: {
    id: string
    phase: string
    progress: number
    etaMin: number | null
    driverName: string
    riderName: string
    pickupCoords: Coords | null
    destinationCoords: Coords | null
  } | null
}

const COLORS = ['#0b63ad', '#2fa84f', '#e0a82e', '#c2569b']
const PUNE: L.LatLngExpression = [18.5204, 73.8567]

// Point at a fraction of the way along a polyline.
function along(path: L.LatLng[], t: number): L.LatLng {
  if (path.length < 2) return path[0]
  const lengths = path.slice(1).map((p, i) => path[i].distanceTo(p))
  let remaining = lengths.reduce((a, b) => a + b, 0) * Math.min(Math.max(t, 0), 1)
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] ? Math.min(remaining / lengths[i], 1) : 0
      return L.latLng(path[i].lat + (path[i + 1].lat - path[i].lat) * f, path[i].lng + (path[i + 1].lng - path[i].lng) * f)
    }
    remaining -= lengths[i]
  }
  return path[path.length - 1]
}

const carIcon = (car: MapCar, color: string) => {
  const busy = car.status === 'busy' && car.trip
  const label = busy ? `${car.trip!.phase === 'to-pickup' ? 'To pickup' : 'On trip'} · ${car.trip!.etaMin} min` : 'Idle'
  return L.divIcon({
    className: 'fleet-pin',
    iconSize: [0, 0],
    html: `<div class="fleet-pin-body"><span class="fleet-pin-dot ${busy ? 'is-live' : ''}" style="background:${busy ? color : '#fff'};border-color:${busy ? '#fff' : color}">&#128663;</span><span class="fleet-pin-tag"><b>${car.name}</b>${label}</span></div>`,
  })
}

export default function FleetMap({ cars, filter }: { cars: MapCar[]; filter: string }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const routes = useRef(new Map<string, L.LatLng[]>())
  const fitted = useRef('')

  useEffect(() => {
    if (!box.current) return
    const m = L.map(box.current, { center: PUNE, zoom: 12, zoomControl: false, attributionControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(m)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    return () => { m.remove(); map.current = null }
  }, [])

  useEffect(() => {
    const m = map.current
    const group = layer.current
    if (!m || !group) return
    let cancelled = false

    async function pathFor(trip: NonNullable<MapCar['trip']>): Promise<L.LatLng[]> {
      const cached = routes.current.get(trip.id)
      if (cached) return cached
      const a = trip.pickupCoords
      const b = trip.destinationCoords
      if (!a || !b) return []
      let path = [L.latLng(a.lat, a.lon), L.latLng(b.lat, b.lon)]
      try {
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`)
        const json = await res.json()
        const coords: [number, number][] | undefined = json.routes?.[0]?.geometry?.coordinates
        if (coords?.length) path = coords.map(([lon, lat]) => L.latLng(lat, lon))
      } catch { /* straight line fallback */ }
      routes.current.set(trip.id, path)
      return path
    }

    ;(async () => {
      const shown = cars.map((car, index) => ({ car, index })).filter(({ car }) => filter === 'all' || car.name === filter)
      const drawn = await Promise.all(shown.map(async ({ car, index }) => {
        const color = COLORS[index % COLORS.length]
        const trip = car.status === 'busy' ? car.trip : null
        const path = trip ? await pathFor(trip) : []
        const position = path.length ? along(path, trip!.progress) : L.latLng(car.depot.lat, car.depot.lon)
        return { car, color, path, position }
      }))
      if (cancelled) return
      group.clearLayers()
      for (const { car, color, path, position } of drawn) {
        if (path.length) {
          L.polyline(path, { color: '#fff', weight: 8, opacity: 0.9 }).addTo(group)
          L.polyline(path, { color, weight: 5, opacity: 0.95 }).addTo(group)
          L.circleMarker(path[0], { radius: 5, color, weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(group)
          L.circleMarker(path[path.length - 1], { radius: 6, color: '#fff', weight: 2, fillColor: '#d6453d', fillOpacity: 1 }).addTo(group)
        }
        L.marker(position, { icon: carIcon(car, color), zIndexOffset: 1000 }).addTo(group)
      }
      // Re-fit only when the set of visible cars or trips changes, so the view does not jump on every refresh.
      const signature = `${filter}|${drawn.map((d) => `${d.car.name}:${d.car.trip?.id ?? 'idle'}`).join(',')}`
      if (signature !== fitted.current && drawn.length) {
        fitted.current = signature
        const bounds = L.latLngBounds(drawn.flatMap((d) => (d.path.length ? d.path : [d.position])))
        m.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 })
      }
    })()
    return () => { cancelled = true }
  }, [cars, filter])

  return <div ref={box} className="fleet-leaflet" role="img" aria-label="Live map of fleet vehicles in Pune" />
}
