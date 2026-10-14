// MCCIA offices offered as quick-pick addresses in the From / To dropdown.
// Coordinates are approximate (so the map and route work without a lookup); adjust them if a pin looks off.
import type { Place } from './places'

export const MCCIA_OFFICES: Place[] = [
  { id: 'office-hadapsar', kind: 'place', label: 'Hadapsar', detail: 'Plot No. 7, A, Hadapsar Industrial Estate-2, 3, Hadapsar Industrial Estate, Hadapsar, Pune, Maharashtra 411013', coords: { lat: 18.5005, lon: 73.9387 } },
  { id: 'office-tilak-road', kind: 'place', label: 'Tilak Road Office', detail: '1014, Shukrawar Peth, Tilak Road, Pune - 411002, Maharashtra, India', coords: { lat: 18.5072, lon: 73.8574 } },
  { id: 'office-bhosari', kind: 'place', label: 'Bhosari Office', detail: 'J-462, MIDC, TELCO Road, Ganesh Nagar, Bhosari, Pune - 411026, Maharashtra, India', coords: { lat: 18.6419, lon: 73.8473 } },
  { id: 'office-ahmednagar', kind: 'place', label: 'Ahmednagar', detail: 'MCCIA Building, Plot No. P 86, MIDC, Ahmednagar - 414111, Maharashtra, India', coords: { lat: 19.1383, lon: 74.7561 } },
  { id: 'office-autocluster', kind: 'place', label: 'Autocluster', detail: 'H-Block, Plot No. C-181, Chinchwad East, Mumbai Pune Road, MIDC, Chinchwad, Pimpri-Chinchwad, Pune, Maharashtra 411019', coords: { lat: 18.6384, lon: 73.8081 } },
  { id: 'office-senapati-bapat', kind: 'place', label: 'Senapati Bapat Road', detail: '505, A-Wing, MCCIA Trade Tower, ICC Complex, 403, Senapati Bapat Road, Pune - 411016, India', coords: { lat: 18.5319, lon: 73.8302 } },
]
