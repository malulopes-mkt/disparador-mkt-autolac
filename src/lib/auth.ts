import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import crypto from 'crypto'

const TOKEN_NAME = 'whatsapp-mkt-session'

function sign(value: string): string {
  const secret = process.env.APP_SECRET || 'default-secret-change-me'
  return crypto.createHmac('sha256', secret).update(value).digest('hex')
}

export function createSessionToken(): string {
  const payload = `authenticated:${Date.now()}`
  const signature = sign(payload)
  return `${payload}.${signature}`
}

export function validateToken(token: string): boolean {
  const lastDot = token.lastIndexOf('.')
  if (lastDot === -1) return false
  const payload = token.substring(0, lastDot)
  const signature = token.substring(lastDot + 1)
  return crypto.timingSafeEqual(
    Buffer.from(sign(payload)),
    Buffer.from(signature)
  )
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(TOKEN_NAME)?.value
  if (!token) return false
  return validateToken(token)
}

export function isAuthenticatedFromRequest(req: NextRequest): boolean {
  const token = req.cookies.get(TOKEN_NAME)?.value
  if (!token) return false
  return validateToken(token)
}

export async function setSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  const token = createSessionToken()
  cookieStore.set(TOKEN_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(TOKEN_NAME)
}
