import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  AlertCircle, ArrowDownToLine, ArrowRight, CarFront, Check, ChevronRight, Clock3, LayoutDashboard, ListOrdered, LogOut,
  Menu, Plus, ShieldCheck, UserRound, UsersRound, X, Eye, EyeOff, Lock, Mail,
} from 'lucide-react'
import FleetMap from './FleetMap'
import { api, ApiError, getToken, setToken } from './api'

type Coords = { lat: number; lon: number }
type Ride = {
  id: string; status: string; riderName: string; phone: string; passengers: number; extraPassengers: number
  pickup: string; destination: string; pickupCoords: Coords | null; destinationCoords: Coords | null
  driverId: string; driverName: string; vehicle: string; plate: string; tripMin: number; createdAt: string
  phase: 'waiting' | 'to-pickup' | 'on-trip'; progress: number; etaMin: number | null
  waitMin: number; startAt: string | null; blockedBy: 'car' | 'driver' | 'both' | null
}
type Car = { name: string; plate: string; seats: number; depot: Coords; status: 'busy' | 'idle'; freeInMin: number; trip: Ride | null; queued: number }
type Overview = { now: string; cars: Car[]; trips: Ride[]; queue: Ride[] }
type Driver = { id: string; name: string }
type Admin = { id: string; name: string; email: string }
type View = 'overview' | 'trips' | 'queue'

const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?'
const shortPlace = (place: string) => place.split(',').slice(0, 2).join(',').trim()
const riderCount = (ride: Ride) => `${ride.passengers} ${ride.passengers === 1 ? 'rider' : 'riders'}`
const clockTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '')
const phaseLabel = (ride: Ride) => (ride.phase === 'to-pickup' ? 'Heading to pickup' : 'Trip in progress')

function AuthScreen({ onAuthed }: { onAuthed: (admin: Admin) => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(''); setBusy(true)
    try {
      const body = mode === 'signup' ? { name, email, password } : { email, password }
      const res = await api<{ token: string; user: Admin }>(`/auth/admin/${mode}`, { body })
      setToken(res.token)
      onAuthed(res.user)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    } finally { setBusy(false) }
  }

  return (
    <main className="auth-page">
      <aside className="auth-aside">
        <img src="/mccia-logo.png" alt="MCCIA" className="auth-logo" />
        <div>
          <span className="eyebrow">MCCIA Cabs · Admin</span>
          <h1>Every ride, every car, in one place.</h1>
          <p>Watch trips live, manage the rider queue and keep the fleet moving.</p>
        </div>
        <small><ShieldCheck size={14} /> Sign in with your admin account to continue.</small>
      </aside>
      <section className="auth-panel">
        <form className="auth-card" onSubmit={submit}>
          <div className="auth-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setError('') }}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError('') }}>Sign up</button>
          </div>
          <div className="m-title"><h1>{mode === 'signin' ? 'Welcome back' : 'Create an admin account'}</h1><p>{mode === 'signin' ? 'Sign in to manage the fleet.' : 'Set up your admin account to manage the fleet.'}</p></div>
          {error && <div className="alert error" role="alert"><AlertCircle size={16} /> {error}</div>}
          {mode === 'signup' && <label className="field"><span>Full name</span><span className="input"><UserRound size={16} /><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></span></label>}
          <label className="field"><span>Work email</span><span className="input"><Mail size={16} /><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@mcciapune.com" required /></span></label>
          <label className="field"><span>Password</span><span className="input"><Lock size={16} /><input value={password} onChange={(e) => setPassword(e.target.value)} type={visible ? 'text' : 'password'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={mode === 'signup' ? 6 : undefined} required /><button type="button" className="link-btn" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'} <ArrowRight size={17} /></button>
        </form>
      </section>
    </main>
  )
}

function Dashboard({ admin, onLogout }: { admin: Admin; onLogout: () => void }) {
  const [clock, setClock] = useState(() => new Date())
  const [data, setData] = useState<Overview>({ now: new Date().toISOString(), cars: [], trips: [], queue: [] })
  const [online, setOnline] = useState(true)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [queueFilter, setQueueFilter] = useState('all')
  const [mapFilter, setMapFilter] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [view, setView] = useState<View>('overview')
  const [showForm, setShowForm] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [toast, setToast] = useState('')
  const { cars, trips, queue } = data
  const totalCars = cars.length
  const idleCars = cars.filter((car) => car.status === 'idle').length
  const visibleQueue = queueFilter === 'all' ? queue : queue.filter((r) => r.vehicle === queueFilter)
  const today = clock.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }, [])

  const refresh = useCallback(async () => {
    try {
      setData(await api<Overview>('/admin/overview'))
      setOnline(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onLogout()
      else setOnline(false)
    }
  }, [onLogout])

  // Every panel reads the same snapshot, so trips, queue, map and metrics always agree.
  useEffect(() => {
    void refresh()
    const poll = window.setInterval(refresh, 4000)
    const timer = window.setInterval(() => setClock(new Date()), 15_000)
    api<Driver[]>('/drivers').then(setDrivers).catch(() => undefined)
    return () => { window.clearInterval(poll); window.clearInterval(timer) }
  }, [refresh])

  async function post(path: string, body?: unknown) {
    await api(path, { method: 'POST', body: body ?? {} })
    await refresh()
  }

  async function run(action: () => Promise<void>, success: string) {
    try { await action(); notify(success) } catch (err) { notify(err instanceof Error ? err.message : 'Something went wrong') }
  }

  function exportData() {
    const headings = ['record_type', 'id', 'passenger', 'extra_passengers', 'driver', 'vehicle', 'plate', 'origin', 'destination', 'status', 'created_at']
    const rows = [...trips, ...queue].map((r) => [r.status === 'requested' ? 'request' : 'trip', r.id, r.riderName, r.extraPassengers, r.driverName, r.vehicle, r.plate, r.pickup, r.destination, r.status, r.createdAt])
    const csv = [headings, ...rows].map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `mccia-cabs-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    notify('Booking data exported as CSV')
  }

  function addRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const entry = new FormData(event.currentTarget)
    void run(async () => {
      await post('/admin/rides', {
        riderName: String(entry.get('name')).trim(), phone: String(entry.get('phone') ?? '').trim(),
        pickup: String(entry.get('origin')).trim(), destination: String(entry.get('destination')).trim(),
        car: String(entry.get('selectedCar')), driverId: String(entry.get('driverId')), passengers: Number(entry.get('passengers')) || 1,
      })
      setShowForm(false)
      setView('queue')
    }, 'Request added to the queue')
  }

  function go(next: View) {
    setView(next); setNavOpen(false)
    const target = next === 'queue' ? 'in-queue' : next === 'trips' ? 'active-trips' : null
    if (target) window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const nav: { id: View; label: string; icon: typeof LayoutDashboard; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'trips', label: 'Live trips', icon: CarFront, count: trips.length },
    { id: 'queue', label: 'Request queue', icon: ListOrdered, count: queue.length },
  ]

  return (
    <div className="admin-shell">
      <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
        <div className="side-brand"><img src="/mccia-logo.png" alt="MCCIA" /><span>Cabs · Admin</span></div>
        <nav className="side-nav" aria-label="Main">
          <span className="eyebrow">Operations</span>
          {nav.map(({ id, label, icon: Icon, count }) => <button key={id} type="button" className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => go(id)}><Icon size={18} />{label}{!!count && <span className="nav-count">{count}</span>}</button>)}
          <button type="button" className="nav-item" onClick={exportData}><ArrowDownToLine size={18} /> Export data</button>
        </nav>
        <div className="side-foot">
          <div className="sync"><span className={`dot ${online ? 'on' : 'off'}`} /><span>{online ? 'Live · syncs every 4s' : 'Reconnecting to API…'}</span></div>
          <div className="profile"><span className="avatar">{initials(admin.name)}</span><span className="grow"><strong>{admin.name}</strong><small>{admin.email}</small></span><button type="button" className="icon-btn" onClick={onLogout} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button></div>
        </div>
      </aside>
      {navOpen && <button className="backdrop" aria-label="Close menu" onClick={() => setNavOpen(false)} />}

      <main className="main">
        <header className="topbar">
          <button type="button" className="icon-btn menu-btn" onClick={() => setNavOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="crumbs"><span>Operations</span><ChevronRight size={14} /><strong>{view === 'overview' ? 'Overview' : view === 'trips' ? 'Live trips' : 'Request queue'}</strong></div>
          <span className={`chip ${online ? 'green' : 'red'}`}><span className="dot on" /> {online ? 'LIVE' : 'OFFLINE'}</span>
        </header>

        <div className="page">
          <div className="page-head">
            <div><span className="eyebrow">{today} · Pune</span><h1>Fleet operations</h1><p>What is happening across the fleet right now.</p></div>
            <div className="head-actions"><button type="button" className="btn btn-ghost" onClick={exportData}><ArrowDownToLine size={16} /> Export</button><button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> New request</button></div>
          </div>

          <section className="metrics" aria-label="Fleet summary">
            <article className="card metric"><span className="metric-label">Fleet availability</span><div className="metric-value">{idleCars}<small> / {totalCars}</small></div><div className="bar"><i style={{ width: `${totalCars ? (trips.length / totalCars) * 100 : 0}%` }} /></div><small className="muted">{idleCars ? `${idleCars} idle and ready` : 'All cars on trips'}</small></article>
            <article className="card metric"><span className="metric-label">Trips in progress</span><div className="metric-value">{trips.length}</div><small className="muted">Across {trips.length} active {trips.length === 1 ? 'vehicle' : 'vehicles'}</small></article>
            <article className="card metric"><span className="metric-label">Riders waiting</span><div className="metric-value">{queue.length}</div><small className="muted">{queue.length ? `Oldest request · ${Math.max(1, Math.floor((clock.getTime() - new Date(queue[0].createdAt).getTime()) / 60_000))} min` : 'Queue is clear'}</small></article>
          </section>

          <section className="ops-grid">
            <div className="card panel map-panel">
              <div className="card-head"><div><h2>Fleet map</h2><small className="muted">Where each car is right now</small></div>
                <span className="input select-input"><select value={mapFilter} onChange={(e) => setMapFilter(e.target.value)} aria-label="Filter vehicles"><option value="all">All vehicles</option>{cars.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</select></span></div>
              <div className="map-canvas"><FleetMap cars={cars} filter={mapFilter} /></div>
              <div className="map-legend"><span><i className="swatch live" /> {trips.length} on trip</span><span><i className="swatch idle" /> {idleCars} idle</span></div>
            </div>

            <aside className="card panel queue-panel">
              <div className="card-head"><div><span className="eyebrow">Queue · {queue.length} waiting</span><h2>{idleCars === 0 && totalCars > 0 ? 'Cars are all booked' : `${idleCars} ${idleCars === 1 ? 'car is' : 'cars are'} ready`}</h2></div><span className={`status-mark ${idleCars ? 'ready' : ''}`}>{idleCars ? <Check size={18} /> : <Clock3 size={18} />}</span></div>
              <div className="filter-chips" role="tablist" aria-label="Filter queue by car"><button type="button" className={queueFilter === 'all' ? 'on' : ''} onClick={() => setQueueFilter('all')}>All <span>{queue.length}</span></button>{cars.map((c) => <button type="button" key={c.name} className={queueFilter === c.name ? 'on' : ''} onClick={() => setQueueFilter(c.name)}>{c.name} <span>{c.queued}</span></button>)}</div>
              <div className="rider-queue">
                {visibleQueue.length ? visibleQueue.map((r) => {
                  const car = cars.find((c) => c.name === r.vehicle)
                  const position = queue.filter((q) => q.vehicle === r.vehicle).findIndex((q) => q.id === r.id) + 1
                  const open = expanded === r.id
                  return <article className={`rq ${open ? 'open' : ''}`} key={r.id}>
                    <button type="button" className="rq-main" onClick={() => setExpanded(open ? null : r.id)} aria-expanded={open}>
                      <span className="rq-avatar">{initials(r.riderName)}<i>{position}</i></span>
                      <span className="grow"><strong>{r.riderName}</strong><small>{riderCount(r)} · {r.vehicle} · {r.driverName}</small><small>{shortPlace(r.pickup)} → {shortPlace(r.destination)}</small></span>
                      <span className="rq-eta"><b>{r.waitMin}<small> min</small></b><em>{r.waitMin === 0 ? 'car is free' : `idle ~${clockTime(r.startAt)}`}</em></span>
                    </button>
                    {open && <div className="rq-detail">
                      {car?.trip ? <>
                        <p><CarFront size={14} /> {car.name} · {car.plate} is out with <b>{car.trip.driverName}</b> carrying <b>{car.trip.riderName}</b>{car.trip.extraPassengers > 0 ? ` +${car.trip.extraPassengers}` : ''}</p>
                        <div className="bar"><i style={{ width: `${Math.round(car.trip.progress * 100)}%` }} /></div>
                        <p className="muted"><Clock3 size={14} /> {car.trip.etaMin} min journey left, then {car.name} is idle</p>
                      </> : <p><Check size={14} /> {car?.name} is idle{r.blockedBy === 'driver' ? `, but ${r.driverName} is busy` : ' and can be dispatched now'}</p>}
                      <p className="muted"><Clock3 size={14} /> Journey {r.tripMin} min · slot opens in {r.waitMin} min · ahead: {Math.max(0, position - 1)}</p>
                      <div className="rq-actions"><span className="muted">{r.id} · {r.phone || 'no phone'}</span><button type="button" className="btn btn-danger compact" onClick={() => run(() => post(`/admin/rides/${r.id}/cancel`), `${r.riderName} removed from the queue`)}><X size={14} /> Remove</button></div>
                    </div>}
                  </article>
                }) : <div className="empty"><Check size={20} />No riders waiting{queueFilter !== 'all' ? ` for ${queueFilter}` : ''}</div>}
              </div>
              <button type="button" className="link-btn add-link" onClick={() => setShowForm(true)}>Add rider to queue <ArrowRight size={15} /></button>
            </aside>
          </section>

          <section className="card panel" id="active-trips">
            <div className="card-head"><div><h2>Active trips <span className="chip">{trips.length}</span></h2><small className="muted">Driver → car → rider for every vehicle on the road</small></div></div>
            {trips.length ? <div className="table">
              <div className="trow thead"><span>Driver</span><span>Car</span><span>Rider</span><span>Route</span><span>ETA</span><span /></div>
              {trips.map((t) => <div className="trow" key={t.id}>
                <span className="cell"><span className="avatar sm"><UserRound size={14} /></span><span className="grow"><strong>{t.driverName}</strong><small>Driver</small></span></span>
                <span className="cell"><span className="grow"><strong>{t.vehicle}</strong><small>{t.plate}</small></span></span>
                <span className="cell"><span className="avatar sm">{initials(t.riderName)}</span><span className="grow"><strong>{t.riderName}{t.extraPassengers > 0 && <em className="extra">+{t.extraPassengers} extra</em>}</strong><small>{riderCount(t)}</small></span></span>
                <span className="cell"><span className="grow"><strong>{shortPlace(t.pickup)}</strong><small>→ {shortPlace(t.destination)}</small></span></span>
                <span className="cell"><span className="grow"><strong>{t.etaMin} min</strong><small>{phaseLabel(t)}</small><i className="bar thin"><b style={{ width: `${Math.round(t.progress * 100)}%` }} /></i></span></span>
                <span className="cell end"><button type="button" className="btn btn-ghost compact" title="Mark trip complete; the car becomes idle" onClick={() => run(() => post(`/admin/rides/${t.id}/complete`), `${t.vehicle} is back and idle`)}><Check size={15} /> Complete</button></span>
              </div>)}
            </div> : <div className="empty"><CarFront size={22} />No active trips. All cars are ready.</div>}
          </section>

          <section className="card panel" id="in-queue">
            <div className="card-head"><div><h2>In queue <span className="chip warn">{queue.length}</span></h2><small className="muted">Riders waiting for their chosen car to come back</small></div></div>
            {queue.length ? <div className="table">
              <div className="trow thead qrow"><span>#</span><span>Rider</span><span>Route</span><span>Car and driver</span><span>Car idle in</span></div>
              {queue.map((r, i) => <div className="trow qrow" key={r.id}>
                <span className="muted">{String(i + 1).padStart(2, '0')}</span>
                <span className="cell"><span className="avatar sm">{initials(r.riderName)}</span><span className="grow"><strong>{r.riderName}</strong><small>{riderCount(r)} · waiting {Math.max(1, Math.floor((clock.getTime() - new Date(r.createdAt).getTime()) / 60_000))} min</small></span></span>
                <span className="cell"><span className="grow"><strong>{shortPlace(r.pickup)}</strong><small>→ {shortPlace(r.destination)}</small></span></span>
                <span className="cell"><span className="grow"><strong>{r.vehicle}</strong><small>{r.driverName}</small></span></span>
                <span className="cell"><span className={`chip ${r.waitMin ? 'warn' : 'green'}`}>{r.waitMin ? `${r.waitMin} min` : 'Available'}</span></span>
              </div>)}
            </div> : <div className="empty"><Check size={22} />No riders waiting right now.</div>}
          </section>

          <footer className="page-foot"><span className="dot on" /> Fleet synced · MCCIA Cabs admin</footer>
        </div>
      </main>

      {showForm && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowForm(false) }}>
        <section className="modal card" role="dialog" aria-modal="true" aria-labelledby="request-title">
          <div className="card-head"><div><span className="eyebrow">New booking</span><h2 id="request-title">Add a rider request</h2></div><button type="button" className="icon-btn" aria-label="Close" onClick={() => setShowForm(false)}><X size={18} /></button></div>
          <p className="muted">{idleCars === 0 ? 'All cars are on trips. This rider will join the queue.' : 'A car is idle and can be dispatched right away.'}</p>
          <form className="stack" onSubmit={addRequest}>
            <label className="field"><span>Rider name</span><span className="input"><input name="name" placeholder="Full name" required /></span></label>
            <label className="field"><span>Phone</span><span className="input"><input name="phone" type="tel" placeholder="+91 98765 43210" /></span></label>
            <label className="field"><span>Pickup location</span><span className="input"><input name="origin" placeholder="Where should we pick them up?" required /></span></label>
            <label className="field"><span>Destination</span><span className="input"><input name="destination" placeholder="Where are they going?" required /></span></label>
            <div className="form-grid">
              <label className="field"><span>Car</span><span className="input"><select name="selectedCar" defaultValue={cars[0]?.name} required>{cars.map((c) => <option key={c.name} value={c.name}>{c.name} · {c.status === 'busy' ? `idle in ${c.freeInMin} min` : 'Idle'}</option>)}</select></span></label>
              <label className="field"><span>Driver</span><span className="input"><select name="driverId" required>{drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></span></label>
              <label className="field"><span>Passengers</span><span className="input"><input name="passengers" type="number" min="1" max="6" defaultValue="1" required /></span></label>
            </div>
            <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button><button type="submit" className="btn btn-primary"><UsersRound size={16} /> Add to {idleCars === 0 ? 'queue' : 'dispatch'}</button></div>
          </form>
        </section>
      </div>}
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  )
}

export default function App() {
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [ready, setReady] = useState(() => !getToken())

  useEffect(() => {
    if (!getToken()) return
    api<{ role: string; user: Admin }>('/auth/me')
      .then((r) => { if (r.role === 'admin') setAdmin(r.user); else setToken(null) })
      .catch(() => setToken(null))
      .finally(() => setReady(true))
  }, [])

  const logout = useCallback(() => { setToken(null); setAdmin(null) }, [])
  if (!ready) return <div className="empty">Loading…</div>
  return admin ? <Dashboard admin={admin} onLogout={logout} /> : <AuthScreen onAuthed={setAdmin} />
}
