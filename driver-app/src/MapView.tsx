import { useEffect, useRef, useState } from 'react'
import { PUNE } from './geo'
import LocateButton from './LocateButton'
import { fetchPath } from './routing'
import { createMap, type LL, type MapAdapter } from './mapAdapter'

type Pt = { lat: number; lon: number }

/** Shows the pickup, and (once the trip starts) the road route to the destination. */
export default function MapView({ pickup, destination, showRoute }: { pickup?: Pt | null; destination?: Pt | null; showRoute: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<MapAdapter | null>(null)
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
    createMap(box.current, { center: a ?? PUNE, zoom: 14 }).then((m) => {
      if (cancelled) { m.destroy(); return }
      created = m
      map.current = m
      setReady(true)
    })
    return () => { cancelled = true; created?.destroy(); map.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!showRoute || !a || !b) return
    const ctrl = new AbortController()
    fetchPath(a, b, ctrl.signal)
      .then(setRoute)
      .catch((e) => { if (e.name !== 'AbortError') setRoute([a, b]) })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRoute, aKey, bKey])

  useEffect(() => {
    const m = map.current
    if (!ready || !m) return
    const items: { remove: () => void }[] = []
    const path = showRoute ? route : []
    if (a) items.push(m.addMarker(a, '<span class="mk pick"></span>', 'gm-dot'))
    if (showRoute && b) items.push(m.addMarker(b, '<span class="mk drop"></span>', 'gm-dot'))
    if (path.length) items.push(m.addLine(path, { color: '#0b63ad', weight: 5, opacity: 0.95 }))
    const pts = [...(a ? [a] : []), ...(showRoute && b ? [b] : []), ...path]
    if (pts.length > 1) m.fitBounds(pts, 40)
    else if (a) m.setView(a, 15)
    return () => items.forEach((x) => x.remove())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, aKey, bKey, showRoute, route])

  return <><div ref={box} className="gmap-box" role="img" aria-label="Trip map" /><LocateButton getMap={() => map.current} /></>
}
