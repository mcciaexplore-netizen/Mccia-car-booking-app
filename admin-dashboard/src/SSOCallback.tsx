import { AlertCircle, ChevronLeft } from 'lucide-react'
import { getHubUrl } from './api'

const HUB = getHubUrl() ?? ((import.meta.env.VITE_HUB_URL as string | undefined) || 'https://mccia-apphub.vercel.app')

// What api/sso/callback.js reports when a sign-in from the App Hub did not go through.
const MESSAGES: Record<string, string> = {
  expired: 'The sign-in link from the App Hub expired. Open the app from the App Hub again.',
  no_access: 'Your App Hub account does not have access to this. Ask your administrator.',
  config: 'Sign-in through the App Hub is not set up yet. Tell your administrator.',
  unavailable: 'The server could not be reached. Try again in a minute.',
  invalid: 'The sign-in from the App Hub was not valid. Open the app from the App Hub again.',
}

/** /sso/callback: the sign-in itself happens in api/sso/callback.js; this page only shows why one failed, with the way back to the hub. */
export default function SSOCallback() {
  const code = new URLSearchParams(window.location.search).get('error')
  if (!code) { window.location.replace('/'); return null }
  return (
    <main className="sso-page">
      <div className="card sso-card" role="alert">
        <h1>Could not sign you in</h1>
        <p><AlertCircle size={16} aria-hidden="true" /> {MESSAGES[code] ?? MESSAGES.invalid}</p>
        <a className="btn btn-primary" href={HUB}><ChevronLeft size={16} aria-hidden="true" /> Back to App Hub</a>
        <a className="sso-alt" href="/">Sign in with a password instead</a>
      </div>
    </main>
  )
}
