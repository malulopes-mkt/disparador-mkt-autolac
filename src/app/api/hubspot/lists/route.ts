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

    function addList(list: Record<string, unknown>) {
      const id = String(list.listId || list.id)
      if (!id || listsMap.has(id)) return
      listsMap.set(id, {
        listId: id,
        name: String(list.name || ''),
        listType: (list.processingType === 'MANUAL') ? 'STATIC' : 'DYNAMIC',
        size: (list.size as number) || 0,
      })
    }

    // 1) ILS v3 contact lists (objectTypeId 0-1) with pagination
    let after: string | undefined
    for (let page = 0; page < 50; page++) {
      const url = `${HUBSPOT_API}/crm/v3/lists/object-type-id/0-1?limit=250${after ? `&after=${after}` : ''}`
      const res = await fetch(url, { headers })
      if (!res.ok) break

      const data = await res.json()
      const items = data.lists || data.results || []
      for (const list of items) addList(list)

      const nextAfter = data.paging?.next?.after
      if (!nextAfter || items.length === 0) break
      after = nextAfter
    }

    // 2) Search supplement — only add contact lists (objectTypeId 0-1)
    let offset = 0
    for (let page = 0; page < 100; page++) {
      const res = await fetch(`${HUBSPOT_API}/crm/v3/lists/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ count: 250, offset, query: '' }),
      })
      if (!res.ok) break

      const data = await res.json()
      const items = data.lists || []
      for (const list of items) {
        if (String(list.objectTypeId) === '0-1') addList(list)
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
