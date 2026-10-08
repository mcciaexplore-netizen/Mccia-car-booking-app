import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowDownLeft, ArrowDownRight, ArrowUp, ArrowUpLeft, ArrowUpRight, Check, ChevronLeft, CornerUpLeft, CornerUpRight, Flag,
  KeyRound, LoaderCircle, LocateFixed, Navigation, Phone, RotateCcw, ShieldCheck, Volume2, VolumeX,
} from 'lucide-react'
import { PUNE } from './geo'
import { createMap, type AdMarker, type AdShape, type LL, type MapAdapter } from './mapAdapter'
import { arrowFor, bearing, distanceToRoute, fetchRoute, formatDistance, instruction, metres, nearestIndex, type ArrowKind, type Route } from './navigation'
import type { Ride } from './api'
import type { Position } from './useLocationSharing'

const ICONS: Record<ArrowKind, typeof ArrowUp> = {
  straight: ArrowUp, 'slight-left': ArrowUpLeft, 'slight-right': ArrowUpRight, left: CornerUpLeft, right: CornerUpRight,
  'sharp-left': ArrowDownLeft, 'sharp-right': ArrowDownRight, uturn: RotateCcw, arrive: Flag,
}

const CAR_HTML = '<div class="nav-car"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2 L20 21 L12 17 L4 21 Z" fill="#fff" stroke="#0b63ad" stroke-width="1.6" stroke-linejoin="round"/></svg></div>'
const PIN_HTML = (kind: 'pick' | 'drop') => `<span class="mk ${kind}"></span>`

type Props = {
  ride: Ride
  fix: Position | null
  busy: boolean
  onClose: () => void
  onVerify: (otp: string) => Promise<string | null>
  onEnd: () => Promise<void>
}

export default function NavScreen({ ride, fix, busy, onClose, onVerify, onEnd }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const sheet = useRef<HTMLElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<MapAdapter | null>(null)
  const carMarker = useRef<AdMarker | null>(null)
  const targetMarker = useRef<AdMarker | null>(null)
  const lineShapes = useRef<AdShape[]>([])
  const drawnFrom = useRef(-1)
  const routeKey = useRef('')
  const lastFetch = useRef(0)
  const lastPos = useRef<LL | null>(null)
  const lastHeading = useRef(0)
  const spoken = useRef(new Set<string>())
  const centred = useRef(false)

  const [ready, setReady] = useState(false)
  const [route, setRoute] = useState<Route | null>(null)
  const [nextIdx, setNextIdx] = useState(1)
  const [following, setFollowing] = useState(true)
  const [muted, setMuted] = useState(false)
  const [arrivedOpen, setArrivedOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [confirmEnd, setConfirmEnd] = useState(false)

  const accepted = ride.status === 'accepted'
  const targetCoords = accepted ? ride.pickupCoords : ride.destinationCoords
  const tLat = targetCoords?.lat, tLon = targetCoords?.lon
  const target: LL | null = useMemo(() => (tLat !== undefined && tLon !== undefined ? { lat: tLat, lng: tLon } : null), [tLat, tLon])
  const targetLabel = accepted ? 'your rider' : 'the destination'
  const lat = fix?.lat, lon = fix?.lon
  const pos: LL | null = useMemo(() => (lat !== undefined && lon !== undefined ? { lat, lng: lon } : null), [lat, lon])
  // Before the first GPS reading the route can still start from the pickup point of a trip that is under way.
  // Already at the pickup or drop-off point: nothing left to route.
  const nearTarget = !!pos && !!target && metres(pos, target) < 60
  const origin: LL | null = pos ?? (!accepted && ride.pickupCoords ? { lat: ride.pickupCoords.lat, lng: ride.pickupCoords.lon } : null)

  // Keep the speed bubble and re-centre button just above the bottom sheet, whatever its height.
  useEffect(() => {
    const el = sheet.current
    if (!el || !root.current) return
    const set = () => root.current?.style.setProperty('--sheet-h', el.offsetHeight + 'px')
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* ---- map ---- */
  useEffect(() => {
    let cancelled = false
    let created: MapAdapter | null = null
    if (!box.current) return
    createMap(box.current, { center: pos ?? target ?? PUNE, zoom: 17 }).then((m) => {
      if (cancelled) { m.destroy(); return }
      created = m
      map.current = m
      m.onDrag(() => setFollowing(false))
      setReady(true)
    })
    return () => {
      cancelled = true
      carMarker.current?.remove(); carMarker.current = null
      targetMarker.current?.remove(); targetMarker.current = null
      lineShapes.current.forEach((s) => s.remove()); lineShapes.current = []
      created?.destroy(); map.current = null
    }
    // The map is created once; later position and route changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- route: fetch on start, when the target changes, and when the driver leaves the route ---- */
  useEffect(() => {
    if (!origin || !target || nearTarget) return
    const key = `${ride.status}:${target.lat},${target.lng}`
    const changed = routeKey.current !== key
    const off = route && pos ? distanceToRoute(pos, route.path) > 120 : false
    if (!changed && !off && route) return
    if (!changed && Date.now() - lastFetch.current < 10_000) return
    routeKey.current = key
    lastFetch.current = Date.now()
    const ctrl = new AbortController()
    void fetchRoute(origin, target, ctrl.signal).then((r) => {
      if (!r) return
      setRoute(r)
      setNextIdx(r.steps.length > 1 ? 1 : 0)
      drawnFrom.current = -1
      spoken.current.clear()
    })
    // A newer position or target replaces an in-flight request.
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.lat, origin?.lng, target?.lat, target?.lng, ride.status, route, nearTarget])

  /* ---- progress along the route ---- */
  const step = route?.steps[nextIdx] ?? null
  const toNext = pos && step ? metres(pos, step.location) : 0
  useEffect(() => {
    if (!route || !pos || !step) return
    if (nextIdx < route.steps.length - 1 && toNext < 30) setNextIdx((i) => i + 1)
  }, [route, pos, step, toNext, nextIdx])

  const remaining = route ? toNext + route.steps.slice(nextIdx).reduce((sum, s) => sum + s.distance, 0) : 0
  const remainingMin = route && route.distance > 0 ? Math.max(1, Math.round((remaining / route.distance) * (route.duration / 60))) : 0
  const arriveAt = new Date(Date.now() + remainingMin * 60_000)
  const arrived = nearTarget || (!!route && !!step && step.type === 'arrive' && toNext < 45)

  useEffect(() => {
    if (arrived && accepted) queueMicrotask(() => setArrivedOpen(true))
  }, [arrived, accepted])

  /* ---- markers, route line, camera ---- */
  useEffect(() => {
    const m = map.current
    if (!ready || !m) return
    if (target && !targetMarker.current) targetMarker.current = m.addMarker(target, PIN_HTML(accepted ? 'pick' : 'drop'), 'gm-dot')
    else if (target && targetMarker.current) {
      targetMarker.current.setPosition(target)
      const dot = targetMarker.current.getElement()?.querySelector('.mk')
      if (dot) dot.className = `mk ${accepted ? 'pick' : 'drop'}`
    }
    if (!pos) return

    // Car arrow: points the way the phone reports, or the way the last movement went.
    let heading = lastHeading.current
    if (fix?.heading !== null && fix?.heading !== undefined && (fix.speedKmh ?? 0) > 3) heading = fix.heading
    else if (lastPos.current && metres(lastPos.current, pos) > 6) heading = bearing(lastPos.current, pos)
    if (!lastPos.current || metres(lastPos.current, pos) > 6) lastPos.current = pos
    lastHeading.current = heading
    if (!carMarker.current) carMarker.current = m.addMarker(pos, CAR_HTML, 'nav-car-wrap')
    else carMarker.current.setPosition(pos)
    const car = carMarker.current.getElement()?.querySelector<HTMLElement>('.nav-car')
    if (car) car.style.transform = `rotate(${heading}deg)`

    // Draw only the part of the route still ahead.
    if (route) {
      const from = nearestIndex(pos, route.path, Math.max(0, drawnFrom.current))
      if (drawnFrom.current < 0 || from - drawnFrom.current >= 6) {
        lineShapes.current.forEach((s) => s.remove())
        const ahead = [pos, ...route.path.slice(from)]
        lineShapes.current = [
          m.addLine(ahead, { color: '#ffffff', weight: 11, opacity: 0.95 }),
          m.addLine(ahead, { color: '#0b63ad', weight: 6, opacity: 1 }),
        ]
        drawnFrom.current = from
      }
    }

    if (!centred.current) { centred.current = true; m.setView(pos, 17) }
    else if (following) m.panTo(pos)
  }, [ready, pos, fix, route, target, accepted, following])

  /* ---- voice guidance ---- */
  useEffect(() => {
    if (muted || !step || !pos || !('speechSynthesis' in window)) return
    const bucket = toNext < 45 ? 40 : toNext < 160 ? 150 : toNext < 450 ? 400 : 0
    if (!bucket) return
    const key = `${nextIdx}:${bucket}`
    if (spoken.current.has(key)) return
    spoken.current.add(key)
    const what = instruction(step, targetLabel).replace(/^Arrive at/, 'You will arrive at')
    const text = bucket === 40 ? what : `In ${bucket === 150 ? '150' : '400'} metres, ${what.charAt(0).toLowerCase()}${what.slice(1)}`
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  }, [muted, step, nextIdx, toNext, pos, targetLabel])

  useEffect(() => () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel() }, [])

  async function submitPin(e: FormEvent) {
    e.preventDefault()
    setPinError('')
    const error = await onVerify(pin)
    if (error) setPinError(error)
    else { setPin(''); setArrivedOpen(false); setRoute(null); drawnFrom.current = -1; centred.current = false }
  }

  function recentre() {
    setFollowing(true)
    if (pos) map.current?.setView(pos, 17)
  }

  const Arrow = step ? ICONS[arrowFor(step)] : Navigation
  const nextNext = route?.steps[nextIdx + 1]
  const phone = ride.phone ? ride.phone.replace(/[^+\d]/g, '') : ''

  return (
    <div ref={root} className="nav-screen" role="dialog" aria-label="Navigation">
      <div ref={box} className="nav-map" />

      <header className="nav-top">
        <button type="button" className="nav-round" onClick={onClose} aria-label="Back to trip"><ChevronLeft size={22} /></button>
        <div className="nav-banner">
          {nearTarget ? <>
            <span className="nav-arrow"><Flag size={32} strokeWidth={2.4} /></span>
            <span className="nav-text"><strong>You have arrived</strong><span>{accepted ? 'At the pickup point' : 'At the destination'}</span></span>
          </> : route && step ? <>
            <span className="nav-arrow"><Arrow size={34} strokeWidth={2.4} /></span>
            <span className="nav-text"><strong>{formatDistance(toNext)}</strong><span>{instruction(step, targetLabel, route.path.length > 1 ? bearing(route.path[0], route.path[1]) : undefined)}</span></span>
          </> : <>
            <span className="nav-arrow dim">{pos || origin ? <LoaderCircle size={30} className="nav-spin" /> : <LocateFixed size={30} />}</span>
            <span className="nav-text"><strong>{pos || origin ? 'Finding the best route' : 'Finding your location'}</strong><span>{pos || origin ? `To ${targetLabel}` : 'Turn on GPS and allow location'}</span></span>
          </>}
        </div>
        <button type="button" className="nav-round" onClick={() => { setMuted((v) => !v); window.speechSynthesis?.cancel() }} aria-label={muted ? 'Turn voice on' : 'Mute voice'}>{muted ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
      </header>
      {!nearTarget && route && nextNext && <div className="nav-then">Then <b>{instruction(nextNext, targetLabel)}</b></div>}

      {fix && fix.speedKmh !== null && <div className="nav-speed"><strong>{fix.speedKmh}</strong><small>km/h</small></div>}
      {!following && <button type="button" className="nav-recentre" onClick={recentre}><LocateFixed size={18} /> Re-centre</button>}

      <section ref={sheet} className="nav-sheet">
        <div className="nav-eta">
          <span className="nav-eta-main"><strong>{nearTarget ? 'Arrived' : route ? `${remainingMin} min` : '—'}</strong><small>{nearTarget ? (accepted ? 'Rider is waiting for you' : 'Trip complete when you end it') : route ? `${formatDistance(remaining)} · arrive ${arriveAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Waiting for route'}</small></span>
          <span className={`chip ${accepted ? '' : 'green'}`}>{accepted ? 'Heading to pickup' : 'Trip in progress'}</span>
        </div>
        <div className="row">
          <span className="avatar">{ride.riderName.charAt(0).toUpperCase()}</span>
          <div className="grow"><strong>{ride.riderName}</strong><small>{ride.passengers} passenger{ride.passengers > 1 ? 's' : ''} · {accepted ? ride.pickup.split(',')[0] : ride.destination.split(',')[0]}</small></div>
          {phone && <a className="call-btn" href={`tel:${phone}`} aria-label={`Call ${ride.riderName}`}><Phone size={17} /></a>}
        </div>

        {accepted && !arrivedOpen && <button type="button" className="btn btn-primary" onClick={() => setArrivedOpen(true)}><Check size={17} /> I have arrived</button>}
        {accepted && arrivedOpen && <form className="stack tight-stack" onSubmit={submitPin}>
          <span className="field-label"><KeyRound size={14} /> Ask {ride.riderName.split(' ')[0]} for their 4-digit PIN</span>
          <span className="input"><input className="pin-input" inputMode="numeric" maxLength={4} pattern="\d{4}" placeholder="• • • •" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} required autoFocus aria-label="Rider PIN" /></span>
          {pinError && <div className="alert error" role="alert">{pinError}</div>}
          <button className="btn btn-primary" type="submit" disabled={busy || pin.length !== 4}><ShieldCheck size={17} /> Verify and start trip</button>
        </form>}

        {!accepted && !confirmEnd && <button type="button" className="btn btn-primary" onClick={() => setConfirmEnd(true)}><Flag size={17} /> {arrived ? 'You have arrived · End trip' : 'End trip'}</button>}
        {!accepted && confirmEnd && <div className="nav-confirm">
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmEnd(false)}>Keep driving</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onEnd()}><Check size={17} /> Yes, end trip</button>
        </div>}
      </section>
    </div>
  )
}
