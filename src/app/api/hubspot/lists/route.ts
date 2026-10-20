export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSetting } from '@/lib/settings'
import { fetchAllHubspotLists, saveListsCache, readListsCache } from '@/lib/hubspot-lists'

const HUBSPOT_API = 'https://api.hubapi.com'

export async function GET(req: NextRequest) {
  const debug = req.nextUrl.searchParams.get('debug') === '1'

  try {
    const { lists, stats } = await fetchAllHubspotLists()

    // Keep the shared cache warm so the N8N sync and SSO users see the same data
    saveListsCache(lists).catch(() => {})

    if (debug) {
      let nameLookup: unknown = null
      const nameParam = req.nextUrl.searchParams.get('name')
      if (nameParam) {
        const token = await getSetting('HUBSPOT_ACCESS_TOKEN')
        const res = await fetch(
          `${HUBSPOT_API}/crm/v3/lists/object-type-id/0-1/name/${encodeURIComponent(nameParam)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        nameLookup = { name: nameParam, status: res.status, body: await res.json().catch(() => null) }
      }

      return NextResponse.json({
        fetched: lists.length,
        ...stats,
        nameLookup,
        ids: lists.map(l => Number(l.listId)).sort((a, b) => a - b),
      })
    }

    return NextResponse.json(lists)
  } catch (err) {
    console.error('HubSpot lists error:', err)

    // HubSpot unavailable — serve the last synced snapshot so the panel keeps working
    const cached = await readListsCache()
    if (cached && cached.lists.length > 0) {
      return NextResponse.json(cached.lists, {
        headers: { 'x-lists-cache': cached.syncedAt || 'unknown' },
      })
    }

    return NextResponse.json({ error: 'Failed to fetch lists' }, { status: 500 })
  }
}
