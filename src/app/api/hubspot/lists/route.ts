export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSetting } from '@/lib/settings'

const HUBSPOT_API = 'https://api.hubapi.com'

export async function GET(req: NextRequest) {
  const debug = req.nextUrl.searchParams.get('debug') === '1'
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

    const dbg: Record<string, unknown> = {}

    // 1) ILS v3 contact lists (objectTypeId 0-1) with pagination
    let ilsCount = 0
    let ilsTotal: unknown = null
    let after: string | undefined
    for (let page = 0; page < 50; page++) {
      const url = `${HUBSPOT_API}/crm/v3/lists/object-type-id/0-1?limit=250${after ? `&after=${after}` : ''}`
      const res = await fetch(url, { headers })
      if (!res.ok) {
        dbg.ilsError = { status: res.status, body: await res.text() }
        break
      }

      const data = await res.json()
      if (ilsTotal === null) ilsTotal = data.total ?? null
      const items = data.lists || data.results || []
      ilsCount += items.length
      for (const list of items) addList(list)

      const nextAfter = data.paging?.next?.after
      if (!nextAfter || items.length === 0) break
      after = nextAfter
    }
    const afterIls = listsMap.size

    // 2) Search supplement — collect objectTypeId distribution for debug
    let searchCount = 0
    let searchTotal: unknown = null
    const searchTypeDist: Record<string, number> = {}
    const searchOnly: { listId: string; name: string; objectTypeId: string }[] = []
    let offset = 0
    for (let page = 0; page < 100; page++) {
      const res = await fetch(`${HUBSPOT_API}/crm/v3/lists/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ count: 250, offset, query: '' }),
      })
      if (!res.ok) {
        dbg.searchError = { status: res.status, body: await res.text() }
        break
      }

      const data = await res.json()
      if (searchTotal === null) searchTotal = data.total ?? null
      const items = data.lists || []
      searchCount += items.length
      for (const list of items) {
        const ot = String(list.objectTypeId)
        searchTypeDist[ot] = (searchTypeDist[ot] || 0) + 1
        const id = String(list.listId || list.id)
        if (!listsMap.has(id)) {
          searchOnly.push({ listId: id, name: String(list.name || ''), objectTypeId: ot })
        }
        if (ot === '0-1') addList(list)
      }

      if (!data.hasMore || items.length === 0) break
      offset = data.offset ?? (offset + items.length)
    }

    const lists = Array.from(listsMap.values())
    lists.sort((a, b) => a.name.localeCompare(b.name))

    if (debug) {
      return NextResponse.json({
        finalCount: lists.length,
        ils: { count: ilsCount, total: ilsTotal, mapSizeAfter: afterIls },
        search: { count: searchCount, total: searchTotal, typeDistribution: searchTypeDist },
        listsNotInIls: searchOnly,
        ...dbg,
      })
    }

    return NextResponse.json(lists)
  } catch (err) {
    console.error('HubSpot lists error:', err)
    return NextResponse.json({ error: 'Failed to fetch lists' }, { status: 500 })
  }
}
