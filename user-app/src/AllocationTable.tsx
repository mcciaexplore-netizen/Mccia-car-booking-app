import type { ReactNode } from 'react'

export type Row = [string, ReactNode]

export default function AllocationTable({ rows, label = 'Ride details' }: { rows: Row[]; label?: string }) {
  return (
    <table className="alloc-table" aria-label={label}>
      <tbody>
        {rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td className={k === 'Ride PIN' ? 'pin' : undefined}>{v}</td></tr>)}
      </tbody>
    </table>
  )
}
