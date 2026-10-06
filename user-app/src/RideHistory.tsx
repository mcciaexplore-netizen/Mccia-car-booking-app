import { ArrowRight, CarFront, Clock3, RotateCcw } from 'lucide-react'
import type { Coords } from './places'

export type PastRide = {
  id: string; pickup: string; destination: string; pickupCoords: Coords | null; destinationCoords: Coords | null
  driverName: string; vehicle: string; plate: string; tripMin: number; passengers: number
  status: 'requested' | 'accepted' | 'started' | 'cancelled' | 'declined' | 'completed'
  createdAt: string; slot: { ready: boolean } | null
}

const LABEL: Record<PastRide['status'], [string, string]> = {
  requested: ['Waiting', 'warn'], accepted: ['Driver on the way', ''], started: ['In progress', 'green'],
  completed: ['Completed', 'green'], cancelled: ['Cancelled', 'grey'], declined: ['Driver was busy', 'red'],
}
export const isActive = (r: PastRide) => ['requested', 'accepted', 'started'].includes(r.status)

export default function RideHistory({ rides, limit, onOpen, onRebook }: {
  rides: PastRide[] | null; limit?: number; onOpen: (id: string) => void; onRebook: (ride: PastRide) => void
}) {
  const shown = rides ? rides.slice(0, limit) : []
  return (
    <section className="stack" aria-label="Ride history">
      {rides && rides.length === 0 && <div className="card empty">No rides yet. Your bookings will show up here.</div>}
      {shown.map((r) => {
        const [text, tone] = LABEL[r.status]
        return (
          <article className="card" key={r.id}>
            <div className="card-head"><span className="eyebrow">{new Date(r.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {r.id}</span><span className={`chip ${tone}`}>{text}</span></div>
            <div className="ride-route"><strong>{r.pickup}</strong><ArrowRight size={14} /><strong>{r.destination}</strong></div>
            <div className="meta-line"><span><CarFront size={14} /> {r.vehicle} · {r.plate}</span><span>{r.driverName}</span><span><Clock3 size={14} /> {r.tripMin} min</span></div>
            {isActive(r)
              ? <button type="button" className="btn btn-primary" onClick={() => onOpen(r.id)}>View ride</button>
              : <button type="button" className="btn btn-ghost" onClick={() => onRebook(r)}><RotateCcw size={15} /> Book again</button>}
          </article>
        )
      })}
    </section>
  )
}
