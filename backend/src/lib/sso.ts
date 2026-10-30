// Sign-in from the MCCIA App Hub. The hub signs a 60-second EdDSA (Ed25519) JWT with iss "mccia-app-hub" and aud = the app's
// slug in the hub, and posts it to the app's callback (user-app/api/sso/callback.js, admin-dashboard/api/sso/callback.js), which
// hands it to POST /auth/sso/callback here. This app holds only the hub's PUBLIC key, so it can check tokens but never make one.
//
// HUB_SSO_PUBLIC_KEY   the hub's sso-public.b64 as-is (base64 of an SPKI PEM). A plain PEM also works.
// SSO_AUDIENCE_RIDER   the rider app's slug in the hub
// SSO_AUDIENCE_ADMIN   the admin dashboard's slug in the hub
import { importSPKI, jwtVerify, type CryptoKey } from 'jose'

export type SsoApp = 'rider' | 'admin'
export type HubIdentity = { email: string; name: string; hubRole: string; hubUrl: string | null }
export class SsoError extends Error {
  constructor(readonly code: 'config' | 'invalid' | 'expired', message: string) { super(message) }
}

const ISSUER = 'mccia-app-hub'
let keyCache: { raw: string; key: CryptoKey } | null = null

async function hubKey(): Promise<CryptoKey> {
  const raw = (process.env.HUB_SSO_PUBLIC_KEY ?? '').trim()
  if (!raw) throw new SsoError('config', 'HUB_SSO_PUBLIC_KEY is not set.')
  if (keyCache?.raw !== raw) {
    try {
      const pem = raw.includes('-----BEGIN') ? raw.replace(/\\n/g, '\n') : Buffer.from(raw, 'base64').toString('utf8')
      keyCache = { raw, key: await importSPKI(pem, 'EdDSA') }
    } catch { throw new SsoError('config', 'HUB_SSO_PUBLIC_KEY is not an Ed25519 public key.') }
  }
  return keyCache.key
}

const audienceFor = (app: SsoApp) => (app === 'admin' ? process.env.SSO_AUDIENCE_ADMIN : process.env.SSO_AUDIENCE_RIDER)?.trim()

// The hub's address from the token, for the "‹ App Hub" link: an http(s) address only, never javascript: or the like.
function hubUrlOf(v: unknown): string | null {
  try {
    const u = new URL(String(v ?? ''))
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href.replace(/\/+$/, '') : null
  } catch { return null }
}

/** Checks the signature (EdDSA only), issuer, audience (this app's slug) and expiry, and returns who it is. The message never holds the token. */
export async function verifyHubToken(token: string, app: SsoApp): Promise<HubIdentity> {
  const audience = audienceFor(app)
  if (!audience) throw new SsoError('config', `${app === 'admin' ? 'SSO_AUDIENCE_ADMIN' : 'SSO_AUDIENCE_RIDER'} is not set.`)
  const key = await hubKey()
  if (!token || token.length > 4096) throw new SsoError('invalid', 'No sign-in token was sent.')
  let payload
  try {
    ({ payload } = await jwtVerify(token, key, { algorithms: ['EdDSA'], issuer: ISSUER, audience, requiredClaims: ['exp', 'sub'], clockTolerance: 5 }))
  } catch (e) {
    throw new SsoError((e as { code?: string }).code === 'ERR_JWT_EXPIRED' ? 'expired' : 'invalid', 'The sign-in token is not valid.')
  }
  const email = String(payload.email ?? '').trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new SsoError('invalid', 'The sign-in token has no email.')
  return { email, name: String(payload.name ?? '').trim() || email, hubRole: String(payload.role ?? ''), hubUrl: hubUrlOf(payload.hub_url) }
}
