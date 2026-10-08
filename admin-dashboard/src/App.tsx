import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  AlertCircle, ArrowDownToLine, ArrowRight, CarFront, Check, ChevronRight, Clock3, LayoutDashboard, ListOrdered, LogOut,
  Menu, Plus, Search, ShieldCheck, Trash2, IdCard, Phone, UserRound, UsersRound, X, Eye, EyeOff, Lock, Mail, KeyRound,
} from 'lucide-react'
import FleetMap from './FleetMap'
import { api, ApiError, getToken, setToken } from './api'

type Coords = { lat: number; lon: number }
type Ride = {
  id: string; status: string; riderName: string; phone: string; passengers: number; extraPassengers: number
  pickup: string; destination: string; pickupCoords: Coords | null; destinationCoords: Coords | null
  driverId: string; driverName: string; vehicle: string; plate: string; tripMin: number; createdAt: string
  phase: 'waiting' | 'to-pickup' | 'on-trip'; progress: number; etaMin: number | null
  waitMin: number; startAt: string | null; blockedBy: 'car' | 'driver' | 'both' | 'slot' | null
  riderEmail: string; otp: string | null; pickupTime: string | null; driverRegistered: boolean
  startedAt: string | null
  allocation: { allocatedAt: string; slotStart: string; slotEnd: string } | null
  attention: { code: string; text: string } | null
  live: { lat: number; lon: number; speedKmh: number; state: 'moving' | 'stopped' | 'offline'; stoppedForSec: number; ageSec: number } | null
}
type Car = { name: string; plate: string; seats: number; depot: Coords; status: 'busy' | 'idle'; freeInMin: number; trip: Ride | null; queued: number }
type DriverRow = {
  id: string; name: string; phone: string; registered: boolean; joinedAt: string | null; notes: string
  status: 'on-trip' | 'to-pickup' | 'available' | 'not-registered'
  password: string | null
  otps: { rideId: string; rider: string; status: string; otp: string }[]
  current: { rideId: string; otp: string; car: string; plate: string; rider: string; passengers: number; pickup: string; destination: string } | null
  live: { state: 'moving' | 'stopped' | 'offline'; speedKmh: number; stoppedForSec: number; ageSec: number } | null
  queued: number; total: number; completed: number; completedToday: number; declined: number; cancelled: number
  avgTripMin: number | null; lastActive: string | null
  recent: { id: string; rider: string; pickup: string; destination: string; vehicle: string; status: string; otp: string | null; at: string }[]
}
type Overview = { now: string; cars: Car[]; trips: Ride[]; queue: Ride[]; activity: Ride[]; drivers: DriverRow[] }
type Driver = { id: string; name: string }
type Admin = { id: string; name: string; email: string }
type View = 'overview' | 'trips' | 'queue' | 'drivers'

const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?'
const shortPlace = (place: string) => place.split(',').slice(0, 2).join(',').trim()
const riderCount = (ride: Ride) => `${ride.passengers} ${ride.passengers === 1 ? 'rider' : 'riders'}`
const clockTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '')
const span = (sec: number) => (sec < 60 ? `${Math.max(sec, 1)} s` : `${Math.round(sec / 60)} min`)
const liveChip = (ride: Ride) => {
  const l = ride.live
  if (!l) return { tone: 'none', text: 'Waiting for GPS' }
  if (l.state === 'moving') return { tone: 'moving', text: `Moving · ${l.speedKmh} km/h` }
  if (l.state === 'stopped') return { tone: 'stopped', text: `Stopped · ${span(l.stoppedForSec)}` }
  return { tone: 'offline', text: `No signal · ${span(l.ageSec)} ago` }
}
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
const roundUp5 = (ms: number) => Math.ceil(ms / 300_000) * 300_000
const ACTIVITY_STATUS: Record<string, { label: string; tone: string }> = {
  requested: { label: 'Waiting', tone: 'warn' },
  accepted: { label: 'Heading to pickup', tone: '' },
  started: { label: 'On trip', tone: 'green' },
  completed: { label: 'Completed', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
  declined: { label: 'Declined', tone: 'red' },
}
const activityGroup = (r: Ride) => (r.attention ? 'attention' : r.status === 'requested' ? 'waiting' : r.status === 'accepted' || r.status === 'started' ? 'live' : 'done')
const ago = (iso: string | null) => {
  if (!iso) return 'Never'
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'Just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}
const DRIVER_STATUS: Record<DriverRow['status'], { label: string; tone: string }> = {
  'on-trip': { label: 'On trip', tone: 'green' },
  'to-pickup': { label: 'Heading to pickup', tone: '' },
  available: { label: 'Available', tone: 'grey' },
  'not-registered': { label: 'Not signed up', tone: 'warn' },
}
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
  const [data, setData] = useState<Overview>({ now: new Date().toISOString(), cars: [], trips: [], queue: [], activity: [], drivers: [] })
  const [online, setOnline] = useState(true)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [queueFilter, setQueueFilter] = useState('all')
  const [mapFilter, setMapFilter] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [view, setView] = useState<View>('overview')
  const [showForm, setShowForm] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [activityFilter, setActivityFilter] = useState<'all' | 'attention' | 'waiting' | 'live' | 'done'>('all')
  const [activityQuery, setActivityQuery] = useState('')
  const [showAllActivity, setShowAllActivity] = useState(false)
  const [allocating, setAllocating] = useState<Ride | null>(null)
  const [alloc, setAlloc] = useState({ car: '', driverId: '', slot: '' })
  const [allocError, setAllocError] = useState('')
  const [newIds, setNewIds] = useState<string[]>([])
  const seenIds = useRef<Set<string> | null>(null)
  const activityRows = data.activity
  const activityCounts = {
    all: activityRows.length,
    attention: activityRows.filter((r) => activityGroup(r) === 'attention').length,
    waiting: activityRows.filter((r) => r.status === 'requested').length,
    live: activityRows.filter((r) => activityGroup(r) === 'live').length,
    done: activityRows.filter((r) => activityGroup(r) === 'done').length,
  }
  const rankOf = (r: Ride) => ({ attention: 0, waiting: 1, live: 2, done: 3 })[activityGroup(r)]
  const filteredActivity = activityRows
    .filter((r) => {
      if (activityFilter === 'attention' && activityGroup(r) !== 'attention') return false
      if (activityFilter === 'waiting' && r.status !== 'requested') return false
      if (activityFilter === 'live' && activityGroup(r) !== 'live') return false
      if (activityFilter === 'done' && activityGroup(r) !== 'done') return false
      const q = activityQuery.trim().toLowerCase()
      return !q || [r.riderName, r.phone, r.riderEmail, r.otp ?? '', r.id, r.driverName, r.vehicle].some((v) => v.toLowerCase().includes(q))
    })
    .sort((a, b) => rankOf(a) - rankOf(b) || +new Date(b.createdAt) - +new Date(a.createdAt))
  const shownActivity = showAllActivity ? filteredActivity : filteredActivity.slice(0, 10)
  const [driverQuery, setDriverQuery] = useState('')
  const [driverFilter, setDriverFilter] = useState<'all' | 'busy' | 'available' | 'not-registered'>('all')
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null)
  const [showDriverForm, setShowDriverForm] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwError, setPwError] = useState('')
  const [notesDraft, setNotesDraft] = useState('')
  const { cars, trips, queue, drivers: driverRows } = data
  const selectedDriver = driverRows.find((d) => d.id === selectedDriverId) ?? null
  const isBusy = (d: DriverRow) => d.status === 'on-trip' || d.status === 'to-pickup'
  const driverCounts = { all: driverRows.length, busy: driverRows.filter(isBusy).length, available: driverRows.filter((d) => d.status === 'available').length, 'not-registered': driverRows.filter((d) => d.status === 'not-registered').length }
  const visibleDrivers = driverRows.filter((d) => {
    if (driverFilter === 'busy' && !isBusy(d)) return false
    if (driverFilter === 'available' && d.status !== 'available') return false
    if (driverFilter === 'not-registered' && d.status !== 'not-registered') return false
    const q = driverQuery.trim().toLowerCase()
    return !q || d.name.toLowerCase().includes(q) || d.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '\u0000') || d.id.includes(q)
  })
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
      const next = await api<Overview>('/admin/overview')
      // A request that was not on the board last time is new: flag it and tell the admin straight away.
      if (seenIds.current === null) seenIds.current = new Set(next.activity.map((r) => r.id))
      else {
        const seen = seenIds.current
        const fresh = next.activity.filter((r) => r.status === 'requested' && !seen.has(r.id))
        next.activity.forEach((r) => seen.add(r.id))
        if (fresh.length) {
          setNewIds((ids) => [...ids, ...fresh.map((r) => r.id)])
          notify(`New ride request: ${fresh[0].riderName}${fresh.length > 1 ? ` and ${fresh.length - 1} more` : ''}`)
          window.setTimeout(() => setNewIds((ids) => ids.filter((id) => !fresh.some((f) => f.id === id))), 8000)
        }
      }
      setData(next)
      setOnline(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onLogout()
      else setOnline(false)
    }
  }, [onLogout, notify])

  // Every panel reads the same snapshot, so trips, queue, map and metrics always agree.
  useEffect(() => {
    void refresh()
    const poll = window.setInterval(refresh, 2000)
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

  function addDriver(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const entry = new FormData(event.currentTarget)
    const name = String(entry.get('name')).trim()
    void run(async () => {
      await post('/admin/drivers', { name, phone: String(entry.get('phone')).trim(), password: String(entry.get('password')) })
      setShowDriverForm(false)
    }, `${name} added. Share their phone number and password so they can sign in.`)
  }

  function deleteDriver(driver: DriverRow) {
    const extra = driver.queued ? ` ${driver.queued} waiting request(s) for them will be declined.` : ''
    if (!window.confirm(`Delete ${driver.name}? Their login is removed and they disappear from the rider app. Past rides stay in history.${extra}`)) return
    void run(async () => {
      await api(`/admin/drivers/${driver.id}`, { method: 'DELETE' })
      setSelectedDriverId(null)
      await refresh()
    }, `${driver.name} deleted`)
  }

  function saveNotes(driver: DriverRow) {
    void run(async () => { await api(`/admin/drivers/${driver.id}`, { method: 'PATCH', body: { notes: notesDraft } }); await refresh() }, 'Notes saved')
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault()
    setPwError('')
    if (pw.next !== pw.confirm) { setPwError('The new passwords do not match.'); return }
    try {
      await api('/admin/password', { method: 'POST', body: { current: pw.current, next: pw.next } })
      setShowPassword(false)
      setPw({ current: '', next: '', confirm: '' })
      notify('Password changed. Use it the next time you sign in.')
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Could not change the password')
    }
  }

  function openDriver(driver: DriverRow) {
    setSelectedDriverId(driver.id)
    setNotesDraft(driver.notes)
  }

  function openAllocate(r: Ride) {
    const registered = driverRows.filter((d) => d.registered)
    const driverId = registered.some((d) => d.id === r.driverId) ? r.driverId : (registered.find((d) => d.status === 'available') ?? registered[0])?.id ?? ''
    const base = r.allocation ? new Date(r.allocation.slotStart).getTime() : Math.max(Date.now(), r.startAt ? new Date(r.startAt).getTime() : 0)
    setAlloc({ car: r.vehicle, driverId, slot: toLocalInput(new Date(roundUp5(base))) })
    setAllocError('')
    setAllocating(r)
  }

  async function submitAllocation(event: FormEvent) {
    event.preventDefault()
    if (!allocating) return
    try {
      await post(`/admin/rides/${allocating.id}/allocate`, { car: alloc.car, driverId: alloc.driverId, slotStart: new Date(alloc.slot).toISOString() })
      notify(`${alloc.car} allocated to ${allocating.riderName}`)
      setAllocating(null)
    } catch (err) {
      setAllocError(err instanceof Error ? err.message : 'Could not allocate')
    }
  }

  function go(next: View) {
    setView(next); setNavOpen(false)
    const target = next === 'queue' ? 'user-activity' : next === 'trips' ? 'active-trips' : next === 'drivers' ? 'driver-activity' : null
    if (target) window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const nav: { id: View; label: string; icon: typeof LayoutDashboard; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'trips', label: 'Live trips', icon: CarFront, count: trips.length },
    { id: 'queue', label: 'User activity', icon: ListOrdered, count: activityCounts.waiting },
    { id: 'drivers', label: 'Driver activity', icon: IdCard, count: driverRows.length },
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
          <div className="sync"><span className={`dot ${online ? 'on' : 'off'}`} /><span>{online ? 'Live · syncs every 2s' : 'Reconnecting to API…'}</span></div>
          <div className="profile"><span className="avatar">{initials(admin.name)}</span><span className="grow"><strong>{admin.name}</strong><small>{admin.email}</small></span><button type="button" className="icon-btn" onClick={() => { setPwError(''); setShowPassword(true) }} aria-label="Change password" title="Change password"><KeyRound size={17} /></button><button type="button" className="icon-btn" onClick={onLogout} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button></div>
        </div>
      </aside>
      {navOpen && <button className="backdrop" aria-label="Close menu" onClick={() => setNavOpen(false)} />}

      <main className="main">
        <header className="topbar">
          <button type="button" className="icon-btn menu-btn" onClick={() => setNavOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="crumbs"><span>Operations</span><ChevronRight size={14} /><strong>{view === 'overview' ? 'Overview' : view === 'trips' ? 'Live trips' : view === 'queue' ? 'User activity' : 'Driver activity'}</strong></div>
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
              <div className="map-legend"><span><i className="swatch moving" /> {trips.filter((t) => t.live?.state === 'moving').length} moving</span><span><i className="swatch stopped" /> {trips.filter((t) => t.live?.state === 'stopped').length} stopped</span><span><i className="swatch off" /> {trips.filter((t) => !t.live || t.live.state === 'offline').length} no signal</span><span><i className="swatch idle" /> {idleCars} idle</span></div>
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
                <span className="cell"><span className="grow"><strong>{t.etaMin} min</strong><small>{phaseLabel(t)}</small><span className={`live-chip ${liveChip(t).tone}`}>{liveChip(t).text}</span><i className="bar thin"><b style={{ width: `${Math.round(t.progress * 100)}%` }} /></i></span></span>
                <span className="cell end"><button type="button" className="btn btn-ghost compact" title="Mark trip complete; the car becomes idle" onClick={() => run(() => post(`/admin/rides/${t.id}/complete`), `${t.vehicle} is back and idle`)}><Check size={15} /> Complete</button></span>
              </div>)}
            </div> : <div className="empty"><CarFront size={22} />No active trips. All cars are ready.</div>}
          </section>

          <section className="card panel" id="user-activity">
            <div className="card-head">
              <div><h2>User activity <span className="chip warn">{activityRows.length}</span></h2><small className="muted">Every ride request: user, OTP, driver, car and time slot. New requests appear here within seconds.</small></div>
              <button type="button" className="btn btn-primary compact" onClick={() => setShowForm(true)}><Plus size={15} /> New request</button>
            </div>
            <div className="crm-stats">
              <div><small>Waiting for a car</small><strong>{activityCounts.waiting}</strong></div>
              <div><small>Need allocation</small><strong className={activityCounts.attention ? 'alert-number' : ''}>{activityCounts.attention}</strong></div>
              <div><small>In progress</small><strong>{activityCounts.live}</strong></div>
              <div><small>Finished</small><strong>{activityCounts.done}</strong></div>
            </div>
            <div className="crm-toolbar">
              <span className="input search-input"><Search size={16} /><input value={activityQuery} onChange={(e) => setActivityQuery(e.target.value)} placeholder="Search by user, phone, OTP or ride ID" aria-label="Search user activity" /></span>
              <div className="filter-chips flat" role="tablist" aria-label="Filter user activity">
                {([['all', 'All'], ['attention', 'Need allocation'], ['waiting', 'Waiting'], ['live', 'In progress'], ['done', 'Finished']] as const).map(([id, label]) => <button type="button" key={id} className={activityFilter === id ? 'on' : ''} onClick={() => { setActivityFilter(id); setShowAllActivity(false) }}>{label} <span>{activityCounts[id]}</span></button>)}
              </div>
            </div>
            {shownActivity.length ? <div className="table wide">
              <div className="trow thead arow"><span>Requested</span><span>User</span><span>OTP</span><span>Driver and car</span><span>Route</span><span>Time slot</span><span>Status</span><span /></div>
              {shownActivity.map((r) => <div className={`trow arow ${newIds.includes(r.id) ? 'is-new' : ''} ${r.attention ? 'needs-attention' : ''}`} key={r.id}>
                <span className="cell"><span className="grow"><strong>{clockTime(r.createdAt)}</strong><small title={r.id}>{ago(r.createdAt)}</small></span></span>
                <span className="cell"><span className="avatar sm">{initials(r.riderName)}</span><span className="grow"><strong>{r.riderName}{r.extraPassengers > 0 && <em className="extra">+{r.extraPassengers}</em>}</strong><small>{r.phone || r.riderEmail || 'No contact'} · {riderCount(r)}</small></span></span>
                <span className="cell">{r.otp ? <span className="otp-chip" title="Ride PIN the rider gives the driver">{r.otp}</span> : <span className="muted">—</span>}</span>
                <span className="cell"><span className="grow"><strong>{r.driverName}</strong><small>{r.vehicle} · {r.plate}</small></span></span>
                <span className="cell"><span className="grow"><strong>{shortPlace(r.pickup)}</strong><small>→ {shortPlace(r.destination)}</small></span></span>
                <span className="cell"><span className="grow">{r.allocation
                  ? <><strong>{clockTime(r.allocation.slotStart)} – {clockTime(r.allocation.slotEnd)}</strong><small className="ok-text">Allocated by admin</small></>
                  : r.status === 'requested'
                    ? <><strong>Est. {clockTime(r.startAt)}</strong><small>{r.pickupTime ? `Rider asked for ${new Date(r.pickupTime).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : 'As soon as possible'}</small></>
                    : r.startedAt ? <><strong>Started {clockTime(r.startedAt)}</strong><small>{r.tripMin} min trip</small></> : <span className="muted">—</span>}</span></span>
                <span className="cell"><span className="grow"><span className={`chip ${ACTIVITY_STATUS[r.status]?.tone ?? 'grey'}`}>{r.allocation && r.status === 'requested' ? 'Allocated' : ACTIVITY_STATUS[r.status]?.label ?? r.status}</span>{r.attention && <small className="attention-note">{r.attention.text}</small>}</span></span>
                <span className="cell end">{r.status === 'requested' && <>
                  <button type="button" className={`btn compact ${r.attention ? 'btn-primary' : 'btn-ghost'}`} onClick={() => openAllocate(r)}>{r.allocation ? 'Reallocate' : 'Allocate'}</button>
                  <button type="button" className="icon-btn danger" aria-label={`Cancel ${r.riderName}'s request`} title="Cancel request" onClick={() => { if (window.confirm(`Cancel ${r.riderName}'s request?`)) void run(() => post(`/admin/rides/${r.id}/cancel`), `${r.riderName}'s request cancelled`) }}><X size={16} /></button>
                </>}</span>
              </div>)}
              {filteredActivity.length > 10 && <button type="button" className="show-more" onClick={() => setShowAllActivity((v) => !v)}>{showAllActivity ? 'Show fewer' : `Show all ${filteredActivity.length}`}</button>}
            </div> : <div className="empty"><Check size={22} />{activityRows.length ? 'No requests match your filters.' : 'No ride requests yet. They show up here the moment a rider books.'}</div>}
          </section>

          <section className="card panel" id="driver-activity">
            <div className="card-head">
              <div><h2>Driver activity <span className="chip">{driverRows.length}</span></h2><small className="muted">Everyone who drives for MCCIA Cabs: status, jobs and history</small></div>
              <button type="button" className="btn btn-primary compact" onClick={() => setShowDriverForm(true)}><Plus size={15} /> Add driver</button>
            </div>
            <div className="crm-stats">
              <div><small>Total drivers</small><strong>{driverCounts.all}</strong></div>
              <div><small>On a trip</small><strong>{driverCounts.busy}</strong></div>
              <div><small>Available</small><strong>{driverCounts.available}</strong></div>
              <div><small>Completed today</small><strong>{driverRows.reduce((sum, d) => sum + d.completedToday, 0)}</strong></div>
            </div>
            <div className="crm-toolbar">
              <span className="input search-input"><Search size={16} /><input value={driverQuery} onChange={(e) => setDriverQuery(e.target.value)} placeholder="Search by name or phone" aria-label="Search drivers" /></span>
              <div className="filter-chips flat" role="tablist" aria-label="Filter drivers">
                {([['all', 'All'], ['busy', 'On a trip'], ['available', 'Available'], ['not-registered', 'Not signed up']] as const).map(([id, label]) => <button type="button" key={id} className={driverFilter === id ? 'on' : ''} onClick={() => setDriverFilter(id)}>{label} <span>{driverCounts[id]}</span></button>)}
              </div>
            </div>
            {visibleDrivers.length ? <div className="table">
              <div className="trow thead drow"><span>Driver</span><span>Contact</span><span>Password</span><span>Status</span><span>Current job</span><span>OTP</span><span>Rides</span><span>Last active</span><span /></div>
              {visibleDrivers.map((d) => <div className="trow drow clickable" key={d.id} onClick={() => openDriver(d)}>
                <span className="cell"><span className="avatar sm">{initials(d.name)}</span><span className="grow"><strong>{d.name}</strong><small>{d.joinedAt ? `Joined ${new Date(d.joinedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'Starter entry'}</small></span></span>
                <span className="cell">{d.phone ? <a className="phone-link" href={`tel:${d.phone}`} onClick={(e) => e.stopPropagation()}><Phone size={13} /> {d.phone}</a> : <span className="muted">No phone</span>}</span>
                <span className="cell">{d.password ? <span className="pw-chip" title="Password set when the driver was added">{d.password}</span> : <span className="muted" title="Only shown for drivers added by an admin">—</span>}</span>
                <span className="cell"><span className={`chip ${DRIVER_STATUS[d.status].tone}`}>{DRIVER_STATUS[d.status].label}</span>{d.live && d.status === 'on-trip' && <span className={`live-chip ${d.live.state === 'moving' ? 'moving' : d.live.state === 'stopped' ? 'stopped' : 'offline'}`}>{d.live.state === 'moving' ? `${d.live.speedKmh} km/h` : d.live.state === 'stopped' ? 'Stopped' : 'No signal'}</span>}</span>
                <span className="cell"><span className="grow">{d.current ? <><strong>{d.current.car} · {d.current.rider}{d.current.passengers > 1 ? ` +${d.current.passengers - 1}` : ''}</strong><small>{shortPlace(d.current.pickup)} → {shortPlace(d.current.destination)}</small></> : <span className="muted">{d.queued ? `${d.queued} waiting request${d.queued > 1 ? 's' : ''}` : 'No job right now'}</span>}</span></span>
                <span className="cell">{d.otps.length ? <span className="otp-stack">{d.otps.map((o) => <span className="otp-chip" key={o.rideId} title={o.rider + (o.status === 'requested' ? ' (waiting)' : '')}>{o.otp}</span>)}</span> : <span className="muted">—</span>}</span>
                <span className="cell"><span className="grow"><strong>{d.completed} <small className="inline">completed</small></strong><small>{d.total} total{d.declined ? ` · ${d.declined} declined` : ''}</small></span></span>
                <span className="cell"><span className="muted">{ago(d.lastActive)}</span></span>
                <span className="cell end"><button type="button" className="icon-btn danger" aria-label={`Delete ${d.name}`} title="Delete driver" onClick={(e) => { e.stopPropagation(); deleteDriver(d) }}><Trash2 size={16} /></button></span>
              </div>)}
            </div> : <div className="empty"><IdCard size={22} />{driverRows.length ? 'No drivers match your search.' : 'No drivers yet. Add your first driver.'}</div>}
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
      {allocating && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setAllocating(null) }}>
        <section className="modal card" role="dialog" aria-modal="true" aria-labelledby="alloc-title">
          <div className="card-head"><div><span className="eyebrow">{allocating.id}</span><h2 id="alloc-title">{allocating.allocation ? 'Reallocate' : 'Allocate'} car and time slot</h2></div><button type="button" className="icon-btn" aria-label="Close" onClick={() => setAllocating(null)}><X size={18} /></button></div>
          <div className="alloc-summary">
            <span className="avatar sm">{initials(allocating.riderName)}</span>
            <span className="grow"><strong>{allocating.riderName} · {riderCount(allocating)}</strong><small>{shortPlace(allocating.pickup)} → {shortPlace(allocating.destination)} · {allocating.tripMin} min trip</small></span>
            <span className="muted">Asked for {allocating.vehicle} with {allocating.driverName}</span>
          </div>
          {allocating.attention && <div className="alert warn"><Clock3 size={16} /> {allocating.attention.text}. Choose another car, driver or time.</div>}
          <form className="stack" onSubmit={submitAllocation}>
            <div className="form-grid two">
              <label className="field"><span>Car</span><span className="input"><select value={alloc.car} onChange={(e) => setAlloc((a) => ({ ...a, car: e.target.value }))} required>{cars.map((c) => <option key={c.name} value={c.name}>{c.name} · {c.status === 'busy' ? `on a trip, back in ${c.freeInMin} min` : 'idle'}</option>)}</select></span></label>
              <label className="field"><span>Driver</span><span className="input"><select value={alloc.driverId} onChange={(e) => setAlloc((a) => ({ ...a, driverId: e.target.value }))} required>{driverRows.filter((d) => d.registered).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></span></label>
            </div>
            <div className="field"><span>Time slot starts</span>
              <div className="slot-quick">{[['Now', 0], ['In 15 min', 15], ['In 30 min', 30], ['In 1 hour', 60]].map(([label, mins]) => <button type="button" key={label} className="chip-btn" onClick={() => setAlloc((a) => ({ ...a, slot: toLocalInput(new Date(Date.now() + Number(mins) * 60_000)) }))}>{label}</button>)}</div>
              <span className="input"><input type="datetime-local" value={alloc.slot} onChange={(e) => setAlloc((a) => ({ ...a, slot: e.target.value }))} required /></span>
              {alloc.slot && <small className="muted">Slot runs about {clockTime(new Date(alloc.slot).toISOString())} to {clockTime(new Date(new Date(alloc.slot).getTime() + (10 + allocating.tripMin) * 60_000).toISOString())} (10 min pickup + {allocating.tripMin} min trip).</small>}
            </div>
            {allocError && <div className="alert error" role="alert">{allocError}</div>}
            <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setAllocating(null)}>Cancel</button><button type="submit" className="btn btn-primary"><Check size={16} /> Confirm allocation</button></div>
          </form>
        </section>
      </div>}

      {showPassword && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowPassword(false) }}>
        <section className="modal card" role="dialog" aria-modal="true" aria-labelledby="pw-title">
          <div className="card-head"><div><span className="eyebrow">{admin.email}</span><h2 id="pw-title">Change password</h2></div><button type="button" className="icon-btn" aria-label="Close" onClick={() => setShowPassword(false)}><X size={18} /></button></div>
          <form className="stack" onSubmit={changePassword}>
            <label className="field"><span>Current password</span><span className="input"><Lock size={16} /><input type="password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} autoComplete="current-password" required /></span></label>
            <label className="field"><span>New password (min. 6 characters)</span><span className="input"><Lock size={16} /><input type="password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} autoComplete="new-password" minLength={6} required /></span></label>
            <label className="field"><span>Confirm new password</span><span className="input"><Lock size={16} /><input type="password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} autoComplete="new-password" minLength={6} required /></span></label>
            {pwError && <div className="alert error" role="alert">{pwError}</div>}
            <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setShowPassword(false)}>Cancel</button><button type="submit" className="btn btn-primary"><Check size={16} /> Change password</button></div>
          </form>
        </section>
      </div>}

      {showDriverForm && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowDriverForm(false) }}>
        <section className="modal card" role="dialog" aria-modal="true" aria-labelledby="driver-form-title">
          <div className="card-head"><div><span className="eyebrow">New driver</span><h2 id="driver-form-title">Add a driver</h2></div><button type="button" className="icon-btn" aria-label="Close" onClick={() => setShowDriverForm(false)}><X size={18} /></button></div>
          <p className="muted">The driver signs in to the driver app with this phone number and password, and riders can then pick them.</p>
          <form className="stack" onSubmit={addDriver}>
            <label className="field"><span>Full name</span><span className="input"><UserRound size={16} /><input name="name" placeholder="e.g. Suresh Patil" required minLength={2} /></span></label>
            <label className="field"><span>Phone number</span><span className="input"><Phone size={16} /><input name="phone" type="tel" placeholder="+91 98765 43210" required /></span></label>
            <label className="field"><span>Password (min. 4 characters)</span><span className="input"><Lock size={16} /><input name="password" type="text" autoComplete="off" placeholder="Choose a password to share with the driver" required minLength={4} /></span></label>
            <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setShowDriverForm(false)}>Cancel</button><button type="submit" className="btn btn-primary"><Plus size={16} /> Add driver</button></div>
          </form>
        </section>
      </div>}

      {selectedDriver && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedDriverId(null) }}>
        <section className="modal card wide" role="dialog" aria-modal="true" aria-labelledby="driver-detail-title">
          <div className="card-head">
            <div className="row"><span className="avatar">{initials(selectedDriver.name)}</span><div><h2 id="driver-detail-title">{selectedDriver.name}</h2><small className="muted">{selectedDriver.phone || 'Has not signed up yet'}{selectedDriver.joinedAt ? ` · joined ${new Date(selectedDriver.joinedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</small></div></div>
            <div className="row"><span className={`chip ${DRIVER_STATUS[selectedDriver.status].tone}`}>{DRIVER_STATUS[selectedDriver.status].label}</span><button type="button" className="icon-btn" aria-label="Close" onClick={() => setSelectedDriverId(null)}><X size={18} /></button></div>
          </div>
          {selectedDriver.current && <div className="alert info"><CarFront size={16} /><span><b>{selectedDriver.current.car}</b> ({selectedDriver.current.plate}) with <b>{selectedDriver.current.rider}</b>{selectedDriver.current.passengers > 1 ? ` +${selectedDriver.current.passengers - 1}` : ''}: {shortPlace(selectedDriver.current.pickup)} → {shortPlace(selectedDriver.current.destination)}{selectedDriver.live ? ` · ${selectedDriver.live.state === 'moving' ? `moving ${selectedDriver.live.speedKmh} km/h` : selectedDriver.live.state === 'stopped' ? 'stopped' : 'no GPS signal'}` : ''}</span></div>}
          <div className="crm-stats tight">
            <div><small>Completed</small><strong>{selectedDriver.completed}</strong></div>
            <div><small>Today</small><strong>{selectedDriver.completedToday}</strong></div>
            <div><small>Declined</small><strong>{selectedDriver.declined}</strong></div>
            <div><small>Cancelled</small><strong>{selectedDriver.cancelled}</strong></div>
            <div><small>Avg trip</small><strong>{selectedDriver.avgTripMin ? `${selectedDriver.avgTripMin} min` : '—'}</strong></div>
            <div><small>Last active</small><strong className="small">{ago(selectedDriver.lastActive)}</strong></div>
          </div>
          <div className="stack tight-gap">
            <h3>Recent rides</h3>
            {selectedDriver.recent.length ? <div className="ride-list">{selectedDriver.recent.map((r) => <div className="ride-item" key={r.id}><span className="grow"><strong>{r.rider} · {r.vehicle}</strong><small>{shortPlace(r.pickup)} → {shortPlace(r.destination)}</small></span>{r.otp && <span className="otp-chip" title="Ride OTP">{r.otp}</span>}<span className="right"><span className={`chip ${r.status === 'completed' ? 'green' : r.status === 'started' || r.status === 'accepted' ? '' : r.status === 'requested' ? 'warn' : 'grey'}`}>{r.status}</span><small>{ago(r.at)}</small></span></div>)}</div> : <p className="muted">No rides yet.</p>}
          </div>
          {selectedDriver.registered && <div className="stack tight-gap">
            <h3>Notes</h3>
            <span className="input textarea"><textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={3} maxLength={1000} placeholder="Shift preferences, licence expiry, anything the team should know" /></span>
            <div className="modal-actions"><button type="button" className="btn btn-ghost compact" disabled={notesDraft === selectedDriver.notes} onClick={() => saveNotes(selectedDriver)}>Save notes</button></div>
          </div>}
          <div className="danger-zone"><span><strong>Delete this driver</strong><small>Removes their login and rider-app listing. Past rides stay in history.</small></span><button type="button" className="btn btn-danger compact" onClick={() => deleteDriver(selectedDriver)}><Trash2 size={15} /> Delete driver</button></div>
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
