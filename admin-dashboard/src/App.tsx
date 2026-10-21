import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  AlertCircle, ArrowDownToLine, ArrowRight, CarFront, Check, ChevronRight, Clock3, LayoutDashboard, ListOrdered, LogOut,
  Menu, Plus, Wrench, ReceiptText, PauseCircle, Search, ShieldCheck, Trash2, IdCard, Phone, UserRound, X, Eye, EyeOff, Lock, Mail, KeyRound,
} from 'lucide-react'
import FleetMap from './FleetMap'
import { ApproveModal, CancelModal, HoldModal, WalkInModal } from './RequestModals'
import { routeText, whenLabel, type QueueRide } from './requestUtils'
import MaintenancePage from './MaintenancePage'
import InvoicesPage from './InvoicesPage'
import { api, ApiError, getToken, setToken } from './api'

type Coords = { lat: number; lon: number }
type Ride = {
  id: string; status: string; riderName: string; phone: string; passengers: number; extraPassengers: number
  pickup: string; destination: string; pickupCoords: Coords | null; destinationCoords: Coords | null
  stops: { label: string; coords: Coords | null }[]
  tripType: 'now' | 'scheduled' | 'multiday'; startAt: string | null; endAt: string | null
  holdNote: string; returnedNote: string; approvedAt: string | null
  driverId: string; driverName: string; vehicle: string; plate: string; tripMin: number; createdAt: string
  phase: 'waiting' | 'assigned' | 'to-pickup' | 'on-trip' | 'reached'; reachedAt: string | null; progress: number; etaMin: number | null
  riderEmail: string; otp: string | null; driverRegistered: boolean
  startedAt: string | null
  live: { lat: number; lon: number; speedKmh: number; state: 'moving' | 'stopped' | 'offline'; stoppedForSec: number; ageSec: number } | null
}
type Car = { name: string; plate: string; seats: number; model: string; color: string; fuel: string; year: number | null; notes: string; gpsId: string; defaultDriverId: string; gps: { lat: number; lon: number; speedKmh: number; ignition: boolean | null; fuelPct: number | null; odometerKm: number | null; ts: string; ageSec: number; state: 'moving' | 'stopped' | 'offline' } | null; pickupEtaMin: number; depot: Coords; status: 'busy' | 'idle'; freeInMin: number; trip: Ride | null; queued: number }
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
type Overview = { now: string; cars: Car[]; trips: Ride[]; queue: Ride[]; upcoming: Ride[]; activity: Ride[]; drivers: DriverRow[] }
type Admin = { id: string; name: string; email: string }
const viewFromHash = (): View => (window.location.hash === '#/maintenance' ? 'maintenance' : window.location.hash === '#/invoices' ? 'invoices' : 'overview')
type View = 'overview' | 'trips' | 'queue' | 'drivers' | 'cars' | 'maintenance' | 'invoices'

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
const ACTIVITY_STATUS: Record<string, { label: string; tone: string }> = {
  requested: { label: 'Awaiting approval', tone: 'warn' },
  held: { label: 'On hold', tone: 'grey' },
  approved: { label: 'Approved', tone: '' },
  accepted: { label: 'Heading to pickup', tone: '' },
  started: { label: 'On trip', tone: 'green' },
  completed: { label: 'Completed', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
  declined: { label: 'Declined', tone: 'red' },
}
const activityGroup = (r: Ride) => (r.status === 'requested' || r.status === 'held' ? 'waiting' : r.status === 'approved' ? 'upcoming' : r.status === 'accepted' || r.status === 'started' ? 'live' : 'done')
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
const phaseLabel = (ride: Ride) => (ride.phase === 'to-pickup' ? 'Heading to pickup' : ride.phase === 'reached' ? 'Reached destination' : 'Trip in progress')
const short = (r: Ride) => r.stops.length ? `+${r.stops.length} stop${r.stops.length > 1 ? 's' : ''}` : ''

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
  const [data, setData] = useState<Overview>({ now: new Date().toISOString(), cars: [], trips: [], queue: [], upcoming: [], activity: [], drivers: [] })
  const [online, setOnline] = useState(true)
  const [queueFilter, setQueueFilter] = useState('all')
  const [mapFilter, setMapFilter] = useState('all')
  const [selectedCar, setSelectedCar] = useState('') // car clicked on the map: its live details show under the map
  const [view, setView] = useState<View>(viewFromHash)
  const [showForm, setShowForm] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [activityFilter, setActivityFilter] = useState<'all' | 'waiting' | 'upcoming' | 'live' | 'done'>('all')
  const [activityQuery, setActivityQuery] = useState('')
  const [showAllActivity, setShowAllActivity] = useState(false)
  const [openActivity, setOpenActivity] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ kind: 'approve' | 'hold' | 'cancel'; ride: Ride } | null>(null)
  const [newIds, setNewIds] = useState<string[]>([])
  const seenIds = useRef<Set<string> | null>(null)
  const activityRows = data.activity
  const activityCounts = {
    all: activityRows.length,
    waiting: activityRows.filter((r) => activityGroup(r) === 'waiting').length,
    upcoming: activityRows.filter((r) => activityGroup(r) === 'upcoming').length,
    live: activityRows.filter((r) => activityGroup(r) === 'live').length,
    done: activityRows.filter((r) => activityGroup(r) === 'done').length,
  }
  const rankOf = (r: Ride) => ({ waiting: 0, upcoming: 1, live: 2, done: 3 })[activityGroup(r)]
  const filteredActivity = activityRows
    .filter((r) => {
      if (activityFilter === 'waiting' && activityGroup(r) !== 'waiting') return false
      if (activityFilter === 'upcoming' && activityGroup(r) !== 'upcoming') return false
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
  const [carForm, setCarForm] = useState<'new' | Car | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwError, setPwError] = useState('')
  const [notesDraft, setNotesDraft] = useState('')
  const [newDriverPw, setNewDriverPw] = useState('')
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
  const visibleQueue = queueFilter === 'held' ? queue.filter((r) => r.status === 'held') : queueFilter === 'new' ? queue.filter((r) => r.status === 'requested') : queue
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

  function addDriver(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const entry = new FormData(event.currentTarget)
    const name = String(entry.get('name')).trim()
    void run(async () => {
      await post('/admin/drivers', { name, phone: String(entry.get('phone')).trim(), password: String(entry.get('password')) })
      setShowDriverForm(false)
    }, `${name} added. Share their phone number and password so they can sign in.`)
  }

  function addCar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const entry = new FormData(event.currentTarget)
    const text = (k: string) => String(entry.get(k) ?? '').trim()
    const name = text('name')
    const editing = carForm !== null && carForm !== 'new' ? carForm : null
    const body = { name, plate: text('plate'), seats: Number(text('seats')), model: text('model'), color: text('color'), fuel: text('fuel'), year: text('year'), pickupEtaMin: text('eta'), notes: text('notes'), gpsId: text('gpsId'), defaultDriverId: text('defaultDriverId') }
    void run(async () => {
      if (editing) await api(`/admin/cars/${encodeURIComponent(editing.name)}`, { method: 'PATCH', body })
      else await api('/admin/cars', { method: 'POST', body })
      await refresh()
      setCarForm(null)
    }, editing ? `${name} updated.` : `${name} added to the fleet. Riders can book it now.`)
  }

  function deleteCar(car: Car) {
    if (!window.confirm(`Remove ${car.name} (${car.plate}) from the fleet? Past rides stay in history.`)) return
    void run(async () => { await api(`/admin/cars/${encodeURIComponent(car.name)}`, { method: 'DELETE' }); await refresh() }, `${car.name} removed`)
  }

  function deleteDriver(driver: DriverRow) {
    const extra = driver.queued ? ` ${driver.queued} approved ride(s) for them will go back to the queue.` : ''
    if (!window.confirm(`Delete ${driver.name}? Their login is removed and they disappear from the rider app. Past rides stay in history.${extra}`)) return
    void run(async () => {
      await api(`/admin/drivers/${driver.id}`, { method: 'DELETE' })
      setSelectedDriverId(null)
      await refresh()
    }, `${driver.name} deleted`)
  }

  function resetDriverPassword(driver: DriverRow) {
    const password = newDriverPw.trim()
    void run(async () => {
      await api(`/admin/drivers/${driver.id}/password`, { method: 'POST', body: { password } })
      setNewDriverPw('')
      await refresh()
    }, `Password for ${driver.name} changed. Share it with them so they can sign in.`)
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
    setNewDriverPw('')
  }

  const afterDialog = (message: string) => { setDialog(null); setShowForm(false); notify(message); void refresh() }

  // Maintenance and Payments & invoices are separate pages with their own address, so the browser back button works.
  useEffect(() => {
    const sync = () => setView(viewFromHash())
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  function go(next: View) {
    setView(next); setNavOpen(false)
    const hash = next === 'maintenance' ? '#/maintenance' : next === 'invoices' ? '#/invoices' : ''
    if (window.location.hash !== hash) window.history.pushState(null, '', hash || window.location.pathname)
    if (next === 'maintenance' || next === 'invoices') { window.scrollTo({ top: 0 }); return }
    const target = next === 'queue' ? 'user-activity' : next === 'trips' ? 'active-trips' : next === 'drivers' ? 'driver-activity' : next === 'cars' ? 'fleet-cars' : null
    if (target) window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const nav: { id: View; label: string; icon: typeof LayoutDashboard; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'trips', label: 'Live trips', icon: CarFront, count: trips.length },
    { id: 'queue', label: 'User activity', icon: ListOrdered, count: activityCounts.waiting },
    { id: 'drivers', label: 'Driver activity', icon: IdCard, count: driverRows.length },
    { id: 'cars', label: 'Cars', icon: CarFront, count: cars.length },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench },
    { id: 'invoices', label: 'Payments & invoices', icon: ReceiptText },
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
          <div className="crumbs"><span>Operations</span><ChevronRight size={14} /><strong>{view === 'overview' ? 'Overview' : view === 'trips' ? 'Live trips' : view === 'queue' ? 'User activity' : view === 'maintenance' ? 'Maintenance' : view === 'invoices' ? 'Payments & invoices' : 'Driver activity'}</strong></div>
          <span className={`chip ${online ? 'green' : 'red'}`}><span className="dot on" /> {online ? 'LIVE' : 'OFFLINE'}</span>
        </header>

        {view === 'maintenance' ? <MaintenancePage cars={cars} notify={notify} /> : view === 'invoices' ? <InvoicesPage notify={notify} /> : <div className="page">
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
              <div className="map-canvas"><FleetMap cars={cars} filter={mapFilter} selected={selectedCar} onSelect={setSelectedCar} /></div>
              {(() => {
                const sc = cars.find((c) => c.name === selectedCar)
                if (!sc) return <small className="muted car-hint">Click a car on the map to see its live location.</small>
                const g = sc.gps, t = sc.trip
                const state = g ? (g.state === 'moving' ? `Moving · ${g.speedKmh} km/h` : g.state === 'stopped' ? 'Stopped' : 'Offline') : 'No GPS tracker signal'
                return <div className="car-detail">
                  <div className="car-detail-head"><strong>{sc.name}</strong><span className="muted">{sc.plate}</span>
                    {t?.phase === 'reached' && <span className="chip ok">Reached</span>}
                    <button type="button" className="icon-btn" aria-label="Close car details" onClick={() => setSelectedCar('')}><X size={16} /></button></div>
                  <div className="car-detail-grid">
                    <span><small>Trip</small>{t ? `${phaseLabel(t)} · ${t.riderName}` : 'No trip (available)'}</span>
                    <span><small>Destination</small>{t ? t.destination : '—'}</span>
                    <span><small>GPS</small>{state}</span>
                    <span><small>Position</small>{g ? `${g.lat.toFixed(5)}, ${g.lon.toFixed(5)}` : '—'}</span>
                    <span><small>Ignition / fuel</small>{g ? `${g.ignition === null ? '—' : g.ignition ? 'On' : 'Off'}${g.fuelPct !== null ? ` · ${Math.round(g.fuelPct)}%` : ''}` : '—'}</span>
                    <span><small>Last update</small>{g ? `${g.ageSec}s ago` : '—'}</span>
                  </div>
                </div>
              })()}
              <div className="map-legend"><span><i className="swatch moving" /> {trips.filter((t) => t.live?.state === 'moving').length} moving</span><span><i className="swatch stopped" /> {trips.filter((t) => t.live?.state === 'stopped').length} stopped</span><span><i className="swatch off" /> {trips.filter((t) => !t.live || t.live.state === 'offline').length} no signal</span><span><i className="swatch idle" /> {idleCars} idle</span></div>
            </div>

            <aside className="card panel queue-panel">
              <div className="card-head"><div><span className="eyebrow">Queue · {queue.length} awaiting</span><h2>{queue.length ? 'Requests to review' : 'The queue is clear'}</h2></div><span className={`status-mark ${queue.length ? '' : 'ready'}`}>{queue.length ? <Clock3 size={18} /> : <Check size={18} />}</span></div>
              <div className="filter-chips" role="tablist" aria-label="Filter the queue">{([['all', 'All', queue.length], ['new', 'New', queue.filter((r) => r.status === 'requested').length], ['held', 'On hold', queue.filter((r) => r.status === 'held').length]] as const).map(([id, label, n]) => <button type="button" key={id} className={queueFilter === id ? 'on' : ''} onClick={() => setQueueFilter(id)}>{label} <span>{n}</span></button>)}</div>
              <div className="rider-queue">
                {visibleQueue.length ? visibleQueue.map((r) => <article className="rq q-req" key={r.id}>
                  <div className="q-top">
                    <span className="rq-avatar">{initials(r.riderName)}</span>
                    <span className="grow">
                      <strong>{r.riderName}{r.status === 'held' && <em className="chip grey q-chip">On hold</em>}{r.returnedNote && <em className="chip warn q-chip">Re-assign</em>}</strong>
                      <small>{riderCount(r)} · {r.phone || r.riderEmail || 'no contact'}</small>
                    </span>
                    <small className="q-id">{r.id}</small>
                  </div>
                  <div className="q-route" title={routeText(r).join(' → ')}><span className="rt-dots" aria-hidden="true"><i className="from" /><i className="line" /><i className="to" /></span><span><b>{shortPlace(r.pickup)}</b><b>{shortPlace(r.destination)}</b></span>{short(r) && <em>{short(r)}</em>}</div>
                  <div className="q-when"><Clock3 size={13} /> {whenLabel(r)}{r.tripType === 'multiday' && <span className="chip">Multi-day</span>}</div>
                  {(r.returnedNote || r.holdNote) && <div className="q-note">{r.returnedNote || r.holdNote}</div>}
                  <div className="q-actions">
                    <button type="button" className="btn btn-primary compact" onClick={() => setDialog({ kind: 'approve', ride: r })}><Check size={14} /> Approve</button>
                    {r.status === 'requested' && <button type="button" className="btn btn-ghost compact" onClick={() => setDialog({ kind: 'hold', ride: r })}><PauseCircle size={14} /> Hold</button>}
                    <button type="button" className="btn btn-ghost compact danger-text" onClick={() => setDialog({ kind: 'cancel', ride: r })}><X size={14} /> Cancel</button>
                  </div>
                </article>) : <div className="empty"><Check size={20} />{queue.length ? 'Nothing in this filter' : 'No requests waiting for approval'}</div>}
              </div>
              <button type="button" className="link-btn add-link" onClick={() => setShowForm(true)}>Add a booking <ArrowRight size={15} /></button>
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
              <div><h2>User activity <span className="chip warn">{activityRows.length}</span></h2><small className="muted">Every ride request: who asked, route, when, and the car and driver you assigned. New requests appear here within seconds.</small></div>
              <button type="button" className="btn btn-primary compact" onClick={() => setShowForm(true)}><Plus size={15} /> New request</button>
            </div>
            <div className="crm-stats act-stats">
              {([['waiting', 'Awaiting approval', activityCounts.waiting, activityCounts.waiting ? 'alert-number' : ''], ['upcoming', 'Approved, not started', activityCounts.upcoming, ''], ['live', 'In progress', activityCounts.live, ''], ['done', 'Finished', activityCounts.done, '']] as const).map(([id, label, n, cls]) => <button type="button" key={id} className={`stat-tile ${activityFilter === id ? 'on' : ''}`} onClick={() => { setActivityFilter(activityFilter === id ? 'all' : id); setShowAllActivity(false) }}><small>{label}</small><strong className={cls}>{n}</strong></button>)}
            </div>
            <div className="crm-toolbar">
              <span className="input search-input"><Search size={16} /><input value={activityQuery} onChange={(e) => setActivityQuery(e.target.value)} placeholder="Search by user, phone, OTP or ride ID" aria-label="Search user activity" /></span>
              <div className="filter-chips flat" role="tablist" aria-label="Filter user activity">
                {([['all', 'All'], ['waiting', 'Awaiting approval'], ['upcoming', 'Approved'], ['live', 'In progress'], ['done', 'Finished']] as const).map(([id, label]) => <button type="button" key={id} className={activityFilter === id ? 'on' : ''} onClick={() => { setActivityFilter(id); setShowAllActivity(false) }}>{label} <span>{activityCounts[id]}</span></button>)}
              </div>
            </div>
            {shownActivity.length ? <div className="act-list">
              {shownActivity.map((r) => {
                const open = openActivity === r.id
                const group = activityGroup(r)
                const statusLabel = ACTIVITY_STATUS[r.status]?.label ?? r.status
                const slot = whenLabel(r)
                return <article className={`act-card g-${group} ${open ? 'open' : ''} ${newIds.includes(r.id) ? 'is-new' : ''}`} key={r.id}>
                  <button type="button" className="act-main" aria-expanded={open} onClick={() => setOpenActivity(open ? null : r.id)}>
                    <span className="avatar">{initials(r.riderName)}</span>
                    <span className="act-who"><strong>{r.riderName}{r.extraPassengers > 0 && <em className="extra">+{r.extraPassengers}</em>}</strong><small>{r.phone || r.riderEmail || 'No contact'} · {riderCount(r)}</small></span>
                    <span className="act-route">
                      <span className="rt-dots" aria-hidden="true"><i className="from" /><i className="line" /><i className="to" /></span>
                      <span className="rt-text"><strong>{shortPlace(r.pickup)}</strong><small>{shortPlace(r.destination)}</small></span>
                    </span>
                    <span className="act-meta"><CarFront size={14} /><span><strong>{r.driverName || 'Not assigned'}</strong><small>{r.vehicle || 'Awaiting approval'}</small></span></span>
                    <span className="act-time"><strong>{clockTime(r.createdAt)}</strong><small title={r.id}>{ago(r.createdAt)}</small></span>
                    <span className="act-status"><span className={`chip ${ACTIVITY_STATUS[r.status]?.tone ?? 'grey'}`}>{statusLabel}</span>{r.otp && <span className="otp-chip sm" title="Ride PIN">{r.otp}</span>}</span>
                    <ChevronRight size={18} className="act-chevron" />
                  </button>
                  {(r.returnedNote || (r.status === 'held' && r.holdNote)) && <div className="act-alert"><AlertCircle size={15} />{r.returnedNote || `On hold: ${r.holdNote}`}</div>}
                  {open && <div className="act-detail">
                    <div className="det-block wide"><small>Route</small>
                      <div className="det-route"><span className="rt-dots" aria-hidden="true"><i className="from" /><i className="line" /><i className="to" /></span><span>{routeText(r).map((p, i) => <strong key={i}>{p}</strong>)}</span></div>
                    </div>
                    <div className="det-block"><small>Driver and car</small><strong>{r.driverName || 'Not assigned yet'}</strong><span>{r.vehicle ? `${r.vehicle} · ${r.plate}` : 'Approve the request to assign them'}</span></div>
                    <div className="det-block"><small>{r.tripType === 'multiday' ? 'Dates' : 'When'}</small><strong>{slot}</strong><span>Requested {ago(r.createdAt)}</span></div>
                    <div className="det-block"><small>Rider</small><strong>{r.riderName} · {riderCount(r)}</strong>{r.phone ? <a className="phone-link" href={`tel:${r.phone}`}><Phone size={13} /> {r.phone}</a> : <span>{r.riderEmail || 'No contact'}</span>}</div>
                    <div className="det-block"><small>Ride PIN</small>{r.otp ? <span className="otp-chip">{r.otp}</span> : <span>Not active</span>}<span>{r.id}</span></div>
                    {['requested', 'held', 'approved'].includes(r.status) && <div className="det-actions">
                      <button type="button" className="btn btn-primary compact" onClick={() => setDialog({ kind: 'approve', ride: r })}><Check size={14} /> {r.status === 'approved' ? 'Change car or driver' : 'Approve'}</button>
                      {r.status === 'requested' && <button type="button" className="btn btn-ghost compact" onClick={() => setDialog({ kind: 'hold', ride: r })}><PauseCircle size={14} /> Hold</button>}
                      <button type="button" className="btn btn-ghost compact danger-text" onClick={() => setDialog({ kind: 'cancel', ride: r })}><X size={15} /> Cancel</button>
                    </div>}
                  </div>}
                </article>
              })}
              {filteredActivity.length > 10 && <button type="button" className="show-more" onClick={() => setShowAllActivity((v) => !v)}>{showAllActivity ? 'Show fewer' : `Show all ${filteredActivity.length}`}</button>}
            </div> : <div className="empty"><Check size={22} />{activityRows.length ? 'No requests match your filters.' : 'No ride requests yet. They show up here the moment a rider books.'}</div>}
          </section>

          <section className="card panel" id="fleet-cars">
            <div className="card-head">
              <div><h2>Cars <span className="chip">{cars.length}</span></h2><small className="muted">The fleet riders can book</small></div>
              <button type="button" className="btn btn-primary compact" onClick={() => setCarForm('new')}><Plus size={15} /> Add car</button>
            </div>
            <div className="table">
              <div className="trow carrow thead"><span>Car</span><span>Number</span><span>Seats</span><span>Details</span><span>Status</span><span>GPS</span><span /></div>
              {cars.map((c) => <div className="trow carrow clickable" key={c.name} title="Click to edit" onClick={() => setCarForm(c)}>
                <span className="cell"><span className="avatar sm"><CarFront size={14} /></span><span className="grow"><strong>{c.name}</strong><small>{[c.model, c.defaultDriverId && `Default: ${driverRows.find((d) => d.id === c.defaultDriverId)?.name ?? '—'}`].filter(Boolean).join(' · ') || '—'}</small></span></span>
                <span className="cell">{c.plate}</span>
                <span className="cell">{c.seats} seats</span>
                <span className="cell muted">{[c.color, c.fuel, c.year].filter(Boolean).join(' · ') || '—'}</span>
                <span className="cell"><span className={`chip ${c.status === 'idle' ? 'ok' : ''}`}>{c.status === 'idle' ? 'Available' : 'On a trip'}</span></span>
                <span className="cell">{c.gps
                  ? <span className="grow"><span className={`chip ${c.gps.state === 'offline' ? '' : 'ok'}`}>{c.gps.state === 'moving' ? `Moving ${c.gps.speedKmh} km/h` : c.gps.state === 'stopped' ? 'Stopped' : 'Offline'}</span>
                    <small>{c.gps.lat.toFixed(4)}, {c.gps.lon.toFixed(4)}{c.gps.fuelPct !== null ? ` · fuel ${Math.round(c.gps.fuelPct)}%` : ''}{c.gps.odometerKm !== null ? ` · ${Math.round(c.gps.odometerKm)} km` : ''} · {c.gps.ageSec < 90 ? `${c.gps.ageSec}s ago` : new Date(c.gps.ts).toLocaleString()}</small></span>
                  : <span className="muted">{c.gpsId ? 'Waiting for signal' : 'No tracker'}</span>}</span>
                <span className="cell"><button type="button" className="icon-btn" aria-label={`Remove ${c.name}`} onClick={(e) => { e.stopPropagation(); deleteCar(c) }}><Trash2 size={16} /></button></span>
              </div>)}
            </div>
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
        </div>}
      </main>

      {showForm && <WalkInModal cars={cars} drivers={driverRows.map((d) => ({ id: d.id, name: d.name, registered: d.registered, busy: isBusy(d) ? 'on a trip now' : null }))} onClose={() => setShowForm(false)} onDone={afterDialog} />}
      {dialog?.kind === 'approve' && <ApproveModal ride={dialog.ride as QueueRide} cars={cars} drivers={driverRows.map((d) => ({ id: d.id, name: d.name, registered: d.registered }))} onClose={() => setDialog(null)} onDone={afterDialog} />}
      {dialog?.kind === 'hold' && <HoldModal ride={dialog.ride as QueueRide} onClose={() => setDialog(null)} onDone={afterDialog} />}
      {dialog?.kind === 'cancel' && <CancelModal ride={dialog.ride as QueueRide} onClose={() => setDialog(null)} onDone={afterDialog} />}

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

      {carForm && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setCarForm(null) }}>
        <section className="modal card" role="dialog" aria-modal="true" aria-labelledby="car-form-title">
          <div className="card-head"><div><span className="eyebrow">{carForm === 'new' ? 'New car' : carForm.plate}</span><h2 id="car-form-title">{carForm === 'new' ? 'Add a car' : `Edit ${carForm.name}`}</h2></div><button type="button" className="icon-btn" aria-label="Close" onClick={() => setCarForm(null)}><X size={18} /></button></div>
          <p className="muted">The car shows up in the rider app and on the fleet map once added.</p>
          <form className="stack" onSubmit={addCar} key={carForm === 'new' ? 'new' : carForm.name}>
            <label className="field"><span>Car name</span><span className="input"><CarFront size={16} /><input name="name" placeholder="e.g. Swift Dzire" defaultValue={carForm === 'new' ? '' : carForm.name} required /></span></label>
            <label className="field"><span>Car number</span><span className="input"><input name="plate" placeholder="MH 12 EF 1003" defaultValue={carForm === 'new' ? '' : carForm.plate} required /></span></label>
            <label className="field"><span>Passenger seats</span><span className="input"><input name="seats" type="number" min={1} max={20} defaultValue={carForm === 'new' ? 4 : carForm.seats} required /></span></label>
            <label className="field"><span>Model (optional)</span><span className="input"><input name="model" placeholder="e.g. Toyota Innova Crysta" defaultValue={carForm === 'new' ? '' : carForm.model} /></span></label>
            <label className="field"><span>Colour (optional)</span><span className="input"><input name="color" placeholder="White" defaultValue={carForm === 'new' ? '' : carForm.color} /></span></label>
            <label className="field"><span>Fuel (optional)</span><span className="input"><select name="fuel" defaultValue={carForm === 'new' ? '' : carForm.fuel}><option value="">Not set</option><option>Petrol</option><option>Diesel</option><option>CNG</option><option>Electric</option></select></span></label>
            <label className="field"><span>Year (optional)</span><span className="input"><input name="year" type="number" min={1990} max={2100} placeholder="2023" defaultValue={carForm === 'new' ? '' : carForm.year ?? ''} /></span></label>
            <label className="field"><span>Typical pickup time in minutes (optional)</span><span className="input"><input name="eta" type="number" min={1} max={180} placeholder="20" defaultValue={carForm === 'new' ? '' : carForm.pickupEtaMin} /></span></label>
            <label className="field"><span>Default driver (optional)</span><span className="input"><UserRound size={16} /><select name="defaultDriverId" defaultValue={carForm === 'new' ? '' : carForm.defaultDriverId}>
              <option value="">No default driver</option>
              {driverRows.filter((d) => d.registered).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></span><small className="muted">Picked automatically when this car is assigned. You can still choose another driver for any ride.</small></label>
            <label className="field"><span>GPS tracker ID (optional)</span><span className="input"><input name="gpsId" placeholder="Device ID / IMEI from the car's GPS unit" defaultValue={carForm === 'new' ? '' : carForm.gpsId} /></span></label>
            <label className="field"><span>Notes (optional)</span><span className="input"><input name="notes" placeholder="Insurance, permit, service dates..." defaultValue={carForm === 'new' ? '' : carForm.notes} /></span></label>
            <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setCarForm(null)}>Cancel</button><button type="submit" className="btn btn-primary">{carForm === 'new' ? <><Plus size={16} /> Add car</> : <><Check size={16} /> Save changes</>}</button></div>
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
          {selectedDriver.registered && <form className="stack tight-gap" onSubmit={(e) => { e.preventDefault(); resetDriverPassword(selectedDriver) }}>
            <span className="eyebrow">Reset password</span>
            <small className="muted">Sign-in: {selectedDriver.phone}{selectedDriver.password ? <> · current password <span className="pw-chip">{selectedDriver.password}</span></> : ''}</small>
            <span className="input"><Lock size={16} /><input value={newDriverPw} onChange={(e) => setNewDriverPw(e.target.value)} minLength={4} maxLength={64} placeholder="New password (at least 4 characters)" autoComplete="off" required aria-label={`New password for ${selectedDriver.name}`} /></span>
            <div className="modal-actions"><button type="submit" className="btn btn-ghost compact" disabled={newDriverPw.trim().length < 4}><KeyRound size={15} /> Set new password</button></div>
          </form>}
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
