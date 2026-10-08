// Road route between two points, used for the blue route lines. Geoapify first, then the public OSRM server, then a straight line.
import { GEOAPIFY_KEY } from './geo'
import type { LL } from './mapAdapter'

const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError'

export async function fetchPath(a: LL, b: LL, signal?: AbortSignal): Promise<LL[]> {
  if (GEOAPIFY_KEY) {
    try {
      const res = await fetch(`https://api.geoapify.com/v1/routing?waypoints=${a.lat},${a.lng}|${b.lat},${b.lng}&mode=drive&apiKey=${GEOAPIFY_KEY}`, { signal })
      const g = (await res.json()).features?.[0]?.geometry
      if (g) {
        const lines: [number, number][][] = g.type === 'MultiLineString' ? g.coordinates : [g.coordinates]
        const path = lines.flat().map(([lng, lat]) => ({ lat, lng }))
        if (path.length > 1) return path
      }
    } catch (e) { if (isAbort(e)) throw e }
  }
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`, { signal })
    const coords: [number, number][] | undefined = (await res.json()).routes?.[0]?.geometry?.coordinates
    if (coords?.length) return coords.map(([lng, lat]) => ({ lat, lng }))
  } catch (e) { if (isAbort(e)) throw e }
  return [a, b]
}
