// Shared helpers for request dialogs and the queue.
export type QueueRide = {
  id: string; status: string; riderName: string; phone: string; passengers: number
  pickup: string; destination: string; stops: { label: string }[]
  tripType: 'now' | 'scheduled' | 'multiday'; startAt: string | null; endAt: string | null
  vehicle: string; driverId: string; holdNote: string; returnedNote: string
}
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
export const whenLabel = (r: Pick<QueueRide, 'tripType' | 'startAt' | 'endAt'>) =>
  r.tripType === 'multiday' && r.startAt && r.endAt ? `${when(r.startAt)} → ${when(r.endAt)}` : r.startAt ? when(r.startAt) : 'As soon as possible'
export const routeText = (r: Pick<QueueRide, 'pickup' | 'destination' | 'stops'>) => [r.pickup, ...r.stops.map((s) => s.label), r.destination]

