export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const ALLOWED_KEYS = [
  'META_PHONE_NUMBER_ID',
  'META_WABA_ID',
  'META_ACCESS_TOKEN',
  'META_WEBHOOK_VERIFY_TOKEN',
  'HUBSPOT_ACCESS_TOKEN',
  'CLAUDE_API_KEY',
  'INTERNAL_PHONES',
  'APP_PASSWORD',
]

export async function GET() {
  const settings = await prisma.setting.findMany()
  const map: Record<string, string> = {}
  for (const s of settings) {
    // Mask sensitive values for display
    if (['META_ACCESS_TOKEN', 'HUBSPOT_ACCESS_TOKEN', 'CLAUDE_API_KEY', 'APP_PASSWORD'].includes(s.key) && s.value) {
      map[s.key] = s.value.length > 8
        ? s.value.slice(0, 4) + '****' + s.value.slice(-4)
        : '****'
    } else {
      map[s.key] = s.value
    }
  }

  // Fill missing keys with env var fallback (masked)
  for (const key of ALLOWED_KEYS) {
    if (!map[key]) {
      const envVal = process.env[key]
      if (envVal && envVal !== 'placeholder') {
        if (['META_ACCESS_TOKEN', 'HUBSPOT_ACCESS_TOKEN', 'CLAUDE_API_KEY', 'APP_PASSWORD'].includes(key)) {
          map[key] = envVal.length > 8 ? envVal.slice(0, 4) + '****' + envVal.slice(-4) : '****'
        } else {
          map[key] = envVal
        }
        map[key + '_SOURCE'] = 'env'
      } else {
        map[key] = ''
      }
    }
  }

  return NextResponse.json(map)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const updates: { key: string; value: string }[] = []

  for (const key of ALLOWED_KEYS) {
    if (body[key] !== undefined && body[key] !== null) {
      const value = String(body[key]).trim()
      // Don't save masked values (user didn't change them)
      if (value.includes('****')) continue
      if (value === '') continue
      updates.push({ key, value })
    }
  }

  for (const { key, value } of updates) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    })
  }

  return NextResponse.json({ ok: true, updated: updates.length })
}
