export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { getSetting } from '@/lib/settings'
import { sendOpenAIConversion, hashEmail, ConversionEventType } from '@/lib/conversions'

const MAX_BODY_SIZE = 100_000
const PLATFORM = 'openai'

const VALID_EVENT_TYPES: ConversionEventType[] = [
  'lead_created',
  'registration_completed',
  'appointment_scheduled',
]

function timingSafeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

async function verifyN8NToken(req: NextRequest): Promise<boolean> {
  const tokenHeader = req.headers.get('x-webhook-token')
  if (!tokenHeader) return false

  const expectedToken = await getSetting('N8N_WEBHOOK_TOKEN')
  if (!expectedToken) {
    console.error('N8N_WEBHOOK_TOKEN not configured')
    return false
  }

  return timingSafeCompare(expectedToken, tokenHeader)
}

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get('content-length') || 0)
  if (contentLength > MAX_BODY_SIZE) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  const rawBody = await req.text()
  if (rawBody.length > MAX_BODY_SIZE) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  if (!(await verifyN8NToken(req))) {
    console.error('Conversions webhook auth failed — missing or invalid token')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = JSON.parse(rawBody)

    const email: string | null = body.email || null
    const obref: string | null = body.obref || body.__obref || null
    const hubspotContactId: string | null = body.hubspotContactId
      ? String(body.hubspotContactId)
      : body.objectId
        ? String(body.objectId)
        : null

    if (!obref && !email && !hubspotContactId) {
      return NextResponse.json(
        { error: 'Need at least one of: obref, email, hubspotContactId' },
        { status: 400 }
      )
    }

    const requestedType = body.eventType || body.event_type
    const eventType: ConversionEventType = VALID_EVENT_TYPES.includes(requestedType)
      ? requestedType
      : 'lead_created'

    // Deterministic so a retried webhook reuses the same id and OpenAI dedupes it
    // instead of double-counting the conversion.
    const eventId: string =
      body.eventId ||
      `${eventType}-${hubspotContactId || (email ? hashEmail(email).slice(0, 16) : obref)}`

    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date()
    const validateOnly = Boolean(body.validateOnly || req.nextUrl.searchParams.get('validate'))

    // --- Dedupe against events we already delivered ---
    const existing = await prisma.conversionEvent.findUnique({
      where: { platform_eventId: { platform: PLATFORM, eventId } },
    })

    if (existing?.status === 'sent') {
      return NextResponse.json({ ok: true, skipped: 'already_sent', eventId })
    }

    const record = existing
      ? await prisma.conversionEvent.update({
          where: { id: existing.id },
          data: { attempts: { increment: 1 } },
        })
      : await prisma.conversionEvent.create({
          data: {
            platform: PLATFORM,
            eventId,
            eventType,
            hubspotContactId,
            obref,
            emailHash: email ? hashEmail(email) : null,
            attempts: 1,
            occurredAt,
          },
        })

    const result = await sendOpenAIConversion({
      eventId,
      eventType,
      obref,
      email,
      externalId: hubspotContactId,
      occurredAt,
      amount: typeof body.amount === 'number' ? body.amount : null,
      currency: body.currency || null,
      clientIp: body.clientIp || null,
      userAgent: body.userAgent || null,
      validateOnly,
    })

    await prisma.conversionEvent.update({
      where: { id: record.id },
      data: {
        // A validation run proves the payload is accepted but records nothing
        // upstream, so it must not mark the event as delivered.
        status: result.ok ? (validateOnly ? 'validated' : 'sent') : 'failed',
        failReason: result.ok ? null : `${result.status}: ${result.body}`.slice(0, 500),
      },
    })

    if (!result.ok) {
      console.error('OpenAI conversion failed:', result.status, result.body)
      return NextResponse.json(
        { ok: false, eventId, status: result.status, error: result.body },
        { status: 502 }
      )
    }

    return NextResponse.json({ ok: true, eventId, eventType, validateOnly })
  } catch (err) {
    console.error('Conversions webhook error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
