import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Paths publicos exatos (match exato, nao prefixo)
const PUBLIC_PATHS_EXACT = ['/api/webhooks/whatsapp', '/api/webhooks/hubspot', '/api/health', '/api/campaigns/pending']
// Paths publicos por prefixo (assets, static files, N8N campaign execution)
const PUBLIC_PATHS_PREFIX = ['/_next/', '/favicon.ico', '/api/campaigns/']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Paths publicos passam direto
  const isPublic = PUBLIC_PATHS_EXACT.includes(pathname)
    || PUBLIC_PATHS_PREFIX.some(p => pathname.startsWith(p))
  if (isPublic) {
    return NextResponse.next()
  }

  // Em producao, o OAuth2-Proxy injeta X-Auth-Request-Email em todo request autenticado
  const email = req.headers.get('x-auth-request-email')

  if (!email) {
    // Em desenvolvimento local, usar fallback via env var
    if (process.env.NODE_ENV === 'development') {
      const devEmail = process.env.DEV_USER_EMAIL || 'dev@wmi.solutions'
      const res = NextResponse.next()
      res.headers.set('x-user-email', devEmail)
      return res
    }

    // Em producao sem header = request nao autenticado (nunca deveria acontecer
    // pois o proxy filtra antes, mas defensive coding)
    return new NextResponse('Forbidden — no SSO header', { status: 403 })
  }

  // Propaga o email do usuario para as rotas
  const res = NextResponse.next()
  res.headers.set('x-user-email', email)
  res.headers.set('x-user-name', req.headers.get('x-auth-request-user') || email)
  return res
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
}
