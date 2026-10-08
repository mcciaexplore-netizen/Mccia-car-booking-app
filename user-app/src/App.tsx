import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowDownUp, ArrowRight, CarFront, Clock3, History, MapPin, Navigation, Plus, UserRound, UsersRound, Home } from 'lucide-react'
import AccountPage from './AccountPage'
import TripPage from './TripPage'
import RideHistory, { isActive, type PastRide } from './RideHistory'
import LocationInput from './LocationInput'
import { searchPlaces, type Coords } from './places'
import { api, ApiError } from './api'
import type { User } from './auth'

type Driver = { id: string; name: string; phone: string; registered: boolean }
type Car = { name: string; seats: number; plate: string; pickupEtaMin: number }
type Tab = 'book' | 'rides' | 'account'

function App({ user, onUser, onLogout }: { user: User; onUser: (u: User) => void; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('book')
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [cars, setCars] = useState<Car[]>([])
  const [rides, setRides] = useState<PastRide[] | null>(null)
  const [rideId, setRideId] = useState<string | null>(null)
  const [driverId, setDriverId] = useState('')
  const [carName, setCarName] = useState('')
  const [passengers, setPassengers] = useState(1)
  const [pickup, setPickup] = useState('')
  const [destination, setDestination] = useState('')
  const [pickupCoords, setPickupCoords] = useState<Coords | undefined>()
  const [destCoords, setDestCoords] = useState<Coords | undefined>()
  const [here, setHere] = useState<Coords | undefined>()
  const [scheduleRide, setScheduleRide] = useState(false)
  const [scheduledTime, setScheduledTime] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    navigator.permissions?.query({ name: 'geolocation' }).then((p) => {
      if (p.state === 'granted') navigator.geolocation.getCurrentPosition(({ coords }) => setHere({ lat: coords.latitude, lon: coords.longitude }), () => undefined)
    }).catch(() => undefined)
    api<Car[]>('/cars').then(setCars).catch((e: ApiError) => setError(e.message))
  }, [])

  // One poll keeps the driver list and this rider's rides in sync with the backend.
  const refresh = useCallback(async () => {
    const [d, r] = await Promise.allSettled([api<Driver[]>('/drivers'), api<PastRide[]>('/rider/rides')])
    if (d.status === 'fulfilled') setDrivers(d.value)
    if (r.status === 'fulfilled') setRides(r.value)
  }, [])
  useEffect(() => {
    void refresh()
    const timer = setInterval(refresh, 4000)
    return () => clearInterval(timer)
  }, [refresh])

  const activeRide = rides?.find(isActive)
  const chosenCar = cars.find((c) => c.name === carName)
  const maxSeats = chosenCar?.seats ?? 6
  const clock = new Date()

  function openRide(id: string) { setRideId(id) }
  function rebook(ride: PastRide) {
    setPickup(ride.pickup); setDestination(ride.destination)
    setPickupCoords(ride.pickupCoords ?? undefined); setDestCoords(ride.destinationCoords ?? undefined)
    setCarName(ride.vehicle); setTab('book')
  }
  function swapLocations() {
    setPickup(destination); setDestination(pickup)
    setPickupCoords(destCoords); setDestCoords(pickupCoords)
  }
  async function locate(text: string) { return (await searchPlaces(text.trim(), here).catch(() => []))[0]?.coords }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    if (!form.reportValidity()) return
    setSubmitting(true); setError('')
    try {
      const ride = await api<{ id: string }>('/rides', {
        body: {
          riderName: user.name, phone: user.phone,
          pickupCoords: pickupCoords ?? (await locate(pickup)), destinationCoords: destCoords ?? (await locate(destination)),
          pickup: pickup.trim(), destination: destination.trim(), driverId, car: carName, passengers,
          pickupTime: scheduleRide && scheduledTime ? scheduledTime : '',
        },
      })
      setPickup(''); setDestination(''); setPickupCoords(undefined); setDestCoords(undefined)
      setDriverId(''); setCarName(''); setPassengers(1); setScheduleRide(false); setScheduledTime('')
      void refresh()
      setRideId(ride.id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send your request.')
    } finally { setSubmitting(false) }
  }

  if (rideId) return <TripPage rideId={rideId} user={user} onDone={() => { setRideId(null); void refresh() }} />

  const tabs: { id: Tab; label: string; icon: typeof Home }[] = [{ id: 'book', label: 'Book', icon: Home }, { id: 'rides', label: 'My rides', icon: History }, { id: 'account', label: 'Account', icon: UserRound }]

  return (
    <div className="m-shell">
      <header className="m-header">
        <div className="m-brand"><img src="/mccia-logo.png" alt="MCCIA" /><span>Cabs</span></div>
        <span className="avatar small">{user.name.charAt(0).toUpperCase()}</span>
      </header>

      <main className="m-main">
        {tab === 'book' && <>
          <div className="m-title"><span className="eyebrow">Hi {user.name.split(' ')[0]}</span><h1>Where to?</h1><p>Book an MCCIA cab in a few taps.</p></div>

          {activeRide && <button type="button" className="card active-ride" onClick={() => openRide(activeRide.id)}>
            <span className="row"><span className="avatar"><CarFront size={18} /></span><span className="grow"><strong>{activeRide.status === 'requested' ? (activeRide.allocation ? 'Your cab is scheduled' : 'Request received') : activeRide.status === 'accepted' ? 'Your driver is on the way' : 'Trip in progress'}</strong><small>{activeRide.vehicle} · {activeRide.driverName}</small></span><ArrowRight size={18} /></span>
          </button>}

          <form className="stack" onSubmit={submitBooking}>
            <div className="card tight">
              <LocationInput name="pickup" caption="FROM" placeholder="Pickup location" tone="pickup" icon={<MapPin size={15} />} value={pickup} onChange={(text, c) => { setPickup(text); setPickupCoords(c) }} bias={here} allowCurrent onLocated={setHere} autoComplete="off" />
              <div className="swap-row"><span className="divider" /><button type="button" className="swap-btn" onClick={swapLocations} aria-label="Swap pickup and destination"><ArrowDownUp size={14} /></button><span className="divider" /></div>
              <LocationInput name="destination" caption="TO" placeholder="Where to?" tone="destination" icon={<Navigation size={15} />} value={destination} onChange={(text, c) => { setDestination(text); setDestCoords(c) }} bias={here} />
            </div>

            <div className="card">
              <div className="card-head"><h2>Choose a car</h2><span className="eyebrow">{cars.length} types</span></div>
              <div className="car-options">
                {cars.map((c) => {
                  return <button type="button" key={c.name} className={`car-option ${carName === c.name ? 'selected' : ''}`} onClick={() => { setCarName(c.name); setPassengers((p) => Math.min(p, c.seats)) }} aria-pressed={carName === c.name}>
                    <CarFront size={22} /><strong>{c.name}</strong><small>Up to {c.seats} riders</small>
                  </button>
                })}
              </div>
              <label className="field"><span>Driver</span><span className="input"><UserRound size={16} /><select value={driverId} onChange={(e) => setDriverId(e.target.value)} required><option value="" disabled>Select a driver</option>{drivers.filter((d) => d.registered).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></span></label>
              {carName === '' && <p className="hint">Pick a car to continue.</p>}
            </div>

            <div className="card">
              <div className="row"><span className="icon-bubble"><UsersRound size={16} /></span><span className="grow"><strong>Passengers</strong><small>Including you</small></span>
                <div className="stepper"><button type="button" aria-label="Remove passenger" onClick={() => setPassengers((v) => Math.max(1, v - 1))} disabled={passengers <= 1}>−</button><output>{passengers}</output><button type="button" aria-label="Add passenger" onClick={() => setPassengers((v) => Math.min(maxSeats, v + 1))} disabled={passengers >= maxSeats}><Plus size={14} /></button></div></div>
              <div className="divider" />
              <div className="row"><span className="icon-bubble"><Clock3 size={16} /></span><span className="grow"><strong>Pickup time</strong><small>{scheduleRide ? 'Choose a time' : 'As soon as a car is free'}</small></span>
                <button type="button" className="btn btn-ghost compact" onClick={() => setScheduleRide((v) => !v)}>{scheduleRide ? 'Schedule' : 'Ride now'}</button></div>
              {scheduleRide && <label className="field"><span>Pickup date and time</span><span className="input"><input type="datetime-local" value={scheduledTime} min={new Date(clock.getTime() + 5 * 60_000).toISOString().slice(0, 16)} onChange={(e) => setScheduledTime(e.target.value)} required /></span></label>}
            </div>

            {error && <div className="alert error" role="alert">{error}</div>}
            <button className="btn btn-primary btn-block" type="submit" disabled={submitting || !carName}>{submitting ? 'Sending…' : 'Request ride'} <ArrowRight size={17} /></button>
          </form>

          {rides && rides.length > 0 && <div className="stack"><div className="card-head"><h2>Recent rides</h2><button type="button" className="link-btn" onClick={() => setTab('rides')}>See all</button></div><RideHistory rides={rides} limit={2} onOpen={openRide} onRebook={rebook} /></div>}
        </>}

        {tab === 'rides' && <><div className="m-title"><h1>My rides</h1><p>{rides?.length ?? 0} bookings</p></div><RideHistory rides={rides} onOpen={openRide} onRebook={rebook} /></>}
        {tab === 'account' && <><div className="m-title"><h1>Account</h1><p>Your details and security.</p></div><AccountPage user={user} onUser={onUser} onLogout={onLogout} /></>}
      </main>

      <nav className="m-tabs" aria-label="Main">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`m-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}><Icon size={20} />{label}</button>)}
      </nav>
    </div>
  )
}

export default App
