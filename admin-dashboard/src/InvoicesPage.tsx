// Payments and invoices for MCCIA member companies. Billing is not connected yet, so the list starts empty.
import { useState } from 'react'
import { Download, FileText, Printer, X } from 'lucide-react'

type Status = 'paid' | 'pending' | 'overdue'
type Invoice = { id: string; company: string; period: string; rides: number; km: number; amount: number; issued: string; due: string; status: Status; method?: string }

const STATUS: Record<Status, { label: string; tone: string }> = { paid: { label: 'Paid', tone: 'green' }, pending: { label: 'Pending', tone: 'warn' }, overdue: { label: 'Overdue', tone: 'red' } }
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

const INVOICES: Invoice[] = [] // no invoices yet; billing is not connected to the backend
const GST = 0.05

export default function InvoicesPage({ notify }: { notify: (m: string) => void }) {
  const [filter, setFilter] = useState<'all' | Status>('all')
  const [open, setOpen] = useState<Invoice | null>(null)
  const shown = INVOICES.filter((i) => filter === 'all' || i.status === filter)
  const sum = (s?: Status) => INVOICES.filter((i) => !s || i.status === s).reduce((t, i) => t + i.amount, 0)

  return (
    <div className="page">
      <div className="page-head">
        <div><span className="eyebrow">Billing · Pune</span><h1>Payments &amp; invoices</h1><p>Monthly ride invoices for member companies.</p></div>
        <div className="head-actions"><button type="button" className="btn btn-ghost" onClick={() => notify('Nothing to export yet')}><Download size={16} /> Export CSV</button></div>
      </div>

      <section className="card panel">
        <div className="crm-stats">
          <div><small>Total billed</small><strong>{inr(sum())}</strong></div>
          <div><small>Collected</small><strong>{inr(sum('paid'))}</strong></div>
          <div><small>Pending</small><strong>{inr(sum('pending'))}</strong></div>
          <div><small>Overdue</small><strong>{inr(sum('overdue'))}</strong></div>
        </div>
        <div className="filter-chips" role="tablist" aria-label="Filter by status">
          {(['all', 'pending', 'overdue', 'paid'] as const).map((s) => <button key={s} type="button" className={filter === s ? 'on' : ''} onClick={() => setFilter(s)}>{s === 'all' ? 'All' : STATUS[s].label} <span>{s === 'all' ? INVOICES.length : INVOICES.filter((i) => i.status === s).length}</span></button>)}
        </div>
        <div className="table scroll-x">
          <div className="trow thead irow"><span>Invoice</span><span>Company</span><span>Period</span><span>Rides</span><span>Amount</span><span>Due</span><span>Status</span></div>
          {!shown.length && <div className="empty"><FileText size={22} />No invoices yet. They will appear here once billing is set up.</div>}
          {shown.map((i) => <div className="trow irow clickable" key={i.id} onClick={() => setOpen(i)}>
            <span className="cell"><strong>{i.id}</strong></span>
            <span className="cell">{i.company}</span>
            <span className="cell muted">{i.period}</span>
            <span className="cell">{i.rides}</span>
            <span className="cell">{inr(i.amount)}</span>
            <span className="cell">{fmt(i.due)}</span>
            <span className="cell"><span className={`chip ${STATUS[i.status].tone}`}>{STATUS[i.status].label}</span></span>
          </div>)}
        </div>
      </section>

      {open && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(null) }}>
        <section className="modal card wide invoice-sheet" role="dialog" aria-modal="true" aria-labelledby="inv-title">
          <div className="card-head">
            <div className="inv-brand"><img src="/mccia-logo.png" alt="MCCIA" /><div><strong>MCCIA Cabs</strong><small>Mahratta Chamber of Commerce, Industries &amp; Agriculture, Pune</small></div></div>
            <button type="button" className="icon-btn" aria-label="Close" onClick={() => setOpen(null)}><X size={18} /></button>
          </div>
          <div className="inv-meta">
            <div><small>Invoice</small><h2 id="inv-title">{open.id}</h2></div>
            <div><small>Billed to</small><strong>{open.company}</strong></div>
            <div><small>Issued / Due</small><strong>{fmt(open.issued)} · {fmt(open.due)}</strong></div>
            <div><small>Status</small><span className={`chip ${STATUS[open.status].tone}`}>{STATUS[open.status].label}{open.method ? ` · ${open.method}` : ''}</span></div>
          </div>
          <div className="table">
            <div className="trow thead inv-line"><span>Description</span><span>Qty</span><span>Amount</span></div>
            <div className="trow inv-line"><span>Employee cab rides, {open.period}</span><span>{open.rides}</span><span>{inr(open.amount)}</span></div>
            <div className="trow inv-line"><span className="muted">Distance covered</span><span>{open.km} km</span><span /></div>
            <div className="trow inv-line"><span className="muted">GST @ 5%</span><span /><span>{inr(Math.round(open.amount * GST))}</span></div>
            <div className="trow inv-line inv-total"><span>Total</span><span /><span>{inr(open.amount + Math.round(open.amount * GST))}</span></div>
          </div>
          <div className="modal-actions">
            {open.status !== 'paid' && <button type="button" className="btn btn-ghost" onClick={() => { notify(`Reminder sent to ${open.company} `); setOpen(null) }}>Send reminder</button>}
            <button type="button" className="btn btn-ghost" onClick={() => window.print()}><Printer size={16} /> Print</button>
            <button type="button" className="btn btn-primary" onClick={() => notify('PDF export is not available yet')}><Download size={16} /> Download PDF</button>
          </div>
        </section>
      </div>}
    </div>
  )
}
