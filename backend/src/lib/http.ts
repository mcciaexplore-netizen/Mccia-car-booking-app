import { NextResponse } from 'next/server'
import { readToken, type Role } from './auth'

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status })
export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })
export const body = async (req: Request): Promise<Record<string, unknown>> => {
  try { return (await req.json()) as Record<string, unknown> } catch { return {} }
}

// Returns the signed-in account's id for the role, or null.
export function auth(req: Request, role: Role): string | null {
  const claims = readToken(req)
  return claims && claims.role === role ? claims.id : null
}
