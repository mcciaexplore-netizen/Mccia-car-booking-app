import { useEffect, useState } from 'react'
import App from './App'
import AuthPage from './AuthPage'
import { restoreSession, type User } from './auth'

export default function Root() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => { restoreSession().then((u) => { setUser(u); setReady(true) }) }, [])
  if (!ready) return <div className="m-shell"><div className="empty">Loading…</div></div>
  return user
    ? <App key={user.id} user={user} onUser={setUser} onLogout={() => setUser(null)} />
    : <AuthPage onAuthed={setUser} />
}
