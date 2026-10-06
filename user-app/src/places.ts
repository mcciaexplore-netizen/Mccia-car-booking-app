// Place search for the "From" / "To" fields. Provider is picked by which key is set:
// - VITE_OLA_MAPS_API_KEY: Ola Maps (India) autocomplete, place details, reverse geocoding
// - VITE_GOOGLE_MAPS_API_KEY: Google Places (New) + Geocoding
// - VITE_GEOAPIFY_API_KEY: Geoapify autocomplete (free tier, OpenStreetMap-based)
// - neither: Photon (https://photon.komoot.io), free and key-less
export type Coords = { lat: number; lon: number }
export type Place = { id: string; label: string; detail: string; coords?: Coords; placeId?: string; kind: 'place' | 'address' }

const OLA_KEY = import.meta.env.VITE_OLA_MAPS_API_KEY as string | undefined
const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
const GEOAPIFY_KEY = import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined
export const PROVIDER: 'ola' | 'google' | 'geoapify' | 'photon' = OLA_KEY ? 'ola' : GOOGLE_KEY ? 'google' : GEOAPIFY_KEY ? 'geoapify' : 'photon'
export const ATTRIBUTION = { ola: 'Search by Ola Maps', google: 'Powered by Google', geoapify: 'Search by Geoapify · © OpenStreetMap', photon: 'Search by OpenStreetMap · Photon' }[PROVIDER]

const PHOTON = 'https://photon.komoot.io'
// Austin, TX: the service area. Used to rank nearby results first when we don't know where the rider is.
export const AUSTIN: Coords = { lat: 30.2672, lon: -97.7431 }

export const newSessionToken = () => crypto.randomUUID()

/* ---------- Ola Maps ---------- */
const OLA = 'https://api.olamaps.io/places/v1'
type OlaPrediction = { place_id: string; description?: string; structured_formatting?: { main_text?: string; secondary_text?: string }; types?: string[]; geometry?: { location?: { lat: number; lng: number } } }

async function olaSearch(query: string, bias: Coords | undefined, signal?: AbortSignal): Promise<Place[]> {
  const loc = bias ? `&location=${bias.lat},${bias.lon}` : ''
  const res = await fetch(`${OLA}/autocomplete?input=${encodeURIComponent(query)}${loc}&api_key=${OLA_KEY}`, { signal })
  if (!res.ok) throw new Error(`Ola Maps ${res.status}`)
  const data: { predictions?: OlaPrediction[] } = await res.json()
  return (data.predictions ?? []).slice(0, 6).map((p) => ({
    id: p.place_id, placeId: p.place_id,
    label: p.structured_formatting?.main_text ?? p.description ?? '',
    detail: p.structured_formatting?.secondary_text ?? '',
    coords: p.geometry?.location ? { lat: p.geometry.location.lat, lon: p.geometry.location.lng } : undefined,
    kind: p.types?.some((t) => ['street_address', 'route', 'premise'].includes(t)) ? 'address' : 'place',
  }) as Place)
}

async function olaDetails(place: Place): Promise<Place> {
  const res = await fetch(`${OLA}/details?place_id=${encodeURIComponent(place.placeId!)}&api_key=${OLA_KEY}`)
  if (!res.ok) return place
  const d: { result?: { name?: string; formatted_address?: string; geometry?: { location?: { lat: number; lng: number } } } } = await res.json()
  const r = d.result
  const loc = r?.geometry?.location
  return {
    ...place,
    detail: r?.formatted_address ?? place.detail,
    coords: loc ? { lat: loc.lat, lon: loc.lng } : undefined,
  }
}

async function olaReverse({ lat, lon }: Coords): Promise<Place | null> {
  const res = await fetch(`${OLA}/reverse-geocode?latlng=${lat},${lon}&api_key=${OLA_KEY}`)
  if (!res.ok) return null
  const d: { results?: { formatted_address?: string; place_id?: string }[] } = await res.json()
  const r = d.results?.[0]
  return r?.formatted_address ? { id: r.place_id ?? `${lat},${lon}`, label: r.formatted_address, detail: '', coords: { lat, lon }, kind: 'address' } : null
}

/* ---------- Google ---------- */
type GPrediction = {
  placePrediction?: {
    placeId: string
    text?: { text: string }
    structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }
    types?: string[]
  }
}

async function googleSearch(query: string, bias: Coords, token: string, signal?: AbortSignal): Promise<Place[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_KEY! },
    body: JSON.stringify({
      input: query,
      sessionToken: token,
      locationBias: { circle: { center: { latitude: bias.lat, longitude: bias.lon }, radius: 50000 } },
    }),
  })
  if (!res.ok) throw new Error(`Google Places ${res.status}`)
  const data: { suggestions?: GPrediction[] } = await res.json()
  return (data.suggestions ?? []).flatMap((s) => {
    const p = s.placePrediction
    if (!p) return []
    const main = p.structuredFormat?.mainText?.text ?? p.text?.text ?? ''
    const isAddress = p.types?.some((t) => ['street_address', 'route', 'premise', 'subpremise'].includes(t))
    return [{ id: p.placeId, placeId: p.placeId, label: main, detail: p.structuredFormat?.secondaryText?.text ?? '', kind: isAddress ? 'address' : 'place' } as Place]
  })
}

/** Resolves a Google prediction to its exact formatted address and coordinates (ends the billing session). */
export async function resolvePlace(place: Place, token: string): Promise<Place> {
  if (!place.placeId || place.coords) return place
  if (PROVIDER === 'ola') return olaDetails(place)
  if (!GOOGLE_KEY) return place
  const res = await fetch(`https://places.googleapis.com/v1/places/${place.placeId}?sessionToken=${token}`, {
    headers: { 'X-Goog-Api-Key': GOOGLE_KEY, 'X-Goog-FieldMask': 'displayName,formattedAddress,location' },
  })
  if (!res.ok) return place
  const d: { displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number } } = await res.json()
  return {
    ...place,
    label: d.displayName?.text ?? place.label,
    detail: d.formattedAddress ?? place.detail,
    coords: d.location ? { lat: d.location.latitude, lon: d.location.longitude } : undefined,
  }
}

async function googleReverse({ lat, lon }: Coords): Promise<Place | null> {
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${GOOGLE_KEY}`)
  if (!res.ok) return null
  const d: { results?: { formatted_address: string; place_id: string }[] } = await res.json()
  const r = d.results?.[0]
  return r ? { id: r.place_id, label: r.formatted_address, detail: '', coords: { lat, lon }, kind: 'address' } : null
}

/* ---------- Geoapify ---------- */
type GeoFeature = { properties: { formatted?: string; address_line1?: string; address_line2?: string; lat: number; lon: number; place_id?: string; result_type?: string } }

function geoToPlace(f: GeoFeature): Place {
  const p = f.properties
  return {
    id: p.place_id ?? `${p.lat},${p.lon}`,
    label: p.address_line1 ?? p.formatted ?? 'Unnamed place',
    detail: p.address_line2 ?? '',
    coords: { lat: p.lat, lon: p.lon },
    kind: ['building', 'amenity'].includes(p.result_type ?? '') ? 'place' : 'address',
  }
}

async function geoapifySearch(query: string, bias: Coords, signal?: AbortSignal): Promise<Place[]> {
  const url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(query)}&bias=proximity:${bias.lon},${bias.lat}&limit=6&lang=en&apiKey=${GEOAPIFY_KEY}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Geoapify ${res.status}`)
  const data: { features: GeoFeature[] } = await res.json()
  return data.features.map(geoToPlace)
}

async function geoapifyReverse({ lat, lon }: Coords): Promise<Place | null> {
  const res = await fetch(`https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&lang=en&apiKey=${GEOAPIFY_KEY}`)
  if (!res.ok) return null
  const data: { features: GeoFeature[] } = await res.json()
  return data.features[0] ? geoToPlace(data.features[0]) : null
}

/* ---------- Photon ---------- */
type Feature = { properties: Record<string, string | undefined>; geometry: { coordinates: [number, number] } }

function toPlace(f: Feature): Place {
  const p = f.properties
  const street = [p.housenumber, p.street].filter(Boolean).join(' ')
  const label = p.name ?? (street || p.city || p.state || 'Unnamed place')
  const detail = [p.name ? street : '', p.locality ?? p.district, p.city, p.state, p.postcode].filter((x, i, a) => x && a.indexOf(x) === i).join(', ')
  return {
    id: `${p.osm_type}${p.osm_id}`,
    label, detail,
    coords: { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] },
    kind: p.name ? 'place' : 'address',
  }
}

async function photonSearch(query: string, bias: Coords, local: boolean, signal?: AbortSignal): Promise<Place[]> {
  // When we know where the rider really is, keep results within ~50 km so far-away namesakes never show up.
  const d = 0.45
  const box = local ? `&bbox=${bias.lon - d},${bias.lat - d},${bias.lon + d},${bias.lat + d}` : ''
  const res = await fetch(`${PHOTON}/api/?q=${encodeURIComponent(query)}&limit=6&lang=en&lat=${bias.lat}&lon=${bias.lon}${box}`, { signal })
  if (!res.ok) throw new Error('search failed')
  const data: { features: Feature[] } = await res.json()
  const seen = new Set<string>()
  return data.features.map(toPlace).filter((p) => {
    const key = `${p.label}|${p.detail}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function photonReverse({ lat, lon }: Coords): Promise<Place | null> {
  const res = await fetch(`${PHOTON}/reverse?lat=${lat}&lon=${lon}&lang=en`)
  if (!res.ok) return null
  const data: { features: Feature[] } = await res.json()
  return data.features[0] ? toPlace(data.features[0]) : null
}

/* ---------- Public API ---------- */
export function searchPlaces(query: string, bias?: Coords, token = '', signal?: AbortSignal): Promise<Place[]> {
  if (PROVIDER === 'ola') return olaSearch(query, bias, signal)
  const local = !!bias
  bias ??= AUSTIN
  if (PROVIDER === 'google') return googleSearch(query, bias, token, signal)
  if (PROVIDER === 'geoapify') return geoapifySearch(query, bias, signal)
  return photonSearch(query, bias, local, signal)
}

export async function reverseGeocode(coords: Coords): Promise<Place | null> {
  if (PROVIDER === 'ola') return (await olaReverse(coords)) ?? photonReverse(coords)
  if (PROVIDER === 'google') return (await googleReverse(coords)) ?? photonReverse(coords)
  if (PROVIDER === 'geoapify') return (await geoapifyReverse(coords)) ?? photonReverse(coords)
  return photonReverse(coords)
}
