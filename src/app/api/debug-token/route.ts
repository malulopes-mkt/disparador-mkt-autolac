export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getSetting } from '@/lib/settings'

export async function GET() {
  const token = await getSetting('META_ACCESS_TOKEN')
  const phoneNumberId = await getSetting('META_PHONE_NUMBER_ID')
  const wabaId = await getSetting('META_WABA_ID')

  const tokenPreview = token
    ? `${token.slice(0, 10)}...${token.slice(-6)} (length: ${token.length})`
    : 'EMPTY'

  const results: Record<string, unknown> = {
    tokenPreview,
    phoneNumberId,
    wabaId,
  }

  // Test 1: Verify token with /me endpoint
  try {
    const meRes = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${token}`)
    const meData = await meRes.json()
    results.tokenCheck = { status: meRes.status, data: meData }
  } catch (err) {
    results.tokenCheck = { error: String(err) }
  }

  // Test 2: Check phone number ID
  try {
    const phoneRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const phoneData = await phoneRes.json()
    results.phoneNumberCheck = { status: phoneRes.status, data: phoneData }
  } catch (err) {
    results.phoneNumberCheck = { error: String(err) }
  }

  // Test 3: Check WABA
  try {
    const wabaRes = await fetch(`https://graph.facebook.com/v21.0/${wabaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const wabaData = await wabaRes.json()
    results.wabaCheck = { status: wabaRes.status, data: wabaData }
  } catch (err) {
    results.wabaCheck = { error: String(err) }
  }

  // Test 4: List templates
  try {
    const templateRes = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/message_templates?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const templateData = await templateRes.json()
    results.templateListCheck = { status: templateRes.status, data: templateData }
  } catch (err) {
    results.templateListCheck = { error: String(err) }
  }

  // Test 5: Check token permissions (debug_token endpoint)
  try {
    const appId = '1692232541924521'
    const debugRes = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${token}&access_token=${token}`)
    const debugData = await debugRes.json()
    results.tokenPermissions = { status: debugRes.status, data: debugData }
  } catch (err) {
    results.tokenPermissions = { error: String(err) }
  }

  // Test 6: Check if app is subscribed to WABA
  try {
    const subRes = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const subData = await subRes.json()
    results.subscribedApps = { status: subRes.status, data: subData }
  } catch (err) {
    results.subscribedApps = { error: String(err) }
  }

  // Test 7: Try to subscribe app to WABA (if not already)
  try {
    const subscribeRes = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const subscribeData = await subscribeRes.json()
    results.subscribeAttempt = { status: subscribeRes.status, data: subscribeData }
  } catch (err) {
    results.subscribeAttempt = { error: String(err) }
  }

  // Test 8: Try actual message send to see exact error
  try {
    const sendBody = {
      messaging_product: 'whatsapp',
      to: '5537991084433',
      type: 'template',
      template: {
        name: 'boas_vindas',
        language: { code: 'pt_BR' },
      },
    }
    const sendRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sendBody),
    })
    const sendData = await sendRes.json()
    results.sendTest = { status: sendRes.status, data: sendData }
  } catch (err) {
    results.sendTest = { error: String(err) }
  }

  return NextResponse.json(results, { status: 200 })
}
