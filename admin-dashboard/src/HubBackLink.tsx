import { ChevronLeft } from 'lucide-react'
import { getHubUrl } from './api'

/** "‹ App Hub", back to the MCCIA App Hub: shown only to people who came in through it. */
export default function HubBackLink() {
  const hub = getHubUrl()
  return hub ? <a className="hub-back" href={hub}><ChevronLeft size={14} aria-hidden="true" /> App Hub</a> : null
}
