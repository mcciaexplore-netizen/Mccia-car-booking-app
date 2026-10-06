import { useState, type FormEvent } from 'react'
import { Check, LogOut, Trash2 } from 'lucide-react'
import { changePassword, deleteAccount, signOut, updateProfile, type User } from './auth'
import { ApiError } from './api'

export default function AccountPage({ user, onUser, onLogout }: { user: User; onUser: (u: User) => void; onLogout: () => void }) {
  const [name, setName] = useState(user.name)
  const [phone, setPhone] = useState(user.phone)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [profileMsg, setProfileMsg] = useState('')
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null)

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    try { onUser(await updateProfile({ name, phone })); setProfileMsg('Saved') } catch { setProfileMsg('Could not save') }
    setTimeout(() => setProfileMsg(''), 2000)
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault()
    try {
      await changePassword(current, next)
      setCurrent(''); setNext('')
      setPwMsg({ text: 'Password changed.', ok: true })
    } catch (err) {
      setPwMsg({ text: err instanceof ApiError ? err.message : 'Could not change password.', ok: false })
    }
  }

  async function remove() {
    if (!window.confirm('Delete your account? This cannot be undone.')) return
    await deleteAccount().catch(() => undefined)
    onLogout()
  }

  return (
    <div className="stack">
      <div className="card"><div className="row"><span className="avatar">{user.name.charAt(0).toUpperCase()}</span><div className="grow"><strong>{user.name}</strong><small>{user.email}</small></div></div></div>
      <form className="card" onSubmit={saveProfile}>
        <div className="card-head"><h2>Profile</h2>{profileMsg && <span className="chip green"><Check size={13} /> {profileMsg}</span>}</div>
        <label className="field"><span>Full name</span><span className="input"><input value={name} onChange={(e) => setName(e.target.value)} required /></span></label>
        <label className="field"><span>Phone</span><span className="input"><input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" required /></span></label>
        <button className="btn btn-primary" type="submit">Save changes</button>
      </form>
      <form className="card" onSubmit={savePassword}>
        <div className="card-head"><h2>Change password</h2></div>
        <label className="field"><span>Current password</span><span className="input"><input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required /></span></label>
        <label className="field"><span>New password</span><span className="input"><input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={6} required /></span></label>
        {pwMsg && <div className={`alert ${pwMsg.ok ? 'ok' : 'error'}`} role="status">{pwMsg.text}</div>}
        <button className="btn btn-ghost" type="submit">Update password</button>
      </form>
      <button type="button" className="btn btn-ghost" onClick={() => { signOut(); onLogout() }}><LogOut size={16} /> Sign out</button>
      <button type="button" className="btn btn-danger" onClick={remove}><Trash2 size={16} /> Delete account</button>
    </div>
  )
}
