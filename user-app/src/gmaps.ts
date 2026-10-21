// "View in Google Maps" links. Plain Google Maps URLs (no API key, no cost): on phones they open the Google Maps app,
// elsewhere maps.google.com in a new tab. Coordinates are used when we have them, otherwise the address text.
import type { Coords } from './places'

export type MapPoint = { label: string; coords?: Coords | null }

const at = (p: MapPoint) => encodeURIComponent(p.coords ? `${p.coords.lat},${p.coords.lon}` : p.label)
const usable = (p?: MapPoint | null): p is MapPoint => !!p && (!!p.coords || !!p.label.trim())

/** One place, shown as a pin. */
export const placeUrl = (p: MapPoint) => `https://www.google.com/maps/search/?api=1&query=${at(p)}`

/** Driving directions from the pickup, through any stops, to the destination. */
export function routeUrl(from: MapPoint, to: MapPoint, stops: MapPoint[] = []) {
  const via = stops.filter(usable)
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${at(from)}&destination=${at(to)}${via.length ? `&waypoints=${via.map(at).join('%7C')}` : ''}`
}

export { usable as hasPlace }
