import { NextResponse } from 'next/server'
import { getSSOLogoutUrl } from '@/lib/auth'

// Logout redireciona para o OAuth2-Proxy sign_out
// Isso remove o cookie SSO e forca novo login Microsoft
export async function POST() {
  return NextResponse.redirect(getSSOLogoutUrl())
}

export async function GET() {
  return NextResponse.redirect(getSSOLogoutUrl())
}
