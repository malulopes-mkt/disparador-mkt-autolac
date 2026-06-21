export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSetting } from '@/lib/settings'

const GRAPH_URL = 'https://graph.facebook.com/v21.0'

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action') || 'info'
  const wabaId = await getSetting('META_WABA_ID')
  const accessToken = await getSetting('META_ACCESS_TOKEN')

  if (!wabaId || !accessToken) {
    return NextResponse.json({ error: 'Missing WABA_ID or ACCESS_TOKEN' }, { status: 500 })
  }

  try {
    if (action === 'info') {
      const res = await fetch(
        `${GRAPH_URL}/${wabaId}?fields=id,name,currency,primary_funding_id,purchase_order_number,timezone_id,on_behalf_of_business_info,owning_credit_allocation_configs`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const data = await res.json()
      return NextResponse.json({ status: res.status, data })
    }

    if (action === 'credit_line') {
      const res = await fetch(
        `${GRAPH_URL}/25380302018324894`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const data = await res.json()
      return NextResponse.json({ status: res.status, data })
    }

    if (action === 'payment_method') {
      const res = await fetch(
        `${GRAPH_URL}/${wabaId}?fields=primary_funding_id`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const data = await res.json()
      return NextResponse.json({ status: res.status, data })
    }

    if (action === 'detach_credit') {
      const res = await fetch(
        `${GRAPH_URL}/${wabaId}/assigned_payment_method`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      )
      const data = await res.json()
      return NextResponse.json({ status: res.status, data })
    }

    if (action === 'set_payment') {
      const paymentAccountId = req.nextUrl.searchParams.get('payment_account_id') || '1928108277799576'
      const res = await fetch(
        `${GRAPH_URL}/${wabaId}/assigned_payment_method`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            payment_method: paymentAccountId,
          }),
        }
      )
      const data = await res.json()
      return NextResponse.json({ status: res.status, data })
    }

    return NextResponse.json({ error: 'Unknown action. Use: info, credit_line, payment_method, detach_credit, set_payment' })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
