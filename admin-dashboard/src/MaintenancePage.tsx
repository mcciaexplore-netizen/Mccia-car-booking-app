// Fleet maintenance schedule. Jobs live in this page only (not saved to the backend yet); it starts empty.
import { useState, type FormEvent } from 'react'
import { CarFront, Check, Plus, Wrench, X } from 'lucide-react'

type Status = 'scheduled' | 'in-service' | 'overdue' | 'done'
type Job = { id: string; car: string; plate: string; task: string; due: string; odometer: number; cost: number; vendor: string; status: Status }
type Car = { name: string; plate: string }

const STATUS: Record<Status, { label: string; tone: string }> = {
  scheduled: { label: 'Scheduled', tone: '' },
  'in-service': { label: 'In service', tone: 'warn' },
  overdue: { label: 'Overdue', tone: 'red' },
  done: { label: 'Completed', tone: 'green' },
}
const TASKS = ['Engine oil & filter', 'Tyre rotation & alignment', 'Brake pad inspection', 'Insurance renewal', 'PUC certificate', 'Full service', 'AC service']
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`

export default function MaintenancePage({ cars, notify }: { cars: Car[]; notify: (m: string) => void }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [filter, setFilter] = useState<'all' | Status>('all')
  const [adding, setAdding] = useState(false)
  const shown = jobs.filter((j) => filter === 'all' || j.status === filter).sort((a, b) => a.due.localeCompare(b.due))
  const count = (s: Status) => jobs.filter((j) => j.status === s).length
  const spend = jobs.filter((j) => j.status === 'done').reduce((t, j) => t + j.cost, 0)
  const carList = cars.length ? cars : [{ name: 'Ertiga', plate: '' }]

  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const car = carList.find((c) => c.name === f.get('car')) ?? { name: String(f.get('car')), plate: '' }
    setJobs((j) => [...j, { id: `MNT-${String(j.length + 1).padStart(3, '0')}`, car: car.name, plate: car.plate, task: String(f.get('task')), due: String(f.get('due')), odometer: Number(f.get('odo')) || 0, cost: Number(f.get('cost')) || 0, vendor: String(f.get('vendor') || '—'), status: 'scheduled' }])
    setAdding(false)
    notify('Service scheduled')
  }
  const complete = (id: string) => { setJobs((j) => j.map((x) => (x.id === id ? { ...x, status: 'done' } : x))); notify('Marked as completed') }

  return (
    <div className="page">
      <div className="page-head">
        <div><span className="eyebrow">Fleet · Pune</span><h1>Maintenance</h1><p>Service schedule, renewals and repair costs for every car.</p></div>
        <div className="head-actions"><button type="button" className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Schedule service</button></div>
      </div>

      <section className="card panel">
        <div className="crm-stats">
          <div><small>Overdue</small><strong>{count('overdue')}</strong></div>
          <div><small>In service now</small><strong>{count('in-service')}</strong></div>
          <div><small>Upcoming</small><strong>{count('scheduled')}</strong></div>
          <div><small>Spent (completed)</small><strong>{inr(spend)}</strong></div>
        </div>
        <div className="filter-chips" role="tablist" aria-label="Filter by status">
          {(['all', 'overdue', 'in-service', 'scheduled', 'done'] as const).map((s) => <button key={s} type="button" className={filter === s ? 'on' : ''} onClick={() => setFilter(s)}>{s === 'all' ? 'All' : STATUS[s].label} <span>{s === 'all' ? jobs.length : count(s)}</span></button>)}
        </div>
        <div className="table scroll-x">
          <div className="trow thead mrow"><span>Car</span><span>Task</span><span>Due</span><span>Odometer</span><span>Vendor</span><span>Cost</span><span>Status</span><span /></div>
          {shown.map((j) => <div className="trow mrow" key={j.id}>
            <span className="cell"><span className="avatar sm"><CarFront size={14} /></span><span className="grow"><strong>{j.car}</strong><small>{j.plate}</small></span></span>
            <span className="cell"><span className="grow"><strong>{j.task}</strong><small>{j.id}</small></span></span>
            <span className="cell">{fmt(j.due)}</span>
            <span className="cell">{j.odometer.toLocaleString('en-IN')} km</span>
            <span className="cell muted">{j.vendor}</span>
            <span className="cell">{inr(j.cost)}</span>
            <span className="cell"><span className={`chip ${STATUS[j.status].tone}`}>{STATUS[j.status].label}</span></span>
            <span className="cell">{j.status !== 'done' && <button type="button" className="chip-btn" onClick={() => complete(j.id)}><Check size={13} /> Done</button>}</span>
          </div>)}
          {!shown.length && <div className="empty"><Wrench size={22} />{jobs.length ? 'No jobs in this view.' : 'No maintenance jobs yet. Use “Schedule service” to add one.'}</div>}
        </div>
      </section>

      {adding && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setAdding(false) }}>
        <section className="modal card" role="dialog" aria-modal="true" aria-labelledby="mnt-title">
          <div className="card-head"><div><span className="eyebrow">Maintenance</span><h2 id="mnt-title">Schedule a service</h2></div><button type="button" className="icon-btn" aria-label="Close" onClick={() => setAdding(false)}><X size={18} /></button></div>
          <form className="stack" onSubmit={add}>
            <label className="field"><span>Car</span><span className="input"><select name="car" required>{carList.map((c) => <option key={c.name} value={c.name}>{c.name}{c.plate && ` · ${c.plate}`}</option>)}</select></span></label>
            <label className="field"><span>Task</span><span className="input"><select name="task" required>{TASKS.map((t) => <option key={t}>{t}</option>)}</select></span></label>
            <label className="field"><span>Due date</span><span className="input"><input name="due" type="date" defaultValue={day(7)} required /></span></label>
            <label className="field"><span>Odometer (km)</span><span className="input"><input name="odo" type="number" min={0} placeholder="42000" /></span></label>
            <label className="field"><span>Estimated cost (₹)</span><span className="input"><input name="cost" type="number" min={0} placeholder="3500" /></span></label>
            <label className="field"><span>Vendor</span><span className="input"><input name="vendor" placeholder="Workshop or provider" /></span></label>
            <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>Cancel</button><button type="submit" className="btn btn-primary"><Plus size={16} /> Schedule</button></div>
          </form>
        </section>
      </div>}
    </div>
  )
}
