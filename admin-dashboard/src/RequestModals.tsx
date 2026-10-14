// Dialogs for the request queue: approve (assign car + driver), hold, cancel, and a walk-in booking.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Check, CarFront, Clock3, PauseCircle, Plus, UserRound, X, XCircle } from 'lucide-react'
import { api } from './api'
import { routeText, whenLabel, type QueueRide } from './requestUtils'

type CarOption = { name: string; plate: string; seats: number }
type DriverOption = { id: string; name: string; registered: boolean }
type Options = { cars: (CarOption & { fits: boolean; busy: string | null })[]; drivers: (DriverOption & { busy: string | null })[] }

function Shell({ id, eyebrow, title, onClose, children }: { id: string; eyebrow: string; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section className="modal card" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="card-head"><div><span className="eyebrow">{eyebrow}</span><h2 id={id}>{title}</h2></div><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
        {children}
      </section>
    </div>
  )
}

function Summary({ ride }: { ride: QueueRide }) {
  const route = routeText(ride)
  return (
    <div className="req-summary">
      <div><small>Passenger</small><strong>{ride.riderName}{ride.passengers > 1 ? ` · ${ride.passengers} riders` : ''}</strong><span>{ride.phone || 'No phone'}</span></div>
      <div><small>Route</small><strong className="route-line">{route.map((p, i) => <span key={i}>{i > 0 && <em>→</em>}{p}</span>)}</strong></div>
      <div><small>{ride.tripType === 'multiday' ? 'Dates' : 'When'}</small><strong>{whenLabel(ride)}</strong></div>
      {ride.returnedNote && <div className="alert warn"><Clock3 size={15} /> {ride.returnedNote}. Assign someone else.</div>}
      {ride.holdNote && <div><small>Hold note</small><strong>{ride.holdNote}</strong></div>}
    </div>
  )
}

// Approve = choose the car and the driver. The rider is notified in the app and by e-mail.
export function ApproveModal({ ride, cars, drivers, onClose, onDone }: { ride: QueueRide; cars: CarOption[]; drivers: DriverOption[]; onClose: () => void; onDone: (message: string) => void }) {
  const [opts, setOpts] = useState<Options | null>(null)
  const [car, setCar] = useState('')
  const [driverId, setDriverId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    api<Options>(`/admin/rides/${ride.id}/options`).then((o) => {
      if (!alive) return
      setOpts(o)
      const firstCar = o.cars.find((c) => c.fits && !c.busy) ?? o.cars.find((c) => c.fits)
      const firstDriver = o.drivers.find((d) => d.registered && !d.busy) ?? o.drivers.find((d) => d.registered)
      setCar((c) => c || (ride.vehicle && o.cars.some((x) => x.name === ride.vehicle) ? ride.vehicle : firstCar?.name ?? ''))
      setDriverId((d) => d || (ride.driverId && o.drivers.some((x) => x.id === ride.driverId) ? ride.driverId : firstDriver?.id ?? ''))
    }).catch(() => { if (alive) setOpts({ cars: cars.map((c) => ({ ...c, fits: c.seats >= ride.passengers, busy: null })), drivers: drivers.map((d) => ({ ...d, busy: null })) }) })
    return () => { alive = false }
  }, [ride.id, ride.vehicle, ride.driverId, ride.passengers, cars, drivers])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api(`/admin/rides/${ride.id}/approve`, { method: 'POST', body: { car, driverId } })
      onDone(`Approved. ${ride.riderName} has been notified: ${car} with ${opts?.drivers.find((d) => d.id === driverId)?.name ?? 'the driver'}.`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not approve'); setBusy(false) }
  }

  return (
    <Shell id="approve-title" eyebrow={ride.id} title={ride.status === 'approved' ? 'Change car or driver' : 'Approve request'} onClose={onClose}>
      <Summary ride={ride} />
      <form className="stack" onSubmit={submit}>
        <label className="field"><span>Car</span><span className="input"><CarFront size={16} />
          <select value={car} onChange={(e) => setCar(e.target.value)} required>
            <option value="" disabled>Choose a car</option>
            {(opts?.cars ?? []).map((c) => <option key={c.name} value={c.name} disabled={!c.fits || !!c.busy}>{c.name} · {c.plate} · {c.seats} seats{!c.fits ? ' (too small)' : c.busy ? ` (${c.busy})` : ''}</option>)}
          </select></span></label>
        <label className="field"><span>Driver</span><span className="input"><UserRound size={16} />
          <select value={driverId} onChange={(e) => setDriverId(e.target.value)} required>
            <option value="" disabled>Choose a driver</option>
            {(opts?.drivers ?? []).map((d) => <option key={d.id} value={d.id} disabled={!d.registered || !!d.busy}>{d.name}{!d.registered ? ' (not signed up yet)' : d.busy ? ` (${d.busy})` : ''}</option>)}
          </select></span></label>
        {error && <div className="alert error" role="alert">{error}</div>}
        <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>Close</button><button type="submit" className="btn btn-primary" disabled={busy || !car || !driverId}><Check size={16} /> {ride.status === 'approved' ? 'Save' : 'Approve & assign'}</button></div>
      </form>
    </Shell>
  )
}

export function HoldModal({ ride, onClose, onDone }: { ride: QueueRide; onClose: () => void; onDone: (message: string) => void }) {
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    try { await api(`/admin/rides/${ride.id}/hold`, { method: 'POST', body: { note } }); onDone(`${ride.riderName}'s request is on hold and they were told`) } catch (err) { setError(err instanceof Error ? err.message : 'Could not hold') }
  }
  return (
    <Shell id="hold-title" eyebrow={ride.id} title="Put request on hold" onClose={onClose}>
      <Summary ride={ride} />
      <form className="stack" onSubmit={submit}>
        <label className="field"><span>Note to the rider (optional)</span><span className="input"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Checking car availability for that date" autoFocus /></span></label>
        {error && <div className="alert error" role="alert">{error}</div>}
        <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>Close</button><button type="submit" className="btn btn-primary"><PauseCircle size={16} /> Hold request</button></div>
      </form>
    </Shell>
  )
}

export function CancelModal({ ride, onClose, onDone }: { ride: QueueRide; onClose: () => void; onDone: (message: string) => void }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    try { await api(`/admin/rides/${ride.id}/cancel`, { method: 'POST', body: { reason } }); onDone(`${ride.riderName}'s request was cancelled and they were told`) } catch (err) { setError(err instanceof Error ? err.message : 'Could not cancel') }
  }
  return (
    <Shell id="cancel-title" eyebrow={ride.id} title="Cancel request" onClose={onClose}>
      <Summary ride={ride} />
      <form className="stack" onSubmit={submit}>
        <label className="field"><span>Reason for the rider (optional)</span><span className="input"><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. No car free on that date" autoFocus /></span></label>
        {error && <div className="alert error" role="alert">{error}</div>}
        <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>Keep request</button><button type="submit" className="btn btn-danger"><XCircle size={16} /> Cancel request</button></div>
      </form>
    </Shell>
  )
}

// Admin books for a walk-in or phone caller: the admin picks the car and the driver, so it is approved straight away.
export function WalkInModal({ cars, drivers, onClose, onDone }: { cars: CarOption[]; drivers: DriverOption[]; onClose: () => void; onDone: (message: string) => void }) {
  const [mode, setMode] = useState<'now' | 'scheduled' | 'multiday'>('now')
  const [error, setError] = useState('')
  const registered = drivers.filter((d) => d.registered)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const iso = (k: string) => (f.get(k) ? new Date(String(f.get(k))).toISOString() : undefined)
    try {
      await api('/admin/rides', { method: 'POST', body: {
        riderName: String(f.get('name')).trim(), phone: String(f.get('phone') ?? '').trim(), pickup: String(f.get('origin')).trim(), destination: String(f.get('destination')).trim(),
        passengers: Number(f.get('passengers')) || 1, car: String(f.get('car')), driverId: String(f.get('driverId')),
        tripType: mode, startAt: mode === 'now' ? undefined : iso('startAt'), endAt: mode === 'multiday' ? iso('endAt') : undefined,
      } })
      onDone('Booking added and approved')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not add the booking') }
  }
  return (
    <Shell id="walkin-title" eyebrow="New booking" title="Add a booking" onClose={onClose}>
      <p className="muted">For a walk-in or phone request. You choose the car and driver, so it is approved straight away.</p>
      <form className="stack" onSubmit={submit}>
        <label className="field"><span>Rider name</span><span className="input"><UserRound size={16} /><input name="name" required minLength={2} /></span></label>
        <label className="field"><span>Phone</span><span className="input"><input name="phone" type="tel" /></span></label>
        <label className="field"><span>Pickup</span><span className="input"><input name="origin" required placeholder="Pickup address" /></span></label>
        <label className="field"><span>Destination</span><span className="input"><input name="destination" required placeholder="Drop-off address" /></span></label>
        <label className="field"><span>Passengers</span><span className="input"><input name="passengers" type="number" min={1} max={20} defaultValue={1} required /></span></label>
        <div className="seg" role="tablist" aria-label="When">
          {([['now', 'Now'], ['scheduled', 'Schedule'], ['multiday', 'Multi-day']] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={mode === id} className={mode === id ? 'on' : ''} onClick={() => setMode(id)}>{label}</button>)}
        </div>
        {mode !== 'now' && <label className="field"><span>{mode === 'multiday' ? 'From' : 'Pickup date and time'}</span><span className="input"><input name="startAt" type="datetime-local" required /></span></label>}
        {mode === 'multiday' && <label className="field"><span>Until</span><span className="input"><input name="endAt" type="datetime-local" required /></span></label>}
        <label className="field"><span>Car</span><span className="input"><CarFront size={16} /><select name="car" required defaultValue={cars[0]?.name}>{cars.map((c) => <option key={c.name} value={c.name}>{c.name} · {c.plate} · {c.seats} seats</option>)}</select></span></label>
        <label className="field"><span>Driver</span><span className="input"><UserRound size={16} /><select name="driverId" required defaultValue={registered[0]?.id}>{registered.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></span></label>
        {error && <div className="alert error" role="alert">{error}</div>}
        <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary"><Plus size={16} /> Add booking</button></div>
      </form>
    </Shell>
  )
}
