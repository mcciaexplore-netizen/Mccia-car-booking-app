// Turn-by-turn navigation helpers: fetch a road route with steps, describe each maneuver, and measure progress.
import { GEOAPIFY_KEY } from './geo'
import type { LL } from './mapAdapter'

export type Step = { type: string; modifier: string; name: string; location: LL; distance: number; duration: number; exit: number | null; text?: string }
export type Route = { path: LL[]; steps: Step[]; distance: number; duration: number }

const RAD = Math.PI / 180

export function metres(a: LL, b: LL) {
  const h = Math.sin(((b.lat - a.lat) * RAD) / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(((b.lng - a.lng) * RAD) / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

export function bearing(a: LL, b: LL) {
  const y = Math.sin((b.lng - a.lng) * RAD) * Math.cos(b.lat * RAD)
  const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lng - a.lng) * RAD)
  return ((Math.atan2(y, x) / RAD) + 360) % 360
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
export const compass = (deg: number) => COMPASS[Math.round(deg / 45) % 8]

// Geoapify turn-by-turn routing (OpenStreetMap roads). Each step has ready-made English wording and the index in the
// route line where the maneuver happens.
type GeoStep = { from_index: number; distance: number; time: number; instruction?: { text?: string; type?: string; streets?: string[] } }
function geoapifyStep(type: string): { type: string; modifier: string } {
  if (type.startsWith('Destination')) return { type: 'arrive', modifier: '' }
  if (type.startsWith('Start')) return { type: 'depart', modifier: '' }
  if (type.startsWith('UTurn')) return { type: 'turn', modifier: 'uturn' }
  const turns: Record<string, string> = { SharpRight: 'sharp right', Right: 'right', SlightRight: 'slight right', SharpLeft: 'sharp left', Left: 'left', SlightLeft: 'slight left' }
  if (turns[type]) return { type: 'turn', modifier: turns[type] }
  if (type.startsWith('Roundabout')) return { type: 'roundabout', modifier: '' }
  if (type.startsWith('Exit') || type.startsWith('Ramp')) return { type: type.startsWith('Exit') ? 'off ramp' : 'on ramp', modifier: type.endsWith('Left') ? 'left' : type.endsWith('Right') ? 'right' : 'straight' }
  if (type === 'Merge') return { type: 'merge', modifier: 'straight' }
  return { type: 'continue', modifier: type.endsWith('Left') ? 'slight left' : type.endsWith('Right') ? 'slight right' : 'straight' }
}

async function geoapifyRoute(from: LL, to: LL, signal?: AbortSignal): Promise<Route | null> {
  if (!GEOAPIFY_KEY) return null
  try {
    const url = `https://api.geoapify.com/v1/routing?waypoints=${from.lat},${from.lng}|${to.lat},${to.lng}&mode=drive&details=instruction_details&apiKey=${GEOAPIFY_KEY}`
    const feature = (await (await fetch(url, { signal })).json()).features?.[0]
    if (!feature) return null
    const lines: [number, number][][] = feature.geometry.type === 'MultiLineString' ? feature.geometry.coordinates : [feature.geometry.coordinates]
    const path: LL[] = lines.flat().map(([lng, lat]) => ({ lat, lng }))
    const steps: Step[] = ((feature.properties.legs?.[0]?.steps ?? []) as GeoStep[]).map((s) => {
      const kind = geoapifyStep(s.instruction?.type ?? '')
      return {
        ...kind,
        name: s.instruction?.streets?.[0] ?? '',
        location: path[Math.min(s.from_index, path.length - 1)],
        distance: s.distance,
        duration: s.time,
        exit: null,
        text: s.instruction?.text,
      }
    })
    return { path, steps, distance: feature.properties.distance, duration: feature.properties.time }
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    return null
  }
}

// Geoapify first, then the public OSRM demo server. Returns null when neither can be reached.
export async function fetchRoute(from: LL, to: LL, signal?: AbortSignal): Promise<Route | null> {
  return (await geoapifyRoute(from, to, signal)) ?? osrmRoute(from, to, signal)
}

async function osrmRoute(from: LL, to: LL, signal?: AbortSignal): Promise<Route | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`
    const data = await (await fetch(url, { signal })).json()
    const route = data.routes?.[0]
    if (!route) return null
    const steps: Step[] = (route.legs?.[0]?.steps ?? []).map((s: { maneuver: { type: string; modifier?: string; location: [number, number]; exit?: number }; name?: string; distance: number; duration: number }) => ({
      type: s.maneuver.type,
      modifier: s.maneuver.modifier ?? '',
      name: s.name ?? '',
      location: { lat: s.maneuver.location[1], lng: s.maneuver.location[0] },
      distance: s.distance,
      duration: s.duration,
      exit: s.maneuver.exit ?? null,
    }))
    return {
      path: route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng })),
      steps,
      distance: route.distance,
      duration: route.duration,
    }
  } catch { return null }
}

// "Turn right onto MG Road", "Keep left at the fork", "Arrive at your destination"...
export function instruction(step: Step, arriveLabel: string, headingDeg?: number) {
  if (step.text) return step.text.replace(/\.$/, '').replace(/^Your destination is/, 'Your destination is')
  const road = step.name ? ` onto ${step.name}` : ''
  const onRoad = step.name ? ` on ${step.name}` : ''
  const side = step.modifier.replace('slight ', '').replace('sharp ', '')
  const strength = step.modifier.startsWith('slight') ? 'Bear' : step.modifier.startsWith('sharp') ? 'Sharp' : 'Turn'
  switch (step.type) {
    case 'depart': return `Head ${headingDeg === undefined ? 'out' : compass(headingDeg)}${onRoad}`
    case 'arrive': return `Arrive at ${arriveLabel}`
    case 'turn': return step.modifier === 'straight' ? `Continue straight${onRoad}` : step.modifier === 'uturn' ? 'Make a U-turn' : `${strength} ${side}${road}`
    case 'end of road': return `Turn ${side || 'ahead'}${road}`
    case 'fork': return `Keep ${side || 'straight'} at the fork${road}`
    case 'merge': return `Merge ${side || 'ahead'}${road}`
    case 'on ramp': return `Take the ramp${road}`
    case 'off ramp': return `Take the exit${road}`
    case 'roundabout': case 'rotary': case 'roundabout turn': return step.exit ? `At the roundabout take exit ${step.exit}${road}` : `Enter the roundabout${road}`
    case 'new name': case 'continue': return step.modifier && step.modifier !== 'straight' ? `Continue ${side}${onRoad}` : `Continue straight${onRoad}`
    default: return `Continue${onRoad}`
  }
}

export type ArrowKind = 'straight' | 'slight-left' | 'slight-right' | 'left' | 'right' | 'sharp-left' | 'sharp-right' | 'uturn' | 'arrive'
export function arrowFor(step: Step): ArrowKind {
  if (step.type === 'arrive') return 'arrive'
  const m = step.modifier
  if (m === 'uturn') return 'uturn'
  if (m === 'sharp left') return 'sharp-left'
  if (m === 'sharp right') return 'sharp-right'
  if (m === 'slight left') return 'slight-left'
  if (m === 'slight right') return 'slight-right'
  if (m === 'left') return 'left'
  if (m === 'right') return 'right'
  return 'straight'
}

export const formatDistance = (m: number) => (m < 950 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`)

// Distance from the driver to the closest point of the route (vertices are dense, so vertex distance is accurate enough).
export function distanceToRoute(pos: LL, path: LL[]) {
  let best = Infinity
  for (const p of path) { const d = metres(pos, p); if (d < best) best = d }
  return best
}

export function nearestIndex(pos: LL, path: LL[], from = 0) {
  let best = from
  let bestD = Infinity
  for (let i = from; i < path.length; i++) { const d = metres(pos, path[i]); if (d < bestD) { bestD = d; best = i } }
  return best
}
