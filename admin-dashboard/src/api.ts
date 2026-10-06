export const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/[/]+$/, '') ?? `http://${window.location.hostname}:4000/api`

const TOKEN_KEY = 'mccia.adminToken'
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } }
export const setToken = (t: string | null) => {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY) } catch { /* storage unavailable */ }
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken()
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new ApiError(import.meta.env.PROD && !import.meta.env.VITE_API_URL ? 'This app is not connected to the backend yet. Set VITE_API_URL in Vercel and redeploy.' : `Cannot reach the server at ${API}. Is the backend running?`, 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error ?? 'Something went wrong.', res.status)
  return data as T
}
