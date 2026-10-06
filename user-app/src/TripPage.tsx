import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Clock3, Hourglass, KeyRound, Mail, MapPin, Navigation, Phone, X } from 'lucide-react'
import type { User } from './auth'
import MapView from './MapView'
import type { Coords } from './places'
import { api, ApiError } from './api'

type Ride = {
  id: string; riderName: string; pickup: string; destination: string; passengers: number
  driverName: string; driverPhone: string; vehicle: string; plate: string
  otp: string; otpDelivery: 'pending' | 'sent' | 'failed' | 'not-configured'; emailMasked: string; tripMin: number; pickupEtaMin: number
  status: 'requested' | 'accepted' | 'started' | 'cancelled' | 'declined' | 'completed'
  slot: { startAt: string; endAt: string; position: number; waitMin: number; ready: boolean; blockedBy: 'car' | 'driver' | 'both' | null } | null
  arrivalMin: number | null; acceptedAt: string | null; startedAt: string | null
  pickupCoords: Coords | null; destinationCoords: Coords | null
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export default function TripPage({ rideId, user, onDone }: { rideId: string; user: User; onDone: () => void }) {
  const [ride, setRide] = useState<Ride | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState('')

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
    if (!window.confirm('Cancel this ride?')) return
    await api(`/rides/${rideId}/cancel`, { method: 'POST', body: {} }).catch(() => undefined)
  }

  if (!ride) return <main className="m-shell"><div className="empty">{error || 'Loading your ride…'}</div></main>

  const arriveAt = ride.acceptedAt && ride.arrivalMin ? new Date(ride.acceptedAt).getTime() + ride.arrivalMin * 60_000 : 0
  const minsLeft = arriveAt ? Math.max(0, Math.ceil((arriveAt - now) / 60_000)) : 0
  const progress = arriveAt && ride.arrivalMin ? Math.min(100, Math.max(4, 100 - ((arriveAt - now) / (ride.arrivalMin * 60_000)) * 100)) : 0
  const initials = ride.driverName.split(' ').map((p) => p[0]).join('').slice(0, 2)
  const firstName = ride.driverName.split(' ')[0]
  const slot = ride.slot
  const queued = ride.status === 'requested' && !!slot && !slot.ready
  const closed = ['cancelled', 'declined', 'completed'].includes(ride.status)
  const waitMin = slot ? Math.max(0, Math.ceil((new Date(slot.startAt).getTime() - now) / 60_000)) : 0
  const whyBusy = slot?.blockedBy === 'driver' ? `${firstName} is busy with another ride`
    : slot?.blockedBy === 'car' ? `The ${ride.vehicle} is busy with another ride`
    : `${firstName} and the ${ride.vehicle} are both busy`

  const heading = {
    requested: queued
      ? [`You are #${(slot?.position ?? 0) + 1} in the queue`, `Your slot starts around ${time(slot!.startAt)} (about ${waitMin} min)`]
      : [`Contacting ${firstName}…`, 'Waiting for your driver to accept'],
    accepted: [minsLeft <= 1 ? 'Your driver is arriving' : `Arriving in ${minsLeft} min`, `${firstName} accepted your ride`],
    started: ['Enjoy your ride', `About ${ride.tripMin} min to your destination`],
    cancelled: ['Ride cancelled', 'You can book another cab anytime'],
    declined: [`${firstName} is busy`, 'Your driver cancelled this ride. You can book again or pick another driver.'],
    completed: ['Trip completed', 'Thanks for riding with MCCIA Cabs'],
  }[ride.status]

  return (
    <main className="m-shell trip">
      <div className="trip-map">
        <MapView pickup={ride.pickupCoords} destination={ride.destinationCoords} status={ride.status}
          arrivalProgress={progress / 100} tripProgress={ride.startedAt ? (now - new Date(ride.startedAt).getTime()) / (ride.tripMin * 60_000) : 0} />
        <button className="trip-back" onClick={onDone} aria-label="Back" type="button"><ArrowLeft size={18} /></button>
        <span className="trip-user">{user.name.split(' ')[0]}</span>
      </div>

      <div className="m-main trip-body" role="status" aria-live="polite">
        <div className="card">
          <div className="card-head"><div className="m-title"><h1>{heading[0]}</h1><p>{heading[1]}</p></div>{ride.status === 'accepted' && <span className="eta-badge"><strong>{minsLeft}</strong><small>min</small></span>}</div>
          {ride.status === 'accepted' && <div className="bar"><i style={{ width: `${progress}%` }} /></div>}
          {ride.status === 'requested' && !queued && <div className="bar searching"><i /></div>}
          {queued && slot && <>
            <div className="alert warn"><Hourglass size={16} /> {whyBusy}</div>
            <div className="facts">
              <div><small>Your slot</small><strong>{time(slot.startAt)} – {time(slot.endAt)}</strong></div>
              <div><small>Estimated wait</small><strong>~{waitMin} min</strong></div>
              <div><small>Queue position</small><strong>#{slot.position + 1}{slot.position > 0 ? ` (${slot.position} ahead)` : ''}</strong></div>
              <div><small>Your ride</small><strong>{ride.vehicle} · {ride.driverName}</strong></div>
            </div>
          </>}
          {ride.status === 'declined' && <div className="alert error"><X size={16} /> {ride.driverName} is busy and cancelled this ride.</div>}
          {ride.status === 'started' && <div className="alert ok"><Check size={16} /> Trip started. PIN verified by your driver.</div>}
        </div>

        {(ride.status === 'accepted' || ride.status === 'started') && <div className="card"><div className="row"><span className="avatar">{initials}</span><div className="grow"><strong>{ride.driverName}</strong><small>{ride.vehicle} · {ride.plate}</small></div><a className="call-btn" href={`tel:${ride.driverPhone.replace(/[^+\d]/g, '')}`} aria-label={`Call ${ride.driverName}`}><Phone size={18} /></a></div></div>}

        {!closed && <div className="card pin-card" aria-label="Ride PIN">
          <div className="row"><KeyRound size={16} /><span className="eyebrow">Your ride PIN</span></div>
          <div className="pin-digits" aria-label={`PIN ${ride.otp.split('').join(' ')}`}>{ride.otp.split('').map((d, i) => <span key={i}>{d}</span>)}</div>
          <p className="hint">{ride.status === 'started' ? 'PIN verified. Your trip has started.' : <>Tell this 4-digit PIN to <strong>{ride.driverName}</strong> when they arrive.</>}</p>
          <div className="row hint"><Mail size={14} /><span>{ride.otpDelivery === 'sent' ? `Also emailed to ${ride.emailMasked}.` : ride.otpDelivery === 'failed' ? 'Email could not be sent. Use the PIN shown here.' : ride.otpDelivery === 'pending' ? 'Sending the PIN to your email…' : 'Email is not set up, so the PIN is shown here only.'}</span></div>
        </div>}

        <div className="card">
          <div className="route-stop"><span className="rdot a"><MapPin size={13} /></span><div><small>Pickup</small><strong>{ride.pickup}</strong></div></div>
          <div className="route-stop"><span className="rdot b"><Navigation size={13} /></span><div><small>Drop-off</small><strong>{ride.destination}</strong></div></div>
          <div className="meta-line"><span><Clock3 size={14} /> {ride.tripMin} min trip</span><span>{ride.passengers} passenger{ride.passengers > 1 ? 's' : ''}</span><span>{ride.id}</span></div>
        </div>

        {(ride.status === 'requested' || ride.status === 'accepted') && <button type="button" className="btn btn-danger" onClick={cancel}><X size={16} /> Cancel ride</button>}
        {(closed || ride.status === 'started') && <button type="button" className="btn btn-primary" onClick={onDone}>{ride.status === 'started' ? 'Done' : 'Book another ride'}</button>}
      </div>
    </main>
  )
}
