import { useState } from 'react'
import { ArrowRight, CarFront, Clock3, RotateCcw } from 'lucide-react'
import { api, ApiError } from './api'
import { canCancel, isActive, routeText, STATUS_LABEL, whenText, type Ride } from './rides'

export default function RideHistory({ rides, limit, onOpen, onRebook, onChanged }: {
  rides: Ride[] | null; limit?: number; onOpen: (id: string) => void; onRebook: (ride: Ride) => void; onChanged: () => void
}) {
  const [error, setError] = useState('')
  const shown = rides ? rides.slice(0, limit) : []

  async function cancel(r: Ride) {
    if (!window.confirm('Cancel this request?')) return
    try { await api(`/rides/${r.id}/cancel`, { method: 'POST', body: {} }); setError(''); onChanged() }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not cancel.') }
  }

  return (
    <section className="stack" aria-label="Ride history">
      {error && <div className="alert error" role="alert">{error}</div>}
      {rides && rides.length === 0 && <div className="card empty">No rides yet. Your requests will show up here.</div>}
      {shown.map((r) => {
        const [text, tone] = STATUS_LABEL[r.status]
        const assigned = ['approved', 'accepted', 'started'].includes(r.status)
        return (
          <article className="card" key={r.id}>
            <div className="card-head"><span className="eyebrow">{new Date(r.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {r.id}</span><span className={`chip ${tone}`}>{text}</span></div>
            <div className="ride-route"><strong>{routeText(r).join(' → ')}</strong><ArrowRight size={14} /></div>
            <div className="meta-line">
              <span><Clock3 size={14} /> {whenText(r)}</span>
              {assigned && <span><CarFront size={14} /> {r.vehicle} · {r.plate}</span>}
              {assigned && <span>{r.driverName}</span>}
            </div>
            {r.status === 'held' && r.holdNote && <p className="hint">On hold: {r.holdNote}</p>}
            {isActive(r)
              ? <div className="row-actions">
                <button type="button" className="btn btn-primary" onClick={() => onOpen(r.id)}>View ride</button>
                {canCancel(r) && <button type="button" className="btn btn-danger" onClick={() => cancel(r)}>Cancel request</button>}
              </div>
              : <button type="button" className="btn btn-ghost" onClick={() => onRebook(r)}><RotateCcw size={15} /> Book again</button>}
          </article>
        )
      })}
    </section>
  )
}
