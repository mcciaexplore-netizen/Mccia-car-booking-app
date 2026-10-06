import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, CarFront, Clock3, History, Hourglass, Inbox, KeyRound, LogOut, MapPin, Navigation, Phone, ShieldCheck, UserRound, UsersRound, WifiOff, X } from 'lucide-react'
import AuthScreen from './AuthScreen'
import MapView from './MapView'
import { api, ApiError, getToken, setToken, type Driver, type Ride } from './api'

const ARRIVALS = [5, 10, 15]
type Tab = 'requests' | 'trip' | 'history' | 'profile'

function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)} min ago`
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

const mapsLink = (r: Ride) => {
  const q = (c: Ride['pickupCoords'], text: string) => (c ? `${c.lat},${c.lon}` : encodeURIComponent(text))
  return `https://www.google.com/maps/dir/?api=1&origin=${q(r.pickupCoords, r.pickup)}&destination=${q(r.destinationCoords, r.destination)}`
}

function RiderBlock({ ride }: { ride: Ride }) {
  return (
    <div className="row">
      <span className="avatar">{ride.riderName.charAt(0).toUpperCase()}</span>
      <div className="grow"><strong>{ride.riderName}</strong><small>{ride.passengers} passenger{ride.passengers > 1 ? 's' : ''}{ride.pickupTime && ` · scheduled ${new Date(ride.pickupTime).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}</small></div>
      {ride.phone && <a className="call-btn" href={`tel:${ride.phone.replace(/[^+\d]/g, '')}`} aria-label={`Call ${ride.riderName}`}><Phone size={17} /></a>}
    </div>
  )
}

function Route({ ride }: { ride: Ride }) {
  return (
    <div className="stack tight-stack">
      <div className="route-stop"><span className="rdot a"><MapPin size={13} /></span><div><small>Pickup</small><strong>{ride.pickup}</strong></div></div>
      <div className="route-stop"><span className="rdot b"><Navigation size={13} /></span><div><small>Destination</small><strong>{ride.destination}</strong></div></div>
    </div>
  )
}

export default function App() {
  const [driver, setDriver] = useState<Driver | null>(null)
  const [checking, setChecking] = useState(() => !!getToken())
  const [rides, setRides] = useState<Ride[]>([])
  const [offline, setOffline] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [arrival, setArrival] = useState<Record<string, number>>({})
  const [pin, setPin] = useState<Record<string, string>>({})
  const [verified, setVerified] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('requests')

  const signedOut = useCallback(() => { setToken(null); setDriver(null); setRides([]) }, [])

  useEffect(() => {
    if (!getToken()) return
    api<{ user: Driver }>('/auth/me').then((r) => setDriver(r.user)).catch((e: ApiError) => { if (e.status === 401) setToken(null) }).finally(() => setChecking(false))
  }, [])

  const refresh = useCallback(async () => {
    try {
      setRides(await api<Ride[]>('/driver/rides'))
      setOffline(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) signedOut()
      else setOffline(true)
    }
  }, [signedOut])

  useEffect(() => {
    if (!driver) return
    const first = setTimeout(refresh, 0)
    const timer = setInterval(refresh, 2000)
    return () => { clearTimeout(first); clearInterval(timer) }
  }, [driver, refresh])

  async function accept(r: Ride) {
    setBusy(r.id); setError('')
    try { await api(`/driver/rides/${r.id}/accept`, { body: { arrivalMin: arrival[r.id] ?? 10 } }); await refresh() }
    catch (e) { setError((e as Error).message) }
    setBusy(null)
  }

  async function verify(e: FormEvent, r: Ride) {
    e.preventDefault()
    setBusy(r.id); setError('')
    try {
      await api('/driver/verify', { body: { otp: pin[r.id] ?? '' } })
      setVerified(r.id); setTab('trip')
      await refresh()
    } catch (err) { setError((err as Error).message) }
    setBusy(null)
  }

  async function act(r: Ride, action: 'decline' | 'complete') {
    if (action === 'decline' && !window.confirm(`Tell ${r.riderName} you are busy and cancel this ride?`)) return
    setBusy(r.id); setError('')
    try {
      await api(`/driver/rides/${r.id}/${action}`, { method: 'POST', body: {} })
      if (action === 'complete') setTab('requests')
      await refresh()
    } catch (err) { setError((err as Error).message) }
    setBusy(null)
  }

  if (checking) return <main className="m-shell"><div className="empty">Loading…</div></main>
  if (!driver) return <AuthScreen onAuthed={(d) => { setDriver(d); setTab('requests') }} />

  const pending = rides.filter((r) => r.status === 'requested').sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
  const waiting = rides.filter((r) => r.status === 'accepted')
  const active = rides.find((r) => r.status === 'started')
  const history = rides.filter((r) => ['completed', 'cancelled', 'declined'].includes(r.status))
  const todo = pending.length + waiting.length

  const tabs: { id: Tab; label: string; icon: typeof Inbox; badge?: number }[] = [
    { id: 'requests', label: 'Requests', icon: Inbox, badge: todo },
    { id: 'trip', label: 'Trip', icon: Navigation, badge: active ? 1 : 0 },
    { id: 'history', label: 'History', icon: History },
    { id: 'profile', label: 'Profile', icon: UserRound },
  ]

  return (
    <div className="m-shell">
      <header className="m-header">
        <div className="m-brand"><img src="/mccia-logo.png" alt="MCCIA" /><span>Driver</span></div>
        <span className={`chip ${offline ? 'red' : 'green'}`}>{offline ? 'Offline' : 'Online'}</span>
      </header>

      <main className="m-main">
        {offline && <div className="alert warn"><WifiOff size={16} /> Cannot reach the server. Retrying…</div>}
        {error && <div className="alert error" role="alert">{error}</div>}

        {tab === 'requests' && <>
          <div className="m-title"><span className="eyebrow">Hi {driver.name.split(' ')[0]}</span><h1>Ride requests</h1><p>Riders who pick you appear here automatically.</p></div>
          {active && <button type="button" className="card active-ride" onClick={() => setTab('trip')}><span className="row"><span className="avatar"><Navigation size={18} /></span><span className="grow"><strong>Trip in progress</strong><small>{active.riderName} · tap to open the map</small></span></span></button>}

          <div className="card-head"><h2>New requests</h2><span className="chip">{pending.length}</span></div>
          {pending.length === 0 && <div className="card empty">No pending requests. New bookings will appear here.</div>}
          {pending.map((r) => (
            <article className="card" key={r.id}>
              <div className="card-head"><span className="eyebrow">{r.id}</span><small className="muted">{ago(r.createdAt)}</small></div>
              <RiderBlock ride={r} />
              <Route ride={r} />
              <div className="meta-line"><span><Clock3 size={14} /> {r.tripMin} min trip</span><span><CarFront size={14} /> {r.vehicle} · {r.plate}</span><span><UsersRound size={14} /> {r.passengers}</span></div>
              {r.slot && !r.slot.ready && <div className="alert warn"><Hourglass size={16} /><span><b>Queued · #{r.slot.position + 1}.</b> {r.slot.blockedBy === 'driver' ? 'You have' : r.slot.blockedBy === 'car' ? `The ${r.vehicle} has` : `You and the ${r.vehicle} have`} {r.slot.position} ride{r.slot.position > 1 ? 's' : ''} ahead. Slot {clock(r.slot.startAt)} – {clock(r.slot.endAt)}.</span></div>}
              {(!r.slot || r.slot.ready) && <div className="field"><span>I can reach the rider in</span><div className="seg">{ARRIVALS.map((m) => <button type="button" key={m} className={(arrival[r.id] ?? 10) === m ? 'on' : ''} onClick={() => setArrival((a) => ({ ...a, [r.id]: m }))}>{m} min</button>)}</div></div>}
              <button className="btn btn-primary" onClick={() => accept(r)} disabled={busy === r.id || (!!r.slot && !r.slot.ready)}><Check size={16} /> {r.slot && !r.slot.ready ? 'Waiting for your turn' : busy === r.id ? 'Accepting…' : 'Accept'}</button>
              <button className="btn btn-danger" onClick={() => act(r, 'decline')} disabled={busy === r.id}><X size={15} /> I am busy, cancel this ride</button>
            </article>
          ))}

          {waiting.length > 0 && <>
            <div className="card-head"><h2>Verify your rider</h2><span className="chip">{waiting.length}</span></div>
            {waiting.map((r) => (
              <article className="card" key={r.id}>
                <div className="card-head"><span className="eyebrow">{r.id}</span><span className="chip green"><Check size={12} /> Arriving in {r.arrivalMin} min</span></div>
                <RiderBlock ride={r} />
                <Route ride={r} />
                <div className="mini-map"><MapView pickup={r.pickupCoords} destination={r.destinationCoords} showRoute={false} /></div>
                <form className="stack tight-stack" onSubmit={(e) => verify(e, r)}>
                  <span className="field-label"><KeyRound size={14} /> Ask the rider for their 4-digit PIN</span>
                  <span className="input"><input className="pin-input" inputMode="numeric" maxLength={4} pattern="\d{4}" placeholder="• • • •" value={pin[r.id] ?? ''} onChange={(e) => setPin((o) => ({ ...o, [r.id]: e.target.value.replace(/\D/g, '') }))} required aria-label="Rider PIN" /></span>
                  <button className="btn btn-primary" type="submit" disabled={busy === r.id}><ShieldCheck size={16} /> Verify and start trip</button>
                </form>
                <button className="btn btn-danger" onClick={() => act(r, 'decline')} disabled={busy === r.id}><X size={15} /> I am busy, cancel this ride</button>
              </article>
            ))}
          </>}
        </>}

        {tab === 'trip' && <>
          <div className="m-title"><h1>Current trip</h1><p>{active ? `With ${active.riderName}` : 'No trip in progress'}</p></div>
          {!active ? <div className="card empty"><Navigation size={22} />No trip right now. Accept a request and verify the rider to start.</div> : <>
            {verified === active.id && <div className="alert ok" role="status"><Check size={16} /> Rider verified. Trip started!</div>}
            <div className="trip-map"><MapView pickup={active.pickupCoords} destination={active.destinationCoords} showRoute /></div>
            <div className="card">
              <RiderBlock ride={active} />
              <Route ride={active} />
              <div className="meta-line"><span><Clock3 size={14} /> {active.tripMin} min trip</span><span><CarFront size={14} /> {active.vehicle} · {active.plate}</span></div>
            </div>
            <a className="btn btn-ghost" href={mapsLink(active)} target="_blank" rel="noreferrer"><Navigation size={16} /> Open in Google Maps</a>
            <button className="btn btn-primary" onClick={() => act(active, 'complete')} disabled={busy === active.id}><Check size={16} /> End trip</button>
          </>}
        </>}

        {tab === 'history' && <>
          <div className="m-title"><h1>Ride history</h1><p>{history.filter((r) => r.status === 'completed').length} completed of {history.length}</p></div>
          {history.length === 0 && <div className="card empty">No past rides yet.</div>}
          {history.map((r) => (
            <article className="card" key={r.id}>
              <div className="card-head"><span className="eyebrow">{r.id}</span><span className={`chip ${r.status === 'completed' ? 'green' : r.status === 'declined' ? 'red' : 'grey'}`}>{r.status === 'completed' ? 'Completed' : r.status === 'declined' ? 'You declined' : 'Cancelled by rider'}</span></div>
              <small className="muted">{new Date(r.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}{r.status === 'completed' && r.completedAt && ` · ended ${clock(r.completedAt)}`}</small>
              <RiderBlock ride={r} />
              <div className="route-line"><b>{r.pickup}</b> → <b>{r.destination}</b></div>
              <div className="meta-line"><span><Clock3 size={14} /> {r.tripMin} min</span><span><CarFront size={14} /> {r.vehicle} · {r.plate}</span></div>
            </article>
          ))}
        </>}

        {tab === 'profile' && <>
          <div className="m-title"><h1>Profile</h1><p>Your driver account.</p></div>
          <div className="card"><div className="row"><span className="avatar">{driver.name.charAt(0).toUpperCase()}</span><div className="grow"><strong>{driver.name}</strong><small>{driver.phone}</small></div></div></div>
          <div className="card"><div className="facts"><div><small>Completed</small><strong>{history.filter((r) => r.status === 'completed').length}</strong></div><div><small>Requests waiting</small><strong>{pending.length}</strong></div></div></div>
          <button type="button" className="btn btn-ghost" onClick={() => { signedOut() }}><LogOut size={16} /> Sign out</button>
        </>}
      </main>

      <nav className="m-tabs" aria-label="Main">
        {tabs.map(({ id, label, icon: Icon, badge }) => <button key={id} type="button" className={`m-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}><span className="tab-icon"><Icon size={20} />{!!badge && <i>{badge}</i>}</span>{label}</button>)}
      </nav>
    </div>
  )
}
