// Reads a location out of a Google Maps link a rider pasted into From / To (Share -> Copy link).
// Full links carry the coordinates; short links (maps.app.goo.gl, goo.gl/maps) are followed - only to Google hosts,
// only a few hops, never fetching the final Google Maps page - until a full link appears.
import type { Coords } from './db'

export type MapLink = { coords: Coords | null; name: string | null }

const SHORT_HOSTS = /^(maps\.app\.goo\.gl|goo\.gl)$/i
const MAPS_HOST = /^((www\.)?google\.[a-z.]{2,6}|maps\.google\.[a-z.]{2,6})$/i
const MAX_HOPS = 5

const valid = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)
const pair = (text: string | null | undefined): Coords | null => {
  const m = (text ?? '').match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*\+?(-?\d{1,3}(?:\.\d+)?)\s*$/)
  return m && valid(+m[1], +m[2]) ? { lat: +m[1], lon: +m[2] } : null
}

function toUrl(raw: string): URL | null {
  try { return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) } catch { return null }
}

export const isMapsUrl = (u: URL) => (MAPS_HOST.test(u.hostname) && u.pathname.startsWith('/maps')) || /^maps\.google\./i.test(u.hostname)
const isShortUrl = (u: URL) => SHORT_HOSTS.test(u.hostname) && (u.hostname.toLowerCase() !== 'goo.gl' || u.pathname.startsWith('/maps'))

// Coordinates and place name from a full Google Maps URL. The !3d…!4d… pair is the place's own pin; @lat,lng is only
// where the map was centred, so it is the last resort.
export function parseMapsUrl(u: URL): MapLink {
  const text = decodeURIComponent(u.href)
  const pin = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  const q = u.searchParams.get('q') ?? u.searchParams.get('query') ?? u.searchParams.get('destination') ?? u.searchParams.get('daddr')
  const ll = u.searchParams.get('ll') ?? u.searchParams.get('center')
  const inPath = decodeURIComponent(u.pathname).match(/\/maps\/(?:place|search|dir\/[^/]*)\/([^/]+)/)
  const at = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  const coords = (pin && valid(+pin[1], +pin[2]) ? { lat: +pin[1], lon: +pin[2] } : null)
    ?? pair(q) ?? pair(ll) ?? pair(inPath?.[1]?.replace(/\+/g, ' '))
    ?? (at && valid(+at[1], +at[2]) ? { lat: +at[1], lon: +at[2] } : null)
  const placeName = decodeURIComponent(u.pathname).match(/\/maps\/place\/([^/@]+)/)?.[1]
  const rawName = (placeName ?? (q && !pair(q) ? q : null))?.replace(/\+/g, ' ').trim() || null
  return { coords, name: rawName && !pair(rawName) ? rawName.slice(0, 200) : null }
}

export async function resolveMapLink(raw: string): Promise<{ ok: true; value: MapLink } | { ok: false; error: string }> {
  let u = toUrl(String(raw ?? '').trim().slice(0, 2000))
  if (!u) return { ok: false, error: 'That is not a link.' }
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (isMapsUrl(u)) {
      const found = parseMapsUrl(u)
      return found.coords || found.name ? { ok: true, value: found } : { ok: false, error: 'This Google Maps link has no location in it. Open the place in Google Maps, tap Share, then Copy link.' }
    }
    if (!isShortUrl(u) || hop === MAX_HOPS) break
    try {
      const res = await fetch(u.href, { redirect: 'manual', signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'Mozilla/5.0 (MCCIA Cabs link reader)' } })
      const next = res.headers.get('location')
      if (!next) return { ok: false, error: 'This Google Maps link did not lead anywhere. It may have expired.' }
      let nu = toUrl(new URL(next, u).href)
      // Google's cookie-consent page wraps the real address in ?continue=
      if (nu && /^consent\.google\./i.test(nu.hostname) && nu.searchParams.get('continue')) nu = toUrl(nu.searchParams.get('continue') as string)
      if (!nu || !(isMapsUrl(nu) || isShortUrl(nu))) break
      u = nu
    } catch { return { ok: false, error: 'Could not open this Google Maps link right now. Try again, or search for the place instead.' } }
  }
  return { ok: false, error: 'Only Google Maps links can be used here.' }
}
