// OpenFreeMap + MapLibre GL engine: free vector tiles, no API key, no usage limits. Implements the same MapAdapter
// interface as the Leaflet engine in mapAdapter.ts, which falls back to Leaflet when WebGL is unavailable.
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// Production builds don't copy MapLibre's worker file next to the bundle, so ship it as an asset and point MapLibre at it.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import type { AdShape, DotStyle, LL, LineStyle, MapAdapter } from './mapAdapter'

// Styles available from OpenFreeMap: liberty, bright, positron. Swap for a custom Maputnik JSON (e.g. /styles/dark.json).
export const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

maplibregl.setWorkerUrl(workerUrl)

let shapeId = 0
const lngLat = (p: LL): [number, number] => [p.lng, p.lat]

export function webglAvailable() {
  try { return !!document.createElement('canvas').getContext('webgl2') || !!document.createElement('canvas').getContext('webgl') } catch { return false }
}

export function openFreeMapAdapter(container: HTMLElement, center: LL, zoom: number): MapAdapter {
  const map = new maplibregl.Map({
    container,
    style: OPENFREEMAP_STYLE,
    center: lngLat(center),
    zoom,
    attributionControl: false,
  })
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>' }), 'bottom-left')
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')

  // The map box can be laid out after the map is created (tabs, modals, screens that mount hidden): follow its size.
  const sizeWatch = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.resize()) : null
  sizeWatch?.observe(container)
  requestAnimationFrame(() => map.resize())

  // Layers can only be added once the style has loaded; queue until then.
  const pending: Array<() => void> = []
  let ready = false
  map.on('load', () => { ready = true; pending.splice(0).forEach((fn) => fn()) })
  const whenReady = (fn: () => void) => { if (ready) fn(); else pending.push(fn) }

  const addShape = (build: () => void, ids: string[]): AdShape => {
    let removed = false
    whenReady(() => { if (!removed) build() })
    return { remove: () => { removed = true; whenReady(() => { for (const id of ids) { if (map.getLayer(id)) map.removeLayer(id) } for (const id of ids) { if (map.getSource(id)) map.removeSource(id) } }) } }
  }

  return {
    kind: 'openfreemap',
    setView: (c, z) => { map.jumpTo({ center: lngLat(c), zoom: z }) },
    fitBounds: (points, padding, maxZoom) => {
      if (!points.length) return
      const b = new maplibregl.LngLatBounds(lngLat(points[0]), lngLat(points[0]))
      points.forEach((p) => b.extend(lngLat(p)))
      map.fitBounds(b, { padding, maxZoom, duration: 0 })
    },
    panIfOutside: (p) => { if (!map.getBounds().contains(lngLat(p))) map.panTo(lngLat(p)) },
    panTo: (p) => { map.easeTo({ center: lngLat(p), duration: 1000 }) },
    onDrag: (cb) => { map.on('dragstart', cb) },
    addMarker: (p, html, className = '') => {
      const el = document.createElement('div')
      el.className = className
      el.style.cssText = 'width:0;height:0;overflow:visible;'
      el.innerHTML = html
      const marker = new maplibregl.Marker({ element: el, anchor: 'top-left' }).setLngLat(lngLat(p)).addTo(map)
      return { setPosition: (np) => { marker.setLngLat(lngLat(np)) }, getElement: () => el, remove: () => { marker.remove() } }
    },
    addLine: (path, s: LineStyle) => {
      const id = `line-${++shapeId}`
      return addShape(() => {
        map.addSource(id, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path.map(lngLat) } } })
        map.addLayer({ id, type: 'line', source: id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': s.color, 'line-width': s.weight, 'line-opacity': s.opacity } })
      }, [id])
    },
    addDot: (p, s: DotStyle) => {
      const id = `dot-${++shapeId}`
      return addShape(() => {
        map.addSource(id, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: lngLat(p) } } })
        map.addLayer({ id, type: 'circle', source: id, paint: { 'circle-radius': s.radius, 'circle-color': s.fill, 'circle-stroke-color': s.stroke, 'circle-stroke-width': s.strokeWidth } })
      }, [id])
    },
    destroy: () => { sizeWatch?.disconnect(); map.remove() },
  }
}
