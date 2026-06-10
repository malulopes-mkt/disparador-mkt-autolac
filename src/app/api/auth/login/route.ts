import { NextResponse } from 'next/server'

// Login agora e gerenciado pelo SSO Microsoft Entra via OAuth2-Proxy.
// Esta rota existe apenas para compatibilidade — redireciona para o app.
export async function POST() {
  return NextResponse.json({ ok: true, message: 'SSO managed by OAuth2-Proxy' })
}

export async function GET() {
  return NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'))
}
