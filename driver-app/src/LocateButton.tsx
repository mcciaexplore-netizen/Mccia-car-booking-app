import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, LocateFixed } from 'lucide-react'
import type { AdMarker, LL, MapAdapter } from './mapAdapter'

const ME_HTML = '<span class="me-dot"><i></i></span>'

// "My location": shows the device's GPS position as a blue dot on the map and centres the map on it.
// Tap again to re-centre. Works with both map engines because it only uses the MapAdapter interface.
export default function LocateButton({ getMap }: { getMap: () => MapAdapter | null }) {
  const [state, setState] = useState<'idle' | 'locating' | 'on' | 'denied' | 'unavailable'>('idle')
  const watch = useRef<number | null>(null)
  const marker = useRef<AdMarker | null>(null)
  const adapter = useRef<MapAdapter | null>(null)
  const last = useRef<LL | null>(null)

  useEffect(() => () => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
    marker.current?.remove()
  }, [])

  function start() {
    const map = getMap()
    if (!map) return
    if (!('geolocation' in navigator)) { setState('unavailable'); return }
    adapter.current = map
    setState('locating')
    let first = true
    watch.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const p: LL = { lat: coords.latitude, lng: coords.longitude }
        last.current = p
        const m = adapter.current
        if (!m) return
        if (!marker.current) marker.current = m.addMarker(p, ME_HTML, 'me-pin')
        else marker.current.setPosition(p)
        if (first) { first = false; m.setView(p, 16) }
        setState('on')
      },
      (err) => {
        setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')
        if (watch.current !== null) { navigator.geolocation.clearWatch(watch.current); watch.current = null }
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20_000 },
    )
  }

  function onClick() {
    if (state === 'on' && last.current) getMap()?.setView(last.current, 16)
    else if (state !== 'locating') start()
  }

  const label = state === 'on' ? 'Centre on my location' : state === 'locating' ? 'Finding your location' : state === 'denied' ? 'Location is blocked. Allow it in your browser settings.' : state === 'unavailable' ? 'Location is not available on this device' : 'Show my location'
  return (
    <button type="button" className={`locate-btn ${state}`} onClick={onClick} aria-label={label} title={label}>
      {state === 'locating' ? <LoaderCircle size={20} className="locate-spin" /> : <LocateFixed size={20} />}
    </button>
  )
}
