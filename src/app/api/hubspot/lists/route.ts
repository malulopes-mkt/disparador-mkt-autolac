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
    const lists: { listId: string; name: string; listType: string; size: number }[] = []
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    let after: string | undefined

    while (true) {
      const url = `${HUBSPOT_API}/crm/v3/lists?count=250${after ? `&after=${after}` : ''}`
      const res = await fetch(url, { headers })

      if (!res.ok) {
        const err = await res.text()
        return NextResponse.json({ error: `HubSpot API error: ${res.status}`, detail: err }, { status: res.status })
      }

      const data = await res.json()
      for (const list of data.lists || []) {
        lists.push({
          listId: String(list.listId),
          name: list.name,
          listType: list.processingType === 'MANUAL' ? 'STATIC' : 'DYNAMIC',
          size: list.size || 0,
        })
      }

      if (!data.paging?.next?.after) break
      after = data.paging.next.after
    }

    lists.sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json(lists)
  } catch (err) {
    console.error('HubSpot lists error:', err)
    return NextResponse.json({ error: 'Failed to fetch lists' }, { status: 500 })
  }
}
