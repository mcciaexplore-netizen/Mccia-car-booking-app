import { useEffect, useState, type FormEvent } from 'react'
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Phone, UserRound } from 'lucide-react'
import { api, ApiError, setToken, type Driver } from './api'

type RosterEntry = { id: string; name: string; registered: boolean }

export default function AuthScreen({ onAuthed }: { onAuthed: (d: Driver) => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<RosterEntry[]>('/drivers', { auth: false }).then(setRoster).catch((e: ApiError) => setError(e.message))
  }, [])

  function go(next: 'signin' | 'signup') { setMode(next); setError(''); setPassword('') }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const body = mode === 'signup' ? { name, phone, password } : { phone, password }
      const res = await api<{ token: string; user: Driver }>(`/auth/driver/${mode}`, { body, auth: false })
      setToken(res.token)
      onAuthed(res.user)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    } finally { setBusy(false) }
  }

  return (
    <main className="m-shell">
      <form className="auth-screen" onSubmit={submit}>
        <img className="logo" src="/mccia-logo.png" alt="MCCIA" />
        <div className="m-title">
          <span className="eyebrow">Driver app</span>
          <h1>{mode === 'signin' ? 'Welcome back' : 'Create your driver account'}</h1>
          <p>{mode === 'signin' ? 'Sign in with your phone number to see ride requests.' : 'Riders will see your name and number.'}</p>
        </div>
        <div className="auth-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'active' : ''} onClick={() => go('signin')}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => go('signup')}>Sign up</button>
        </div>
        {error && <div className="alert error" role="alert"><AlertCircle size={16} /> {error}</div>}
        {mode === 'signup' && (
          <label className="field"><span>Full name</span>
            <span className="input"><UserRound size={16} /><input value={name} onChange={(e) => setName(e.target.value)} list="open-names" autoComplete="name" placeholder="e.g. Suresh Patil" required minLength={2} />
              <datalist id="open-names">{roster.filter((d) => !d.registered).map((d) => <option key={d.id} value={d.name} />)}</datalist></span>
          </label>
        )}
        <label className="field"><span>Phone number</span><span className="input"><Phone size={16} /><input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" required /></span></label>
        <label className="field"><span>Password</span><span className="input"><Lock size={16} />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type={show ? 'text' : 'password'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} placeholder="At least 4 characters" required minLength={4} />
          <button type="button" className="link-btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'} <ArrowRight size={17} /></button>
      </form>
    </main>
  )
}
