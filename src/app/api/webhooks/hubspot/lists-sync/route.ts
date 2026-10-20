export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { getSetting } from '@/lib/settings'
import { fetchAllHubspotLists, saveListsCache } from '@/lib/hubspot-lists'

// Called by N8N on a schedule (path bypasses SSO like other webhooks).
// Auth: header x-webhook-token or ?token= matching N8N_WEBHOOK_TOKEN.
async function verifyAuth(req: NextRequest): Promise<boolean> {
  const provided = req.headers.get('x-webhook-token') || req.nextUrl.searchParams.get('token')
  if (!provided) return false
  const expected = await getSetting('N8N_WEBHOOK_TOKEN')
  if (!expected) return false
  return provided === expected
}

async function handle(req: NextRequest) {
  if (!(await verifyAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { lists, stats } = await fetchAllHubspotLists()
    const syncedAt = await saveListsCache(lists)
    return NextResponse.json({
      ok: true,
      count: lists.length,
      searchTotal: stats.searchTotal,
      probedFound: stats.probedFound,
      syncedAt,
    })
  } catch (err) {
    console.error('HubSpot lists-sync webhook error:', err)
    const message = err instanceof Error ? err.message : 'Sync failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
