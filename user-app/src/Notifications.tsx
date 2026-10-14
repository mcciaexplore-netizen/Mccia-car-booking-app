// Polls the rider's notifications and shows each unread one as a modal pop-up, one at a time.
import { useCallback, useEffect, useRef, useState } from 'react'
import { BellRing, CheckCircle2, PauseCircle, Phone, X, XCircle } from 'lucide-react'
import { api } from './api'
import AllocationTable from './AllocationTable'
import { telHref } from './rides'

export type RiderNotification = {
  id: string; rideId: string; kind: 'approved' | 'held' | 'cancelled' | 'reminder'
  title: string; message: string; createdAt: string; read: boolean
  data?: { rows?: [string, string][]; phone?: string; driver?: string }
}

const ASKED_KEY = 'mccia.notifAsked'

function osNotify(n: RiderNotification) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification(n.title, { body: n.message, tag: n.id })
  } catch { /* some mobile browsers only allow service-worker notifications */ }
}

export default function Notifications({ onViewRide }: { onViewRide: (rideId: string) => void }) {
  const [queue, setQueue] = useState<RiderNotification[]>([])
  const seen = useRef(new Set<string>())
  const dialog = useRef<HTMLDivElement>(null)
  const current = queue[0]
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(() => ('Notification' in window ? Notification.permission : 'unsupported'))
  const [promptDismissed, setPromptDismissed] = useState(() => { try { return localStorage.getItem(ASKED_KEY) === '1' } catch { return false } })

  useEffect(() => {
    let alive = true
    async function poll() {
      if (document.hidden) return
      try {
        const list = await api<RiderNotification[]>('/rider/notifications')
        if (!alive) return
        const fresh = list.filter((n) => !n.read && !seen.current.has(n.id)).reverse() // oldest first
        if (fresh.length === 0) return
        fresh.forEach((n) => { seen.current.add(n.id); osNotify(n) })
        setQueue((q) => [...q, ...fresh])
      } catch { /* retry on next tick */ }
    }
    void poll()
    const timer = setInterval(poll, 4000)
    document.addEventListener('visibilitychange', poll)
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', poll) }
  }, [])

  const dismiss = useCallback((then?: (n: RiderNotification) => void) => {
    if (!current) return
    void api('/rider/notifications/read', { body: { ids: [current.id] } }).catch(() => undefined)
    setQueue((q) => q.slice(1))
    then?.(current)
  }, [current])

  useEffect(() => {
    if (!current) return
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') dismiss() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.() }
  }, [current, dismiss])

  function skipPrompt() {
    setPromptDismissed(true)
    try { localStorage.setItem(ASKED_KEY, '1') } catch { /* storage unavailable */ }
  }
  async function askPermission() {
    try { setPerm(await Notification.requestPermission()) } catch { /* ignore */ }
    skipPrompt()
  }

  const Icon = current?.kind === 'approved' ? CheckCircle2 : current?.kind === 'held' ? PauseCircle : current?.kind === 'cancelled' ? XCircle : BellRing
  const primary = current?.kind === 'approved' || (current?.kind === 'reminder' && !!current.data?.phone)

  return (
    <>
      {perm === 'default' && !promptDismissed && (
        <div className="notif-prompt" role="region" aria-label="Enable notifications">
          <BellRing size={16} /><span>Get alerts when your request is approved?</span>
          <button type="button" className="link-btn" onClick={askPermission}>Enable</button>
          <button type="button" className="loc-clear" aria-label="Not now" onClick={skipPrompt}><X size={13} /></button>
        </div>
      )}
      {current && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) dismiss() }}>
          <div className={`modal ${current.kind}`} role="dialog" aria-modal="true" aria-labelledby="notif-title" ref={dialog}>
            <span className="modal-icon"><Icon size={26} /></span>
            <h2 id="notif-title">{current.title}</h2>
            <p className="modal-msg">{current.message}</p>
            {current.kind === 'approved' && current.data?.rows && <AllocationTable rows={current.data.rows} label="Your allocation" />}
            {queue.length > 1 && <small className="hint">{queue.length - 1} more notification{queue.length > 2 ? 's' : ''} waiting</small>}
            <div className="modal-actions">
              {current.kind === 'approved' && <button type="button" data-autofocus className="btn btn-primary" onClick={() => dismiss((n) => onViewRide(n.rideId))}>View ride</button>}
              {current.kind === 'reminder' && current.data?.phone && <a className="btn btn-primary" data-autofocus href={telHref(current.data.phone)} onClick={() => dismiss()}><Phone size={16} /> Call driver</a>}
              <button type="button" className="btn btn-ghost" data-autofocus={primary ? undefined : ''} onClick={() => dismiss()}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
