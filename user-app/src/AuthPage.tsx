import { useState, type FormEvent } from 'react'
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail, Phone, UserRound } from 'lucide-react'
import { signIn, signUp, type User } from './auth'
import { ApiError } from './api'

type Mode = 'signin' | 'signup'

export default function AuthPage({ onAuthed }: { onAuthed: (user: User) => void }) {
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      onAuthed(mode === 'signin' ? await signIn(email, password) : await signUp({ name, email, phone, password }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally { setBusy(false) }
  }

  return (
    <main className="m-shell">
      <form className="auth-screen" onSubmit={submit}>
        <img className="logo" src="/mccia-logo.png" alt="MCCIA" />
        <div className="m-title">
          <h1>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h1>
          <p>{mode === 'signin' ? 'Sign in to book and track your cab.' : 'Book a cab in under a minute.'}</p>
        </div>
        <div className="auth-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setError('') }}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError('') }}>Sign up</button>
        </div>
        {error && <div className="alert error" role="alert"><AlertCircle size={16} /> {error}</div>}
        {mode === 'signup' && <>
          <label className="field"><span>Full name</span><span className="input"><UserRound size={16} /><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your name" required /></span></label>
          <label className="field"><span>Phone number</span><span className="input"><Phone size={16} /><input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" required /></span></label>
        </>}
        <label className="field"><span>Email</span><span className="input"><Mail size={16} /><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@example.com" required /></span></label>
        <label className="field"><span>Password</span><span className="input"><Lock size={16} /><input value={password} onChange={(e) => setPassword(e.target.value)} type={visible ? 'text' : 'password'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'} minLength={mode === 'signup' ? 6 : undefined} required />
          <button type="button" className="link-btn" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'} <ArrowRight size={17} /></button>
      </form>
    </main>
  )
}
