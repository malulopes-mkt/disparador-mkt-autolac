import { prisma } from './db'
import { getSetting } from './settings'

const HUBSPOT_API = 'https://api.hubapi.com'

const CACHE_KEY = 'HUBSPOT_LISTS_CACHE'
const CACHE_AT_KEY = 'HUBSPOT_LISTS_CACHE_AT'

export interface HubSpotList {
  listId: string
  name: string
  listType: string
  size: number
}

export interface FetchStats {
  searchTotal: number | null
  pagesFetched: number
  lastHasMore: boolean | null
  probedFound: number
  maxId: number
}

// Fetches every list the HubSpot API exposes: search endpoint (all pages)
// plus a rolling id probe that catches freshly created lists the search
// index doesn't know about yet.
export async function fetchAllHubspotLists(): Promise<{ lists: HubSpotList[]; stats: FetchStats }> {
  const token = await getSetting('HUBSPOT_ACCESS_TOKEN')
  if (!token) throw new Error('HUBSPOT_ACCESS_TOKEN not configured')

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  const listsMap = new Map<string, HubSpotList>()
  const stats: FetchStats = {
    searchTotal: null,
    pagesFetched: 0,
    lastHasMore: null,
    probedFound: 0,
    maxId: 0,
  }

  function addList(list: Record<string, unknown>) {
    const id = String(list.listId || list.id)
    if (!id || listsMap.has(id)) return false
    const additional = list.additionalProperties as Record<string, unknown> | undefined
    listsMap.set(id, {
      listId: id,
      name: String(list.name || ''),
      listType: list.processingType === 'MANUAL' ? 'STATIC' : 'DYNAMIC',
      size: Number(additional?.hs_list_size) || Number(list.size) || 0,
    })
    return true
  }

  // 1) Search endpoint, paginated
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
    if (stats.searchTotal === null) stats.searchTotal = data.total ?? null
    stats.pagesFetched++
    stats.lastHasMore = data.hasMore ?? null
    const items = data.lists || []
    for (const list of items) addList(list)

    if (!data.hasMore || items.length === 0) break
    offset = data.offset ?? (offset + items.length)
  }

  // 2) Rolling id probe above the highest known id: every hit extends the
  // horizon, so the probe keeps up even if the search index stays stale.
  const knownIds = Array.from(listsMap.keys()).map(Number).filter(n => !isNaN(n))
  const maxId = knownIds.length ? Math.max(...knownIds) : 0
  stats.maxId = maxId
  if (maxId > 0) {
    const PROBE_WINDOW = 300
    const PROBE_HARD_CAP = 3000
    const CHUNK = 10
    let horizon = maxId + PROBE_WINDOW
    for (let start = maxId + 1; start <= horizon && start <= maxId + PROBE_HARD_CAP; start += CHUNK) {
      const chunkIds = Array.from({ length: CHUNK }, (_, i) => start + i)
      const results = await Promise.all(chunkIds.map(async id => {
        const res = await fetch(`${HUBSPOT_API}/crm/v3/lists/${id}?includeFilters=false`, { headers })
        if (!res.ok) return null
        const data = await res.json()
        return data.list || data
      }))
      for (const list of results) {
        if (!list?.listId) continue
        horizon = Math.max(horizon, Number(list.listId) + PROBE_WINDOW)
        if (addList(list)) stats.probedFound++
      }
    }
  }

  const lists = Array.from(listsMap.values())
  lists.sort((a, b) => a.name.localeCompare(b.name))
  return { lists, stats }
}

export async function saveListsCache(lists: HubSpotList[]): Promise<string> {
  const syncedAt = new Date().toISOString()
  await prisma.setting.upsert({
    where: { key: CACHE_KEY },
    update: { value: JSON.stringify(lists) },
    create: { key: CACHE_KEY, value: JSON.stringify(lists) },
  })
  await prisma.setting.upsert({
    where: { key: CACHE_AT_KEY },
    update: { value: syncedAt },
    create: { key: CACHE_AT_KEY, value: syncedAt },
  })
  return syncedAt
}

export async function readListsCache(): Promise<{ lists: HubSpotList[]; syncedAt: string | null } | null> {
  const row = await prisma.setting.findUnique({ where: { key: CACHE_KEY } }).catch(() => null)
  if (!row?.value) return null
  try {
    const lists = JSON.parse(row.value) as HubSpotList[]
    const atRow = await prisma.setting.findUnique({ where: { key: CACHE_AT_KEY } }).catch(() => null)
    return { lists, syncedAt: atRow?.value || null }
  } catch {
    return null
  }
}
