// Small geography helpers shared by the map screens.
// Default stack is key-free: OpenFreeMap tiles, public OSRM routing, Photon (OpenStreetMap) address search.
// To use Geoapify instead, set VITE_GEOAPIFY_API_KEY and VITE_FREE_MAPS=false.
const FREE_ONLY = (import.meta.env.VITE_FREE_MAPS as string | undefined) !== 'false'
export const GEOAPIFY_KEY = FREE_ONLY ? undefined : (import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined)
export const PUNE = { lat: 18.5204, lng: 73.8567 }

export const metresBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = Math.PI / 180
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}
