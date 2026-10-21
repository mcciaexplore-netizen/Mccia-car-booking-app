import { useState, type FormEvent } from 'react'
import { ArrowDownUp, ArrowRight, CalendarClock, CalendarRange, CheckCircle2, ExternalLink, MapPin, Navigation, Plus, UsersRound, X, Zap } from 'lucide-react'
import LocationInput from './LocationInput'
import { hasPlace, placeUrl, routeUrl } from './gmaps'
import AllocationTable from './AllocationTable'
import { searchPlaces, type Coords } from './places'
import { api, ApiError } from './api'
import { whenLabel, whenText, routeText, type Ride } from './rides'
import type { User } from './auth'
import type { Place } from './places'

type Mode = Ride['tripType']
type StopField = { key: number; text: string; coords?: Coords }
export type Prefill = { pickup: string; destination: string; pickupCoords?: Coords | null; destinationCoords?: Coords | null }

const MAX_STOPS = 5
const MAX_PASSENGERS = 6
const pad = (n: number) => String(n).padStart(2, '0')
const localValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

const MODES: { id: Mode; label: string; hint: string; icon: typeof Zap }[] = [
  { id: 'now', label: 'Now', hint: 'Leave as soon as your request is approved', icon: Zap },
  { id: 'scheduled', label: 'Schedule', hint: 'Pick a date and time', icon: CalendarClock },
  { id: 'multiday', label: 'Multi-day', hint: 'A car for several days', icon: CalendarRange },
]

let stopKey = 0

// Lets the rider double-check the places in their own Google Maps app before sending the request.
function GoogleMapsCheck({ pickup, destination, stops }: { pickup: { label: string; coords?: Coords }; destination: { label: string; coords?: Coords }; stops: { label: string; coords?: Coords }[] }) {
  const from = hasPlace(pickup), to = hasPlace(destination)
  if (!from && !to) return null
  const link = (href: string, text: string) => <a className="gmaps-chip" href={href} target="_blank" rel="noreferrer">{text} <ExternalLink size={12} /></a>
  return (
    <div className="gmaps-check">
      <small>Check in Google Maps</small>
      {from && link(placeUrl(pickup), 'Pickup')}
      {to && link(placeUrl(destination), 'Destination')}
      {from && to && link(routeUrl(pickup, destination, stops), 'Route')}
    </div>
  )
}

export default function BookingForm({ user, here, onLocated, prefill, onSent, onViewRequests, frequent }: {
  user: User; here?: Coords; onLocated: (c: Coords) => void; prefill?: Prefill; frequent: Place[]
  onSent: () => void; onViewRequests: () => void
}) {
  const [pickup, setPickup] = useState(prefill?.pickup ?? '')
  const [destination, setDestination] = useState(prefill?.destination ?? '')
  const [pickupCoords, setPickupCoords] = useState<Coords | undefined>(prefill?.pickupCoords ?? undefined)
  const [destCoords, setDestCoords] = useState<Coords | undefined>(prefill?.destinationCoords ?? undefined)
  const [stops, setStops] = useState<StopField[]>([])
  const [mode, setMode] = useState<Mode>('now')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [passengers, setPassengers] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<Ride | null>(null)

  const minStart = localValue(new Date())
  const minEnd = startAt || minStart

  function swapLocations() {
    setPickup(destination); setDestination(pickup)
    setPickupCoords(destCoords); setDestCoords(pickupCoords)
  }
  const locate = async (text: string) => (await searchPlaces(text.trim(), here).catch(() => []))[0]?.coords
  const patchStop = (key: number, text: string, coords?: Coords) => setStops((s) => s.map((x) => (x.key === key ? { ...x, text, coords } : x)))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!event.currentTarget.reportValidity()) return
    setError('')
    const start = startAt ? new Date(startAt) : null
    const end = endAt ? new Date(endAt) : null
    if (mode !== 'now' && (!start || start.getTime() < Date.now() - 60_000)) return setError('Choose a start time that is not in the past.')
    if (mode === 'multiday' && (!start || !end || end <= start)) return setError('The end date and time must be after the start.')
    setSubmitting(true)
    try {
      const ride = await api<Ride>('/rides', {
        body: {
          riderName: user.name, phone: user.phone, passengers, tripType: mode,
          pickup: pickup.trim(), destination: destination.trim(),
          pickupCoords: pickupCoords ?? (await locate(pickup)), destinationCoords: destCoords ?? (await locate(destination)),
          stops: stops.map((s) => ({ label: s.text.trim(), ...(s.coords ? { coords: s.coords } : {}) })),
          ...(mode !== 'now' && start ? { startAt: start.toISOString() } : {}),
          ...(mode === 'multiday' && end ? { endAt: end.toISOString() } : {}),
        },
      })
      setSent(ride)
      onSent()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send your request.')
    } finally { setSubmitting(false) }
  }

  function another() {
    setSent(null); setPickup(''); setDestination(''); setPickupCoords(undefined); setDestCoords(undefined)
    setStops([]); setMode('now'); setStartAt(''); setEndAt(''); setPassengers(1)
  }

  if (sent) {
    return (
      <section className="card sent" role="status">
        <span className="modal-icon ok"><CheckCircle2 size={28} /></span>
        <div className="m-title center"><h2>Request sent for approval</h2><p>You will be notified when it is approved.</p></div>
        <AllocationTable label="Request summary" rows={[
          ['Request', sent.id],
          ['Route', <ol className="route-list" key="r">{routeText(sent).map((p, i) => <li key={i}>{p}</li>)}</ol>],
          [whenLabel(sent), whenText(sent)],
          ['Passengers', String(sent.passengers)],
        ]} />
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onViewRequests}>View my requests</button>
          <button type="button" className="btn btn-ghost" onClick={another}>Book another</button>
        </div>
      </section>
    )
  }

  const activeMode = MODES.find((m) => m.id === mode)!

  return (
    <form className="stack" onSubmit={submit}>
      <div className="card tight">
        <LocationInput frequent={frequent} name="pickup" caption="FROM" placeholder="Pickup location" tone="pickup" icon={<MapPin size={15} />} value={pickup} onChange={(text, c) => { setPickup(text); setPickupCoords(c) }} bias={here} allowCurrent onLocated={onLocated} />
        {stops.map((s, i) => (
          <div key={s.key} className="stop-row">
            <div className="swap-row"><span className="divider" /></div>
            <div className="stop-line">
              <LocationInput frequent={frequent} name={`stop-${s.key}`} caption={`STOP ${i + 1}`} placeholder="Layover stop" tone="pickup" icon={<span className="stop-num">{i + 1}</span>} value={s.text} onChange={(text, c) => patchStop(s.key, text, c)} bias={here} />
              <button type="button" className="stop-remove" aria-label={`Remove stop ${i + 1}`} onClick={() => setStops((all) => all.filter((x) => x.key !== s.key))}><X size={15} /></button>
            </div>
          </div>
        ))}
        <div className="swap-row"><span className="divider" /><button type="button" className="swap-btn" onClick={swapLocations} aria-label="Swap pickup and destination"><ArrowDownUp size={14} /></button><span className="divider" /></div>
        <LocationInput frequent={frequent} name="destination" caption="TO" placeholder="Where to?" tone="destination" icon={<Navigation size={15} />} value={destination} onChange={(text, c) => { setDestination(text); setDestCoords(c) }} bias={here} />
        {stops.length < MAX_STOPS && <button type="button" className="add-stop" onClick={() => setStops((s) => [...s, { key: ++stopKey, text: '' }])}><Plus size={15} /> Add a stop{stops.length > 0 ? ` (${stops.length}/${MAX_STOPS})` : ''}</button>}
        <GoogleMapsCheck pickup={{ label: pickup, coords: pickupCoords }} destination={{ label: destination, coords: destCoords }} stops={stops.map((s) => ({ label: s.text, coords: s.coords }))} />
      </div>

      <div className="card">
        <div className="card-head"><h2>When</h2></div>
        <div className="segmented" role="radiogroup" aria-label="When do you need the cab?">
          {MODES.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="radio" aria-checked={mode === id} className={mode === id ? 'on' : ''} onClick={() => setMode(id)}><Icon size={16} />{label}</button>
          ))}
        </div>
        <p className="hint">{activeMode.hint}</p>
        {mode !== 'now' && (
          <label className="field"><span>{mode === 'multiday' ? 'From (date and time)' : 'Pickup date and time'}</span>
            <span className="input"><input type="datetime-local" value={startAt} min={minStart} onChange={(e) => setStartAt(e.target.value)} required /></span></label>
        )}
        {mode === 'multiday' && (
          <label className="field"><span>Until (date and time)</span>
            <span className="input"><input type="datetime-local" value={endAt} min={minEnd} onChange={(e) => setEndAt(e.target.value)} required /></span></label>
        )}
      </div>

      <div className="card">
        <div className="row"><span className="icon-bubble"><UsersRound size={16} /></span><span className="grow"><strong>Passengers</strong><small>Including you</small></span>
          <div className="stepper"><button type="button" aria-label="Remove passenger" onClick={() => setPassengers((v) => Math.max(1, v - 1))} disabled={passengers <= 1}>−</button><output>{passengers}</output><button type="button" aria-label="Add passenger" onClick={() => setPassengers((v) => Math.min(MAX_PASSENGERS, v + 1))} disabled={passengers >= MAX_PASSENGERS}><Plus size={14} /></button></div></div>
      </div>

      {error && <div className="alert error" role="alert">{error}</div>}
      <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Send request'} <ArrowRight size={17} /></button>
      <p className="hint center">An MCCIA admin approves your request and assigns the car and driver.</p>
    </form>
  )
}
