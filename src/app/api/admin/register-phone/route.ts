export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSetting } from '@/lib/settings'

const GRAPH_URL = 'https://graph.facebook.com/v21.0'

export async function POST(req: NextRequest) {
  const { action, phoneNumberId, code, pin } = await req.json() as {
    action: 'request_code' | 'verify_code' | 'register'
    phoneNumberId: string
    code?: string
    pin?: string
  }

  const accessToken = await getSetting('META_ACCESS_TOKEN')
  if (!accessToken) {
    return NextResponse.json({ error: 'META_ACCESS_TOKEN not configured' }, { status: 500 })
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }

  if (action === 'request_code') {
    const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/request_code`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        code_method: 'SMS',
        language: 'pt_BR',
      }),
    })
    const data = await res.json()
    return NextResponse.json({ ok: res.ok, status: res.status, data })
  }

  if (action === 'verify_code') {
    if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })
    const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/verify_code`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ code }),
    })
    const data = await res.json()
    return NextResponse.json({ ok: res.ok, status: res.status, data })
  }

  if (action === 'register') {
    if (!pin) return NextResponse.json({ error: 'pin (6 digits) is required' }, { status: 400 })
    const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        pin,
      }),
    })
    const data = await res.json()
    return NextResponse.json({ ok: res.ok, status: res.status, data })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
