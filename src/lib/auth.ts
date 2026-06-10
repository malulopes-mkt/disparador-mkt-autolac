import { headers } from 'next/headers'
import { NextRequest } from 'next/server'

/**
 * SSO Microsoft Entra via OAuth2-Proxy.
 * O proxy injeta X-Auth-Request-Email em todo request autenticado.
 * Em dev local, o middleware.ts faz fallback para DEV_USER_EMAIL.
 */

export async function getAuthenticatedEmail(): Promise<string | null> {
  const headerStore = await headers()
  // Header original do proxy OU header propagado pelo middleware
  return headerStore.get('x-auth-request-email')
    || headerStore.get('x-user-email')
    || null
}

export async function isAuthenticated(): Promise<boolean> {
  const email = await getAuthenticatedEmail()
  return !!email
}

export function getEmailFromRequest(req: NextRequest): string | null {
  return req.headers.get('x-auth-request-email')
    || req.headers.get('x-user-email')
    || null
}

// Logout redireciona para o OAuth2-Proxy sign_out
export function getSSOLogoutUrl(): string {
  return 'https://oauth.apps.wmi.solutions/oauth2/sign_out'
}
