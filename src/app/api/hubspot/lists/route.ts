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

    let searchTotal: number | null = null
    let pagesFetched = 0
    let lastHasMore: boolean | null = null

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
      if (searchTotal === null) searchTotal = data.total ?? null
      pagesFetched++
      lastHasMore = data.hasMore ?? null
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

    // The search index lags behind for freshly created lists. List ids are
    // sequential, so probe ids above the highest one search returned —
    // GET by id reads directly (no index) and finds new lists immediately.
    let probedFound = 0
    const knownIds = Array.from(listsMap.keys()).map(Number).filter(n => !isNaN(n))
    const maxId = knownIds.length ? Math.max(...knownIds) : 0
    if (maxId > 0) {
      const PROBE_RANGE = 120
      const CHUNK = 10
      let missesInARow = 0
      for (let start = maxId + 1; start <= maxId + PROBE_RANGE && missesInARow < 30; start += CHUNK) {
        const chunkIds = Array.from({ length: CHUNK }, (_, i) => start + i)
        const results = await Promise.all(chunkIds.map(async id => {
          const res = await fetch(`${HUBSPOT_API}/crm/v3/lists/${id}?includeFilters=false`, { headers })
          if (!res.ok) return null
          const data = await res.json()
          return data.list || data
        }))
        for (const list of results) {
          if (!list?.listId) { missesInARow++; continue }
          missesInARow = 0
          const id = String(list.listId)
          if (listsMap.has(id)) continue
          probedFound++
          listsMap.set(id, {
            listId: id,
            name: String(list.name || ''),
            listType: list.processingType === 'MANUAL' ? 'STATIC' : 'DYNAMIC',
            size: Number(list.additionalProperties?.hs_list_size) || list.size || 0,
          })
        }
      }
    }

    const lists = Array.from(listsMap.values())
    lists.sort((a, b) => a.name.localeCompare(b.name))

    if (debug) {
      return NextResponse.json({
        fetched: lists.length,
        searchTotal,
        pagesFetched,
        lastHasMore,
        probedFound,
        ids: lists.map(l => Number(l.listId)).sort((a, b) => a - b),
      })
    }

    return NextResponse.json(lists)
  } catch (err) {
    console.error('HubSpot lists error:', err)
    return NextResponse.json({ error: 'Failed to fetch lists' }, { status: 500 })
  }
}
