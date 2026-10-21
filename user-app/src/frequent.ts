// "Frequent" places for the From / To dropdowns: addresses the rider has used at least twice in their own rides
// (pickups, stops and destinations), most used first. Built from ride history, so it follows the rider across devices.
import type { Place } from './places'
import type { Ride } from './rides'

const MIN_USES = 2
const MAX_FREQUENT = 4

const keyOf = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')

export function frequentPlaces(rides: Ride[] | null): Place[] {
  const seen = new Map<string, { text: string; coords: Place['coords']; uses: number; last: number }>()
  for (const r of rides ?? []) {
    if (r.status === 'cancelled' && r.cancelledBy === 'rider') continue // changed their mind: not a real trip
    const at = new Date(r.createdAt).getTime() || 0
    const used = [{ label: r.pickup, coords: r.pickupCoords }, ...(r.stops ?? []), { label: r.destination, coords: r.destinationCoords }]
    for (const p of used) {
      const text = p.label?.trim()
      if (!text) continue
      const k = keyOf(text)
      const hit = seen.get(k)
      if (!hit) seen.set(k, { text, coords: p.coords ?? undefined, uses: 1, last: at })
      else {
        hit.uses++
        if (at > hit.last) { hit.last = at; hit.coords = p.coords ?? hit.coords }
      }
    }
  }
  return [...seen.values()]
    .filter((p) => p.uses >= MIN_USES)
    .sort((a, b) => b.uses - a.uses || b.last - a.last)
    .slice(0, MAX_FREQUENT)
    .map((p) => {
      // Stored as "Label, detail": split it back so the row reads like the other suggestions.
      const cut = p.text.indexOf(',')
      return {
        id: `frequent-${keyOf(p.text)}`, kind: 'place' as const,
        label: cut > 0 ? p.text.slice(0, cut).trim() : p.text,
        detail: cut > 0 ? p.text.slice(cut + 1).trim() : '',
        coords: p.coords,
      }
    })
}

export const samePlace = (a: Place, b: Place) => keyOf(a.detail ? `${a.label}, ${a.detail}` : a.label) === keyOf(b.detail ? `${b.label}, ${b.detail}` : b.label)
