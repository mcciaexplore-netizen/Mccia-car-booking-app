import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Pt = { lat: number; lon: number }
type LatLng = [number, number]

// Ola Maps raster tiles when its key is set; otherwise OpenStreetMap's standard tiles.
const OLA_KEY = import.meta.env.VITE_OLA_MAPS_API_KEY as string | undefined
const TILES = OLA_KEY
  ? { url: `https://api.olamaps.io/tiles/v1/styles/default-light-standard/{z}/{x}/{y}.png?api_key=${OLA_KEY}`, attribution: '© Ola Maps © OpenStreetMap contributors' }
  : { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' }

const pin = (cls: string) => L.divIcon({ className: '', html: `<span class="mk ${cls}"></span>`, iconSize: [22, 22], iconAnchor: [11, 11] })

/** Shows the pickup, and (once the trip starts) the road route to the destination. */
export default function MapView({ pickup, destination, showRoute }: { pickup?: Pt | null; destination?: Pt | null; showRoute: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const [route, setRoute] = useState<LatLng[]>([])
  const a: LatLng | null = pickup ? [pickup.lat, pickup.lon] : null
  const b: LatLng | null = destination ? [destination.lat, destination.lon] : null
  const aKey = a?.join(','), bKey = b?.join(',')

  useEffect(() => {
    if (!box.current) return
    const m = L.map(box.current, { zoomControl: false }).setView(a ?? [18.5204, 73.8567], 14)
    L.tileLayer(TILES.url, { maxZoom: 19, attribution: TILES.attribution }).addTo(m)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    map.current = m
    return () => { m.remove(); map.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!showRoute || !a || !b) { setRoute([]); return }
    const ctrl = new AbortController()
    fetch(`https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => setRoute(d.routes?.[0]?.geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon]) ?? [a, b]))
      .catch((e) => { if (e.name !== 'AbortError') setRoute([a, b]) })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRoute, aKey, bKey])

  useEffect(() => {
    const m = map.current
    if (!m) return
    const layers: L.Layer[] = []
    if (a) layers.push(L.marker(a, { icon: pin('pick') }).addTo(m))
    if (showRoute && b) layers.push(L.marker(b, { icon: pin('drop') }).addTo(m))
    if (showRoute && route.length) layers.push(L.polyline(route, { color: '#000', weight: 5 }).addTo(m))
    const pts = [...(a ? [a] : []), ...(showRoute && b ? [b] : []), ...(showRoute ? route : [])]
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [40, 40] })
    else if (a) m.setView(a, 15)
    return () => layers.forEach((l) => l.remove())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aKey, bKey, showRoute, route])

  return <div ref={box} className="leaflet-box" role="img" aria-label="Trip map" />
}
