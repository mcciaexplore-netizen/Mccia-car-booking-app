import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, CarFront, History, UserRound, Home } from 'lucide-react'
import AccountPage from './AccountPage'
import TripPage from './TripPage'
import RideHistory from './RideHistory'
import BookingForm, { type Prefill } from './BookingForm'
import { frequentPlaces } from './frequent'
import Notifications from './Notifications'
import { isActive, STATUS_LABEL, type Ride } from './rides'
import type { Coords } from './places'
import { api } from './api'
import type { User } from './auth'

type Tab = 'book' | 'rides' | 'account'

function activeSummary(r: Ride): [string, string] {
  const [label] = STATUS_LABEL[r.status]
  if (r.status === 'held') return [label, r.holdNote || 'Your request is on hold']
  if (r.status === 'requested') return [label, `${r.pickup} to ${r.destination}`]
  return [label, `${r.vehicle} · ${r.driverName}${r.otp ? ' · PIN ' + r.otp : ''}`]
}

function App({ user, onUser, onLogout }: { user: User; onUser: (u: User) => void; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('book')
  const [rides, setRides] = useState<Ride[] | null>(null)
  const [rideId, setRideId] = useState<string | null>(null)
  const [here, setHere] = useState<Coords | undefined>()
  const [prefill, setPrefill] = useState<(Prefill & { n: number }) | undefined>()

  useEffect(() => {
    navigator.permissions?.query({ name: 'geolocation' }).then((p) => {
      if (p.state === 'granted') navigator.geolocation.getCurrentPosition(({ coords }) => setHere({ lat: coords.latitude, lon: coords.longitude }), () => undefined)
    }).catch(() => undefined)
  }, [])

  const refresh = useCallback(async () => {
    try { setRides(await api<Ride[]>('/rider/rides')) } catch { /* keep the last list */ }
  }, [])
  useEffect(() => {
    void refresh()
    const timer = setInterval(refresh, 4000)
    return () => clearInterval(timer)
  }, [refresh])

  const activeRide = rides?.find(isActive)

  function rebook(ride: Ride) { setPrefill({ n: Date.now(), pickup: ride.pickup, destination: ride.destination, pickupCoords: ride.pickupCoords, destinationCoords: ride.destinationCoords }); setTab('book') }

  const tabs: { id: Tab; label: string; icon: typeof Home }[] = [{ id: 'book', label: 'Book', icon: Home }, { id: 'rides', label: 'My rides', icon: History }, { id: 'account', label: 'Account', icon: UserRound }]
  const popups = <Notifications onViewRide={(id) => { setRideId(id); void refresh() }} />

  if (rideId) return <>{popups}<TripPage rideId={rideId} user={user} onDone={() => { setRideId(null); void refresh() }} /></>

  return (
    <div className="m-shell app-shell">
      {popups}
      <header className="m-header">
        <div className="m-brand"><img src="/mccia-logo.png" alt="MCCIA" /><span>Cabs</span></div>
        <span className="avatar small">{user.name.charAt(0).toUpperCase()}</span>
      </header>

      <main className="m-main">
        {tab === 'book' && <>
          <div className="m-title"><span className="eyebrow">Hi {user.name.split(' ')[0]}</span><h1>Where to?</h1><p>Send a cab request for MCCIA approval.</p></div>

          {/* One column on phones; booking form beside active/recent rides on wide screens. */}
          <div className="book-grid">
            <div className="stack book-main">
              {activeRide && <button type="button" className="card active-ride" onClick={() => setRideId(activeRide.id)}>
                <span className="row"><span className="avatar"><CarFront size={18} /></span><span className="grow"><strong>{activeSummary(activeRide)[0]}</strong><small>{activeSummary(activeRide)[1]}</small></span><ArrowRight size={18} /></span>
              </button>}

              <BookingForm key={prefill?.n ?? 0} frequent={frequentPlaces(rides)} user={user} here={here} onLocated={setHere} prefill={prefill} onSent={() => void refresh()} onViewRequests={() => setTab('rides')} />
            </div>

            {rides && rides.length > 0 && <div className="stack book-side"><div className="card-head"><h2>Recent rides</h2><button type="button" className="link-btn" onClick={() => setTab('rides')}>See all</button></div><RideHistory rides={rides} limit={2} onOpen={setRideId} onRebook={rebook} onChanged={refresh} /></div>}
          </div>
        </>}

        {tab === 'rides' && <><div className="m-title"><h1>My rides</h1><p>{rides?.length ?? 0} requests</p></div><RideHistory rides={rides} onOpen={setRideId} onRebook={rebook} onChanged={refresh} /></>}
        {tab === 'account' && <><div className="m-title"><h1>Account</h1><p>Your details and security.</p></div><AccountPage user={user} onUser={onUser} onLogout={onLogout} /></>}
      </main>

      <nav className="m-tabs" aria-label="Main">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`m-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}><Icon size={20} />{label}</button>)}
      </nav>
    </div>
  )
}

export default App
