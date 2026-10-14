import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Phone, X } from 'lucide-react'
import { api, type Notice } from './api'

function alertUser(n: Notice) {
  try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(n.title, { body: n.message, tag: n.id }) } catch { /* best effort */ }
  if (n.kind !== 'reminder') return
  try { navigator.vibrate?.([300, 150, 300]) } catch { /* best effort */ }
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    if (ctx.state === 'suspended') { void ctx.close(); return } // autoplay blocked: stay silent
    const o = ctx.createOscillator(); const g = ctx.createGain()
    o.frequency.value = 880; g.gain.value = 0.15
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.4)
    o.onended = () => { void ctx.close() }
  } catch { /* best effort */ }
}

/** Polls notifications; returns the current pop-up (head of the queue) and a dismiss function. */
export function useNotices(enabled: boolean) {
  const [queue, setQueue] = useState<Notice[]>([])
  const seen = useRef(new Set<string>())

  useEffect(() => {
    if (!enabled) return
    let stop = false
    const poll = async () => {
      try {
        const list = await api<Notice[]>('/driver/notifications')
        const fresh = list.filter((n) => !n.read && !seen.current.has(n.id)).reverse()
        if (stop || !fresh.length) return
        fresh.forEach((n) => { seen.current.add(n.id); alertUser(n) })
        setQueue((q) => [...q, ...fresh])
      } catch { /* retry next tick */ }
    }
    const first = setTimeout(poll, 0)
    const t = setInterval(poll, 4000)
    return () => { stop = true; clearTimeout(first); clearInterval(t); setQueue([]); seen.current.clear() }
  }, [enabled])

  const dismiss = useCallback((id: string) => {
    setQueue((q) => q.filter((n) => n.id !== id))
    api('/driver/notifications/read', { body: { ids: [id] } }).catch(() => { seen.current.delete(id) })
  }, [])
  return { current: queue[0] ?? null, waiting: Math.max(0, queue.length - 1), dismiss }
}

export function NoticeModal({ notice, waiting, onClose, onView }: { notice: Notice; waiting: number; onClose: () => void; onView: (rideId: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose, notice.id])
  const phone = notice.data?.phone?.replace(/[^+\d]/g, '')
  const rows = notice.data?.rows
  return (
    <div className="modal-back" onClick={onClose}>
      <div className={`modal ${notice.kind}`} role="dialog" aria-modal="true" aria-labelledby="nt-title" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="row"><span className="modal-ico"><Bell size={20} /></span><h2 id="nt-title" className="grow">{notice.title}</h2><button type="button" className="loc-clear" onClick={onClose} aria-label="Close"><X size={14} /></button></div>
        <p className={notice.kind === 'reminder' ? 'modal-big' : ''}>{notice.message}</p>
        {rows && rows.length > 0 && <dl className="kv">{rows.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
        {waiting > 0 && <small className="muted">{waiting} more notification{waiting > 1 ? 's' : ''} waiting</small>}
        <div className="modal-actions">
          {notice.kind === 'assigned' && <button type="button" className="btn btn-primary" onClick={() => { onView(notice.rideId); onClose() }}>View passenger</button>}
          {notice.kind === 'reminder' && phone && <a className="btn btn-primary" href={`tel:${phone}`}><Phone size={16} /> Call passenger</a>}
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
