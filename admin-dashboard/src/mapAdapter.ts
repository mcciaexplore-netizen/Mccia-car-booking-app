// One small map interface (Leaflet). Map tiles come from Geoapify when a key is set; if its tiles fail to load (bad key,
// blocked domain, quota) the map switches to plain OpenStreetMap tiles by itself, so it is never blank.
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { GEOAPIFY_KEY } from './geo'

export type LL = { lat: number; lng: number }
export type AdMarker = { setPosition: (p: LL) => void; getElement: () => HTMLElement | null; remove: () => void }
export type AdShape = { remove: () => void }
export type LineStyle = { color: string; weight: number; opacity: number }
export type DotStyle = { radius: number; fill: string; stroke: string; strokeWidth: number }

export interface MapAdapter {
  kind: 'geoapify' | 'osm'
  setView: (center: LL, zoom: number) => void
  fitBounds: (points: LL[], padding: number, maxZoom?: number) => void
  panIfOutside: (p: LL) => void
  panTo: (p: LL) => void
  /** Called when the user drags the map by hand. */
  onDrag: (cb: () => void) => void
  addMarker: (p: LL, html: string, className?: string) => AdMarker
  addLine: (path: LL[], style: LineStyle) => AdShape
  addDot: (p: LL, style: DotStyle) => AdShape
  destroy: () => void
}

let nextId = 0

/* ---------- Leaflet engine ---------- */
function osmAdapter(container: HTMLElement, center: LL, zoom: number): MapAdapter {
  const map = L.map(container, { zoomControl: false, attributionControl: true }).setView([center.lat, center.lng], zoom)
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' })
  let kind: 'geoapify' | 'osm' = 'osm'
  if (GEOAPIFY_KEY) {
    kind = 'geoapify'
    const geoapify = L.tileLayer(`https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${GEOAPIFY_KEY}`, {
      maxZoom: 19,
      attribution: 'Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> | &copy; OpenStreetMap contributors',
    }).addTo(map)
    let failures = 0
    geoapify.on('tileerror', () => {
      if (++failures !== 4) return
      console.warn('[maps] Geoapify tiles are not loading (check the key and allowed domains), using OpenStreetMap instead.')
      map.removeLayer(geoapify)
      osm.addTo(map)
    })
  } else osm.addTo(map)
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  const ll = (p: LL): L.LatLngTuple => [p.lat, p.lng]
  return {
    kind,
    setView: (c, z) => { map.setView(ll(c), z) },
    fitBounds: (points, padding, maxZoom) => { if (points.length) map.fitBounds(L.latLngBounds(points.map(ll)), { padding: [padding, padding], maxZoom }) },
    panIfOutside: (p) => { if (!map.getBounds().contains(ll(p))) map.panTo(ll(p)) },
    panTo: (p) => { map.panTo(ll(p), { animate: true, duration: 1 }) },
    onDrag: (cb) => { map.on('dragstart', cb) },
    addMarker: (p, html, className = '') => {
      const marker = L.marker(ll(p), { icon: L.divIcon({ className, iconSize: [0, 0], html }), zIndexOffset: 1000, interactive: false }).addTo(map)
      return { setPosition: (np) => { marker.setLatLng(ll(np)) }, getElement: () => marker.getElement() ?? null, remove: () => { marker.remove() } }
    },
    addLine: (path, s) => {
      const line = L.polyline(path.map(ll), { color: s.color, weight: s.weight, opacity: s.opacity }).addTo(map)
      return { remove: () => { line.remove() } }
    },
    addDot: (p, s) => {
      const dot = L.circleMarker(ll(p), { radius: s.radius, color: s.stroke, weight: s.strokeWidth, fillColor: s.fill, fillOpacity: 1 }).addTo(map)
      return { remove: () => { dot.remove() } }
    },
    destroy: () => { map.remove() },
  }
}

/* ---------- Factory ---------- */
// Every map gets its own host element inside the container, so a half-built map (React StrictMode runs effects twice)
// can never collide with the map that replaces it.
function newHost(container: HTMLElement) {
  const host = document.createElement('div')
  host.id = `map-host-${++nextId}`
  host.style.cssText = 'position:absolute;inset:0;'
  container.appendChild(host)
  return host
}

export async function createMap(container: HTMLElement, opts: { center: LL; zoom: number }): Promise<MapAdapter> {
  const host = newHost(container)
  const adapter = osmAdapter(host, opts.center, opts.zoom)
  return { ...adapter, destroy: () => { adapter.destroy(); host.remove() } }
}
