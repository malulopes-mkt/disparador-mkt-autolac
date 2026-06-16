export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getSetting } from '@/lib/settings'

const GRAPH_URL = 'https://graph.facebook.com/v21.0'

export async function GET() {
  const wabaId = await getSetting('META_WABA_ID')
  const accessToken = await getSetting('META_ACCESS_TOKEN')

  if (!wabaId || !accessToken) {
    return NextResponse.json({ error: 'META_WABA_ID or META_ACCESS_TOKEN not configured' }, { status: 500 })
  }

  const res = await fetch(`${GRAPH_URL}/${wabaId}/subscribed_apps`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  return NextResponse.json({ status: 'check', subscribed_apps: data })
}

export async function POST() {
  const wabaId = await getSetting('META_WABA_ID')
  const accessToken = await getSetting('META_ACCESS_TOKEN')

  if (!wabaId || !accessToken) {
    return NextResponse.json({ error: 'META_WABA_ID or META_ACCESS_TOKEN not configured' }, { status: 500 })
  }

  const res = await fetch(`${GRAPH_URL}/${wabaId}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  return NextResponse.json({ status: 'subscribed', result: data })
}
