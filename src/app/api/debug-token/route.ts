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

  // Test 4: Try sending a test template (dry check - just check if endpoint responds)
  try {
    const templateRes = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/message_templates?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const templateData = await templateRes.json()
    results.templateListCheck = { status: templateRes.status, data: templateData }
  } catch (err) {
    results.templateListCheck = { error: String(err) }
  }

  return NextResponse.json(results, { status: 200 })
}
