import crypto from 'crypto'
import { getSetting } from './settings'

const OPENAI_ADS_ENDPOINT = 'https://bzr.openai.com/v1/events'

// OpenAI rejects events older than 7 days or more than 10 minutes in the future.
const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_EVENT_FUTURE_MS = 10 * 60 * 1000

export type ConversionEventType =
  | 'lead_created'
  | 'registration_completed'
  | 'appointment_scheduled'

export interface ConversionInput {
  /** Stable id — reuse on retries and on the browser pixel so OpenAI dedupes. */
  eventId: string
  eventType?: ConversionEventType
  /** __obref cookie value dropped by the pixel on the landing page. Unhashed. */
  obref?: string | null
  email?: string | null
  /** HubSpot contact id, sent as external_id. */
  externalId?: string | null
  occurredAt?: Date
  /** Deal value in minor units (cents). Requires currency. */
  amount?: number | null
  currency?: string | null
  clientIp?: string | null
  userAgent?: string | null
  /** Sends the event for validation without recording it. */
  validateOnly?: boolean
}

export interface ConversionResult {
  ok: boolean
  status: number
  body: string
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf-8').digest('hex')
}

/** OpenAI expects the email trimmed and lowercased before hashing. */
export function hashEmail(email: string): string {
  return sha256Hex(email.trim().toLowerCase())
}

function clampTimestamp(date: Date): number {
  const now = Date.now()
  const ts = date.getTime()
  if (ts > now + MAX_EVENT_FUTURE_MS) return now
  if (ts < now - MAX_EVENT_AGE_MS) return now - MAX_EVENT_AGE_MS + 60_000
  return ts
}

/**
 * Sends a single conversion to the OpenAI Ads Conversions API.
 *
 * This exists because the landing page redirects to WhatsApp on submit and the
 * redirect wins the race against the browser pixel — the event never fires.
 * Firing it server-side once the lead lands in HubSpot removes that race.
 */
export async function sendOpenAIConversion(input: ConversionInput): Promise<ConversionResult> {
  const pixelId = await getSetting('OPENAI_ADS_PIXEL_ID')
  const apiKey = await getSetting('OPENAI_ADS_API_KEY')

  if (!pixelId || !apiKey) {
    return { ok: false, status: 0, body: 'OPENAI_ADS_PIXEL_ID or OPENAI_ADS_API_KEY not configured' }
  }

  const user: Record<string, string> = {}
  if (input.obref) user.obref = input.obref
  if (input.email) user.email_sha256 = hashEmail(input.email)
  if (input.externalId) user.external_id_sha256 = sha256Hex(String(input.externalId))
  if (input.clientIp) user.ip_address = input.clientIp
  if (input.userAgent) user.user_agent = input.userAgent

  // Without obref or a hashed identifier OpenAI has nothing to attribute the
  // conversion to, so the call would burn quota for an event that never matches.
  if (!user.obref && !user.email_sha256 && !user.external_id_sha256) {
    return { ok: false, status: 0, body: 'No matching identifier (obref, email or external id)' }
  }

  const data: Record<string, unknown> = { type: 'customer_action' }
  if (typeof input.amount === 'number') {
    data.amount = Math.round(input.amount)
    data.currency = input.currency || 'BRL'
  }

  const payload = {
    validate_only: Boolean(input.validateOnly),
    events: [
      {
        id: input.eventId,
        type: input.eventType || 'lead_created',
        timestamp_ms: clampTimestamp(input.occurredAt || new Date()),
        action_source: 'web',
        user,
        data,
      },
    ],
  }

  const url = `${OPENAI_ADS_ENDPOINT}?pid=${encodeURIComponent(pixelId)}`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    return { ok: false, status: 0, body: err instanceof Error ? err.message : String(err) }
  }

  const body = await res.text()
  return { ok: res.ok, status: res.status, body }
}
