import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Building2, Clock3, Crosshair, LoaderCircle, MapPin, X } from 'lucide-react'
import { ATTRIBUTION, newSessionToken, resolvePlace, reverseGeocode, searchPlaces, type Coords, type Place } from './places'

const RECENT_KEY = 'rideops.recentPlaces'

function loadRecent(): Place[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') } catch { return [] }
}
function saveRecent(place: Place) {
  try {
    const next = [place, ...loadRecent().filter((p) => p.label !== place.label || p.detail !== place.detail)].slice(0, 4)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch { /* storage unavailable */ }
}

type Props = {
  name: string
  caption: string
  placeholder: string
  value: string
  onChange: (text: string, coords?: Coords) => void
  icon: ReactNode
  tone: 'pickup' | 'destination'
  bias?: Coords
  allowCurrent?: boolean
  onLocated?: (coords: Coords) => void
  autoComplete?: string
}

export default function LocationInput({ name, caption, placeholder, value, onChange, icon, tone, bias, allowCurrent, onLocated, autoComplete }: Props) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<Place[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(-1)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState('')
  const [searched, setSearched] = useState('')
  const wrap = useRef<HTMLDivElement>(null)
  const token = useRef(newSessionToken()) // one billing session per search-then-pick
  const [typed, setTyped] = useState(false) // only search text the user typed, not text we filled in

  useEffect(() => {
    const query = value.trim()
    if (!open || !typed || query.length < 2) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        setResults(await searchPlaces(query, bias, token.current, controller.signal))
        setSearched(query)
        setActive(-1)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setResults([])
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [value, open, bias, typed])

  useEffect(() => {
    function outside(e: MouseEvent) { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  async function choose(place: Place) {
    setTyped(false)
    setOpen(false)
    setResults([])
    const full = await resolvePlace(place, token.current).catch(() => place)
    token.current = newSessionToken()
    onChange(full.detail ? `${full.label}, ${full.detail}` : full.label, full.coords)
    saveRecent(full)
  }

  function useCurrentLocation() {
    setGeoError('')
    if (!navigator.geolocation) return setGeoError('Location is not supported in this browser.')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const here = { lat: coords.latitude, lon: coords.longitude }
        onLocated?.(here)
        const place = await reverseGeocode(here).catch(() => null)
        setTyped(false)
        onChange(place ? (place.detail ? `${place.label}, ${place.detail}` : place.label) : `${here.lat.toFixed(5)}, ${here.lon.toFixed(5)}`, here)
        setLocating(false)
        setOpen(false)
      },
      (err) => {
        setLocating(false)
        setGeoError(err.code === err.PERMISSION_DENIED ? 'Location permission denied. Allow it in your browser, or type an address.' : 'Could not get your location.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % results.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a <= 0 ? results.length - 1 : a - 1)) }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(results[active]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  const query = value.trim()
  const showSearch = typed && query.length >= 2
  const recent = !showSearch ? loadRecent() : []
  const showPanel = open && (allowCurrent || showSearch || recent.length > 0)

  return (
    <div className={`location-input ${tone}-input`} ref={wrap}>
      <span className={`location-symbol ${tone}-symbol`}>{icon}</span>
      <span className="location-field">
        <small>{caption}</small>
        <input
          name={name} value={value} placeholder={placeholder} autoComplete={autoComplete ?? 'off'} required
          role="combobox" aria-expanded={showPanel} aria-autocomplete="list"
          onFocus={() => setOpen(true)} onKeyDown={onKey}
          onChange={(e) => { setTyped(true); onChange(e.target.value); setOpen(true) }}
        />
      </span>
      {loading ? <LoaderCircle className="loc-spin" size={15} /> : value && <button type="button" className="loc-clear" aria-label={`Clear ${caption.toLowerCase()}`} onClick={() => { setTyped(false); onChange(''); setResults([]) }}><X size={13} /></button>}

      {showPanel && (
        <div className="loc-panel" role="listbox">
          {allowCurrent && (
            <button type="button" className="loc-row current" onClick={useCurrentLocation} disabled={locating}>
              <span className="loc-icon blue"><Crosshair size={15} /></span>
              <span className="loc-text"><strong>{locating ? 'Finding you…' : 'Use current location'}</strong><small>Uses your device’s GPS</small></span>
            </button>
          )}
          {geoError && <p className="loc-msg error">{geoError}</p>}
          {recent.map((p) => (
            <button type="button" className="loc-row" key={`r-${p.label}-${p.detail}`} onClick={() => choose(p)}>
              <span className="loc-icon"><Clock3 size={15} /></span>
              <span className="loc-text"><strong>{p.label}</strong><small>{p.detail}</small></span>
            </button>
          ))}
          {showSearch && results.map((p, i) => (
            <button type="button" role="option" aria-selected={i === active} className={`loc-row ${i === active ? 'active' : ''}`} key={p.id} onMouseEnter={() => setActive(i)} onClick={() => choose(p)}>
              <span className="loc-icon">{p.kind === 'place' ? <MapPin size={15} /> : <Building2 size={15} />}</span>
              <span className="loc-text"><strong>{p.label}</strong><small>{p.detail}</small></span>
            </button>
          ))}
          {showSearch && !loading && searched === query && results.length === 0 && <p className="loc-msg">No places found for “{query}”.</p>}
          <p className="loc-attr">{ATTRIBUTION}</p>
        </div>
      )}
    </div>
  )
}
