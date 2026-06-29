export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getSetting } from '@/lib/settings'

const HUBSPOT_API = 'https://api.hubapi.com'

export async function GET() {
  const token = await getSetting('HUBSPOT_ACCESS_TOKEN')
  if (!token) {
    return NextResponse.json({ error: 'HUBSPOT_ACCESS_TOKEN not configured' }, { status: 500 })
  }

  try {
    const listsMap = new Map<string, { listId: string; name: string; listType: string; size: number }>()
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    // Primary: fetch all contact lists via ILS v3 object-type endpoint
    let after: string | undefined
    for (let page = 0; page < 50; page++) {
      const url = `${HUBSPOT_API}/crm/v3/lists/object-type-id/0-1?count=500${after ? `&after=${after}` : ''}`
      const res = await fetch(url, { headers })
      if (!res.ok) break

      const data = await res.json()
      const items = data.lists || data.results || []
      for (const list of items) {
        const id = String(list.listId || list.id)
        listsMap.set(id, {
          listId: id,
          name: list.name,
          listType: list.processingType === 'MANUAL' ? 'STATIC' : 'DYNAMIC',
          size: list.size || 0,
        })
      }

      const nextAfter = data.paging?.next?.after
      if (!nextAfter || items.length === 0) break
      after = nextAfter
    }

    // Fallback: if ILS endpoint returned nothing, use search endpoint
    if (listsMap.size === 0) {
      let offset = 0
      let hasMore = true

      while (hasMore) {
        const res = await fetch(`${HUBSPOT_API}/crm/v3/lists/search`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ count: 500, offset, query: '' }),
        })

        if (!res.ok) break

        const data = await res.json()
        for (const list of data.lists || []) {
          listsMap.set(String(list.listId), {
            listId: String(list.listId),
            name: list.name,
            listType: list.processingType === 'MANUAL' ? 'STATIC' : 'DYNAMIC',
            size: list.size || 0,
          })
        }

        hasMore = data.hasMore === true
        offset = data.offset || offset + 500
        if (!(data.lists?.length > 0)) hasMore = false
      }
    }

    const lists = Array.from(listsMap.values())
    lists.sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json(lists)
  } catch (err) {
    console.error('HubSpot lists error:', err)
    return NextResponse.json({ error: 'Failed to fetch lists' }, { status: 500 })
  }
}
