import { getSetting } from './settings'

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
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`Meta API error ${res.status}: ${JSON.stringify(err)}`)
    }
    const data = await res.json()
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

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return challenge
  }
  return null
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
