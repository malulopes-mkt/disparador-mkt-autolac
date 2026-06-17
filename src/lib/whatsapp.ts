import { getSetting } from './settings'
import crypto from 'crypto'

const GRAPH_URL = 'https://graph.facebook.com/v21.0'

async function getConfig() {
  return {
    phoneNumberId: await getSetting('META_PHONE_NUMBER_ID'),
    wabaId: await getSetting('META_WABA_ID'),
    accessToken: await getSetting('META_ACCESS_TOKEN'),
    verifyToken: await getSetting('META_WEBHOOK_VERIFY_TOKEN'),
  }
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button'
  parameters: { type: 'text'; text: string }[]
}

export interface SendResult {
  messaging_product: string
  contacts: { input: string; wa_id: string }[]
  messages: { id: string }[]
}

export async function sendText(
  to: string,
  text: string
): Promise<SendResult> {
  const { phoneNumberId, accessToken } = await getConfig()
  const digits = to.replace(/\D/g, '')

  const body = {
    messaging_product: 'whatsapp',
    to: digits,
    type: 'text',
    text: { body: text },
  }

  const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Meta API error ${res.status}: ${JSON.stringify(err)}`)
  }

  return res.json()
}

export async function sendTemplate(
  to: string,
  templateName: string,
  languageCode: string = 'pt_BR',
  components?: TemplateComponent[]
): Promise<SendResult> {
  const { phoneNumberId, accessToken } = await getConfig()
  const digits = to.replace(/\D/g, '')

  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to: digits,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components?.length ? { components } : {}),
    },
  }

  const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Meta API error ${res.status}: ${JSON.stringify(err)}`)
  }

  return res.json()
}

export interface MetaTemplate {
  id: string
  name: string
  language: string
  status: string
  category: string
  components: { type: string; text?: string }[]
}

export async function syncTemplatesFromMeta(): Promise<MetaTemplate[]> {
  const { wabaId, accessToken } = await getConfig()
  const templates: MetaTemplate[] = []
  let url: string | null = `${GRAPH_URL}/${wabaId}/message_templates?limit=100`

  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`Meta API error ${res.status}: ${JSON.stringify(err)}`)
    }
    const data: { data?: MetaTemplate[]; paging?: { next?: string } } = await res.json()
    templates.push(...(data.data || []))
    url = data.paging?.next || null
  }

  return templates
}

export function extractTemplateBody(components: { type: string; text?: string }[]): string {
  const bodyComponent = components.find(c => c.type === 'BODY')
  return bodyComponent?.text || ''
}

export function extractTemplateVariables(bodyText: string): string[] {
  const matches = bodyText.match(/\{\{\d+\}\}/g) || []
  return matches
}

export async function verifyWebhook(params: URLSearchParams): Promise<string | null> {
  const { verifyToken } = await getConfig()
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')

  if (mode === 'subscribe' && challenge && token && verifyToken) {
    // Bloqueante #6: timingSafeEqual em vez de === para evitar timing attack
    const tokenBuf = Buffer.from(token)
    const verifyBuf = Buffer.from(verifyToken)
    if (tokenBuf.length === verifyBuf.length && crypto.timingSafeEqual(tokenBuf, verifyBuf)) {
      return challenge
    }
  }
  return null
}

// Bloqueante #1: Validação HMAC X-Hub-Signature-256 do webhook POST
export async function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader) return false

  const appSecret = await getSetting('META_APP_SECRET')
  if (!appSecret) {
    console.error('META_APP_SECRET not configured — cannot verify webhook signature')
    return false
  }

  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf-8')
    .digest('hex')

  const expectedBuf = Buffer.from(expectedSignature)
  const receivedBuf = Buffer.from(signatureHeader)

  if (expectedBuf.length !== receivedBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, receivedBuf)
}

export interface IncomingMessage {
  from: string
  id: string
  timestamp: string
  type: string
  text?: { body: string }
}

export interface StatusUpdate {
  id: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string
  recipient_id: string
  errors?: { code: number; title: string }[]
}

export interface WABAAnalytics {
  dataPoints: {
    start: number
    end: number
    sent: number
    delivered: number
  }[]
}

export interface TemplateAnalyticsPoint {
  templateId: string
  templateName: string
  sent: number
  delivered: number
  read: number
  clicked: number[]
}

export interface TemplateAnalytics {
  dataPoints: TemplateAnalyticsPoint[]
}

export async function getWABAAnalytics(
  startDate: Date,
  endDate: Date,
  granularity: 'HALF_HOUR' | 'DAY' | 'MONTH' = 'DAY'
): Promise<WABAAnalytics | null> {
  const { wabaId, accessToken } = await getConfig()
  if (!wabaId || !accessToken) return null

  const startUnix = Math.floor(startDate.getTime() / 1000)
  const endUnix = Math.floor(endDate.getTime() / 1000)

  const url = `${GRAPH_URL}/${wabaId}?fields=analytics.start(${startUnix}).end(${endUnix}).granularity(${granularity})&access_token=${accessToken}`
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('Meta Analytics error:', res.status, err)
    return null
  }

  const data = await res.json()
  const analytics = data?.analytics

  if (!analytics?.data_points) return { dataPoints: [] }

  return {
    dataPoints: analytics.data_points.map((dp: Record<string, unknown>) => ({
      start: dp.start,
      end: dp.end,
      sent: dp.sent || 0,
      delivered: dp.delivered || 0,
    })),
  }
}

export async function getTemplateAnalytics(
  startDate: Date,
  endDate: Date,
  templateIds?: string[]
): Promise<TemplateAnalytics | null> {
  const { wabaId, accessToken } = await getConfig()
  if (!wabaId || !accessToken) return null

  const startUnix = Math.floor(startDate.getTime() / 1000)
  const endUnix = Math.floor(endDate.getTime() / 1000)

  let fields = `template_analytics.start(${startUnix}).end(${endUnix}).granularity(DAILY).metric_types(sent,delivered,read,clicked)`
  if (templateIds?.length) {
    fields += `.template_ids(${templateIds.join(',')})`
  }

  const url = `${GRAPH_URL}/${wabaId}?fields=${fields}&access_token=${accessToken}`
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('Meta Template Analytics error:', res.status, err)
    return null
  }

  const data = await res.json()
  const dataPoints = data?.template_analytics?.data?.[0]?.data_points

  if (!dataPoints?.length) {
    console.log('Template analytics raw response:', JSON.stringify(data).slice(0, 500))
    return { dataPoints: [] }
  }

  // Aggregate daily data points per template
  const byTemplate = new Map<string, { sent: number; delivered: number; read: number; clicked: number[] }>()
  for (const dp of dataPoints) {
    const id = String(dp.template_id || '')
    const existing = byTemplate.get(id) || { sent: 0, delivered: 0, read: 0, clicked: [] }
    existing.sent += Number(dp.sent || 0)
    existing.delivered += Number(dp.delivered || 0)
    existing.read += Number(dp.read || 0)
    if (Array.isArray(dp.clicked)) existing.clicked.push(...dp.clicked)
    byTemplate.set(id, existing)
  }

  return {
    dataPoints: Array.from(byTemplate.entries()).map(([id, agg]) => ({
      templateId: id,
      templateName: '',
      sent: agg.sent,
      delivered: agg.delivered,
      read: agg.read,
      clicked: agg.clicked,
    })),
  }
}

export function parseWebhookPayload(body: Record<string, unknown>): {
  messages: IncomingMessage[]
  statuses: StatusUpdate[]
} {
  const messages: IncomingMessage[] = []
  const statuses: StatusUpdate[] = []

  const entries = (body.entry as Array<Record<string, unknown>>) || []
  for (const entry of entries) {
    const changes = (entry.changes as Array<Record<string, unknown>>) || []
    for (const change of changes) {
      const value = change.value as Record<string, unknown> | undefined
      if (!value) continue
      const msgs = (value.messages as IncomingMessage[]) || []
      messages.push(...msgs)
      const sts = (value.statuses as StatusUpdate[]) || []
      statuses.push(...sts)
    }
  }

  return { messages, statuses }
}
