export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getSetting } from '@/lib/settings'

const GRAPH_URL = 'https://graph.facebook.com/v21.0'
const APP_ID = '1692232541924521'

export async function GET() {
  try {
    const appSecret = await getSetting('META_APP_SECRET')
    const accessToken = await getSetting('META_ACCESS_TOKEN')
    const wabaId = await getSetting('META_WABA_ID')

    if (!appSecret || !accessToken || !wabaId) {
      return NextResponse.json({ error: 'Missing settings' }, { status: 500 })
    }

    const appToken = `${APP_ID}|${appSecret}`

    const [appSubRes, wabaSubRes] = await Promise.all([
      fetch(`${GRAPH_URL}/${APP_ID}/subscriptions?access_token=${encodeURIComponent(appToken)}`),
      fetch(`${GRAPH_URL}/${wabaId}/subscribed_apps`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ])

    const [appSubs, wabaSubs] = await Promise.all([
      appSubRes.json(),
      wabaSubRes.json(),
    ])

    return NextResponse.json({
      wabaId,
      appSubscriptions: appSubs,
      wabaSubscribedApps: wabaSubs,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}

// POST to subscribe the app to the WABA's webhooks
export async function POST() {
  try {
    const accessToken = await getSetting('META_ACCESS_TOKEN')
    const wabaId = await getSetting('META_WABA_ID')

    if (!accessToken || !wabaId) {
      return NextResponse.json({ error: 'Missing settings' }, { status: 500 })
    }

    const res = await fetch(`${GRAPH_URL}/${wabaId}/subscribed_apps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    const data = await res.json()
    return NextResponse.json({ status: res.status, result: data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
