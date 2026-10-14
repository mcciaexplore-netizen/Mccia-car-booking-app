import type { Coords } from './places'

export type RideStatus = 'requested' | 'held' | 'approved' | 'accepted' | 'started' | 'completed' | 'cancelled' | 'declined'
export type Stop = { label: string; coords?: Coords | null }

export type Ride = {
  id: string; status: RideStatus
  pickup: string; destination: string; pickupCoords: Coords | null; destinationCoords: Coords | null
  stops?: Stop[]
  tripType: 'now' | 'scheduled' | 'multiday'; startAt?: string | null; endAt?: string | null
  passengers: number; tripMin: number; createdAt: string; approvedAt?: string | null
  holdNote?: string; cancelReason?: string; cancelledBy?: string
  vehicle: string; plate: string; carSeats?: number
  driverId: string; driverName: string; driverPhone: string
  otp?: string; arrivalMin: number | null; startedAt: string | null; acceptedAt?: string | null
  riderName?: string
  window?: { start: string; end: string } | null
  driverLive: { lat: number; lon: number; speedKmh: number; state: 'moving' | 'stopped' | 'offline'; stoppedForSec: number; ageSec: number } | null
}

export const STATUS_LABEL: Record<RideStatus, [string, string]> = {
  requested: ['Waiting for approval', 'warn'], held: ['On hold', 'warn'], approved: ['Approved', 'green'],
  accepted: ['Driver on the way', ''], started: ['Trip in progress', 'green'],
  completed: ['Completed', 'green'], cancelled: ['Cancelled', 'grey'], declined: ['Declined', 'red'],
}
export const isActive = (r: Ride) => ['requested', 'held', 'approved', 'accepted', 'started'].includes(r.status)
export const canCancel = (r: Ride) => ['requested', 'held', 'approved'].includes(r.status)

const fmt = (iso: string) => new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export function whenText(r: Pick<Ride, 'tripType' | 'startAt' | 'endAt'>): string {
  if (r.tripType === 'multiday' && r.startAt && r.endAt) return `${fmt(r.startAt)} to ${fmt(r.endAt)}`
  if (r.tripType === 'scheduled' && r.startAt) return fmt(r.startAt)
  return 'As soon as approved'
}
export const whenLabel = (r: Pick<Ride, 'tripType'>) => (r.tripType === 'multiday' ? 'Dates' : 'Pickup time')

export function routeText(r: Pick<Ride, 'pickup' | 'destination' | 'stops'>): string[] {
  return [r.pickup, ...(r.stops ?? []).map((s) => s.label), r.destination]
}

export const telHref = (phone: string) => `tel:${phone.replace(/[^+\d]/g, '')}`
