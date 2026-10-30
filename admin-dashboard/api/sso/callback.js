// Where the MCCIA App Hub sends a signed-in person: an auto-submitted form with one field, `token` (a 60-second signed JWT).
// A static site cannot take a POST, so this small function does: it hands the hub's token to the backend (POST /auth/sso/callback),
// which checks it and answers with this app's own sign-in token, and then answers the browser with a page that stores that token
// where the app keeps it and opens the app. No token is ever put in an address. Anything wrong goes to /sso/callback?error=<code>,
// which says what happened and links back to the hub.
//
// Needs API_URL (or the app's VITE_API_URL) to reach the backend, e.g. https://your-backend.vercel.app/api
import { randomBytes } from 'node:crypto'

const APP = 'admin'
const TOKEN_KEY = 'mccia.adminToken'
const HUB_URL_KEY = 'mccia.hubUrl'

const toError = (res, code) => { res.statusCode = 303; res.setHeader('Location', `/sso/callback?error=${code}`); res.setHeader('Cache-Control', 'no-store'); res.end() }

async function formToken(req) {
  if (req.body && typeof req.body === 'object') return String(req.body.token ?? '')
  if (typeof req.body === 'string') return new URLSearchParams(req.body).get('token') ?? ''
  let raw = ''
  for await (const chunk of req) { raw += chunk; if (raw.length > 8192) return '' }
  return new URLSearchParams(raw).get('token') ?? ''
}

// A value placed inside the page's script: JSON, with "<" escaped so it can never close the script tag.
const inScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c')

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.statusCode = 303; res.setHeader('Location', '/'); res.end(); return }
  const api = (process.env.API_URL || process.env.VITE_API_URL || '').replace(/\/+$/, '')
  if (!api) { console.error('[sso] API_URL is not set'); return toError(res, 'config') }

  const token = await formToken(req)
  if (!token) return toError(res, 'invalid')

  let out
  try {
    const r = await fetch(`${api}/auth/sso/callback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, app: APP }), signal: AbortSignal.timeout(15000),
    })
    out = await r.json().catch(() => ({}))
    if (!r.ok) {
      console.warn('[sso] sign-in refused:', r.status, out.code ?? '') // the code only, never a token
      return toError(res, ['config', 'expired', 'no_access'].includes(out.code) ? out.code : r.status >= 500 ? 'unavailable' : 'invalid')
    }
  } catch {
    return toError(res, 'unavailable')
  }

  const nonce = randomBytes(16).toString('base64')
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`)
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Signing you in</title></head>
<body><p>Signing you in…</p>
<script nonce="${nonce}">try{localStorage.setItem(${inScript(TOKEN_KEY)},${inScript(out.token)});${out.hub_url ? `localStorage.setItem(${inScript(HUB_URL_KEY)},${inScript(out.hub_url)})` : `localStorage.removeItem(${inScript(HUB_URL_KEY)})`}}catch(e){}location.replace('/')</script>
</body></html>`)
}
