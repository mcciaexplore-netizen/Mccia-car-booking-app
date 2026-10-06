import { api, setToken, getToken } from './api'

export type User = { id: string; name: string; email: string; phone: string; createdAt: string }
type Session = { token: string; user: User }

export async function restoreSession(): Promise<User | null> {
  if (!getToken()) return null
  try { return (await api<{ user: User }>('/auth/me')).user } catch { setToken(null); return null }
}

export async function signUp(input: { name: string; email: string; phone: string; password: string }) {
  const s = await api<Session>('/auth/rider/signup', { body: input })
  setToken(s.token)
  return s.user
}

export async function signIn(email: string, password: string) {
  const s = await api<Session>('/auth/rider/signin', { body: { email, password } })
  setToken(s.token)
  return s.user
}

export function signOut() { setToken(null) }

export async function updateProfile(changes: { name: string; phone: string }) {
  return (await api<{ user: User }>('/rider/profile', { method: 'PATCH', body: changes })).user
}

export async function changePassword(current: string, next: string) {
  await api('/rider/password', { body: { current, next } })
}

export async function deleteAccount() {
  await api('/rider/account', { method: 'DELETE' })
  setToken(null)
}
