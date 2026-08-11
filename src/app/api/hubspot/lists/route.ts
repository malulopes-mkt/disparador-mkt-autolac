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

    let offset = 0
    for (let page = 0; page < 100; page++) {
      const res = await fetch(`${HUBSPOT_API}/crm/v3/lists/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          count: 250,
          offset,
          query: '',
          // hs_list_size is only returned when explicitly requested
          additionalProperties: ['hs_list_size'],
        }),
      })
      if (!res.ok) break

      const data = await res.json()
      const items = data.lists || []
      for (const list of items) {
        const id = String(list.listId || list.id)
        if (!id || listsMap.has(id)) continue
        listsMap.set(id, {
          listId: id,
          name: String(list.name || ''),
          listType: list.processingType === 'MANUAL' ? 'STATIC' : 'DYNAMIC',
          size: Number(list.additionalProperties?.hs_list_size) || list.size || 0,
        })
      }

      if (!data.hasMore || items.length === 0) break
      offset = data.offset ?? (offset + items.length)
    }

    const lists = Array.from(listsMap.values())
    lists.sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json(lists)
  } catch (err) {
    console.error('HubSpot lists error:', err)
    return NextResponse.json({ error: 'Failed to fetch lists' }, { status: 500 })
  }
}
