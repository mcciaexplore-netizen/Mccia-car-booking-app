import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Hourglass, KeyRound, Phone, X } from 'lucide-react'
import type { User } from './auth'
import MapView from './MapView'
import { useLiveDriver } from './useLiveDriver'
import { api, ApiError } from './api'
import AllocationTable, { type Row } from './AllocationTable'
import { canCancel, routeText, telHref, whenLabel, whenText, type Ride } from './rides'

function LiveStatus({ live }: { live: Ride['driverLive'] }) {
  if (!live) return <span className="live-line none"><i />Waiting for your driver's location…</span>
  if (live.state === 'moving') return <span className="live-line moving"><i />Driver is moving · {live.speedKmh} km/h</span>
  if (live.state === 'stopped') return <span className="live-line stopped"><i />Driver has stopped{live.stoppedForSec >= 60 ? ` · ${Math.round(live.stoppedForSec / 60)} min` : ''}</span>
  return <span className="live-line none"><i />Lost the driver's location · last seen {Math.max(1, Math.round(live.ageSec / 60))} min ago</span>
}

export default function TripPage({ rideId, user, onDone }: { rideId: string; user: User; onDone: () => void }) {
  const [ride, setRide] = useState<Ride | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState('')
  const [cancelError, setCancelError] = useState('')
  const tracking = ride?.status === 'accepted' || ride?.status === 'started'
  const socketFix = useLiveDriver(rideId, tracking)
  // Prefer the WebSocket fix while it is fresh; the polled position is the fallback.
  const live = socketFix && now - socketFix.ts < 15_000
    ? { lat: socketFix.lat, lon: socketFix.lon, state: (socketFix.speed ?? 0) > 1.2 ? ('moving' as const) : ('stopped' as const) }
    : ride?.driverLive

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const r = await api<Ride>(`/rides/${rideId}`)
        if (alive) { setRide(r); setError('') }
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return onDone()
        if (alive) setError('Reconnecting…')
      }
    }
    void load()
    const poll = setInterval(load, 2000)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => { alive = false; clearInterval(poll); clearInterval(tick) }
  }, [rideId, onDone])

  async function cancel() {
    if (!window.confirm('Cancel this request?')) return
    try { await api(`/rides/${rideId}/cancel`, { method: 'POST', body: {} }); setCancelError(''); onDone() }
    catch (e) { setCancelError(e instanceof ApiError ? e.message : 'Could not cancel.') }
  }

  if (!ride) return <main className="m-shell"><div className="empty">{error || 'Loading your ride…'}</div></main>

  const arriveAt = ride.acceptedAt && ride.arrivalMin ? new Date(ride.acceptedAt).getTime() + ride.arrivalMin * 60_000 : 0
  const minsLeft = arriveAt ? Math.max(0, Math.ceil((arriveAt - now) / 60_000)) : 0
  const progress = arriveAt && ride.arrivalMin ? Math.min(100, Math.max(4, 100 - ((arriveAt - now) / (ride.arrivalMin * 60_000)) * 100)) : 0
  const firstName = ride.driverName.split(' ')[0]
  const closed = ['cancelled', 'declined', 'completed'].includes(ride.status)
  const assigned = ['approved', 'accepted', 'started'].includes(ride.status)

  const heading: Record<Ride['status'], [string, string]> = {
    requested: ['Waiting for approval', 'An MCCIA admin will review your request. You will be notified when it is approved.'],
    held: ['On hold', ride.holdNote || 'Your request is on hold. We will update you soon.'],
    approved: ['Approved', `${ride.vehicle} with ${ride.driverName} is assigned to you`],
    accepted: [minsLeft <= 1 ? 'Your driver is arriving' : `Arriving in ${minsLeft} min`, `${firstName} is on the way`],
    started: ['Trip in progress', `About ${ride.tripMin} min to your destination`],
    cancelled: ['Request cancelled', ride.cancelReason || 'You can send another request anytime'],
    declined: ['Request declined', ride.cancelReason || 'Your request could not be accepted. You can send another one.'],
    completed: ['Trip completed', 'Thanks for riding with MCCIA Cabs'],
  }
  const [title, sub] = heading[ride.status]

  const route: Row = ['Route', <ol className="route-list" key="route">{routeText(ride).map((p, i) => <li key={i}>{p}</li>)}</ol>]
  const rows: Row[] = [
    ['Booking', ride.id],
    ['Passenger', ride.riderName || user.name],
    route,
    [whenLabel(ride), whenText(ride)],
  ]
  if (assigned) {
    rows.push(['Car', ride.vehicle], ['Car number', ride.plate])
    if (ride.carSeats) rows.push(['Seats', String(ride.carSeats)])
    rows.push(['Driver', ride.driverName])
    if (ride.driverPhone) rows.push(['Driver phone', <a key="tel" className="tel-link" href={telHref(ride.driverPhone)}><Phone size={14} /> {ride.driverPhone}</a>])
    if (ride.otp) rows.push(['Ride PIN', ride.otp])
  } else {
    rows.push(['Passengers', String(ride.passengers)])
  }

  const header = (
    <>
      <button className="trip-back" onClick={onDone} aria-label="Back" type="button"><ArrowLeft size={18} /></button>
      <span className="trip-user">{user.name.split(' ')[0]}</span>
    </>
  )

  return (
    <main className={`m-shell trip ${tracking ? '' : 'no-map'}`}>
      {tracking
        ? <div className="trip-map">
          <MapView pickup={ride.pickupCoords} destination={ride.destinationCoords} status={ride.status}
            live={live} arrivalProgress={progress / 100} tripProgress={ride.startedAt ? (now - new Date(ride.startedAt).getTime()) / (ride.tripMin * 60_000) : 0} />
          {header}
        </div>
        : <div className="trip-bar">{header}</div>}

      <div className="m-main trip-body" role="status" aria-live="polite">
        <div className="card">
          <div className="card-head"><div className="m-title"><h1>{title}</h1><p>{sub}</p></div>
            {ride.status === 'accepted' && <span className="eta-badge"><strong>{minsLeft}</strong><small>min</small></span>}
            {(ride.status === 'requested' || ride.status === 'held') && <span className="wait-badge" aria-hidden="true"><Hourglass size={22} /></span>}</div>
          {tracking && <LiveStatus live={ride.driverLive} />}
          {ride.status === 'accepted' && <div className="bar"><i style={{ width: `${progress}%` }} /></div>}
          {ride.status === 'requested' && <div className="bar searching"><i /></div>}
          {ride.status === 'declined' && <div className="alert error"><X size={16} /> This request was declined.</div>}
          {ride.status === 'started' && <div className="alert ok"><Check size={16} /> Trip started. PIN verified by your driver.</div>}
        </div>

        {ride.otp && !closed && <div className="card pin-card" aria-label="Ride PIN">
          <div className="row"><KeyRound size={16} /><span className="eyebrow">Your ride PIN</span></div>
          <div className="pin-digits" aria-label={`PIN ${ride.otp.split('').join(' ')}`}>{ride.otp.split('').map((d, i) => <span key={i}>{d}</span>)}</div>
          <p className="hint">{ride.status === 'started' ? 'PIN verified. Your trip has started.' : <>Tell this PIN to <strong>{ride.driverName}</strong> when they arrive.</>}</p>
        </div>}

        <div className="card">
          <div className="card-head"><h2>{assigned ? 'Your allocation' : 'Request summary'}</h2>{assigned && ride.driverPhone && <a className="call-btn" href={telHref(ride.driverPhone)} aria-label={`Call ${ride.driverName}`}><Phone size={18} /></a>}</div>
          <AllocationTable rows={rows} label={assigned ? 'Your allocation' : 'Request summary'} />
        </div>

        {cancelError && <div className="alert error" role="alert">{cancelError}</div>}
        {canCancel(ride) && <button type="button" className="btn btn-danger" onClick={cancel}>Cancel request</button>}
        {(closed || ride.status === 'started') && <button type="button" className="btn btn-primary" onClick={onDone}>{ride.status === 'started' ? 'Done' : 'Book another ride'}</button>}
      </div>
    </main>
  )
}
