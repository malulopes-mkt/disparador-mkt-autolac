import { generatePhoneVariants } from './utils'
import { getSetting } from './settings'

const HUBSPOT_API = 'https://api.hubapi.com'

async function getToken() {
  return await getSetting('HUBSPOT_ACCESS_TOKEN')
}

async function headers() {
  const token = await getToken()
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

export interface HubSpotContact {
  id: string
  properties: Record<string, string | null>
}

export async function searchContactByPhone(phone: string): Promise<HubSpotContact | null> {
  const variants = generatePhoneVariants(phone)
  const filterGroups: Record<string, unknown>[] = []

  for (const variant of variants) {
    const searchDigits = variant.replace('+', '')
    for (const prop of ['phone', 'mobilephone', 'hs_whatsapp_phone_number']) {
      filterGroups.push({
        filters: [{ propertyName: prop, operator: 'CONTAINS_TOKEN', value: searchDigits }],
      })
    }
  }

  const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts/search`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({
      filterGroups,
      properties: ['firstname', 'lastname', 'phone', 'mobilephone', 'hubspot_owner_id', 'email'],
      limit: 1,
    }),
  })

  if (!res.ok) return null
  const data = await res.json()
  return data.results?.[0] || null
}

export async function createCommunicationNote(
  contactId: string,
  body: string,
  dealId?: string
): Promise<string | null> {
  const associations: Record<string, unknown>[] = [
    {
      to: { id: contactId },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 81 }],
    },
  ]

  if (dealId) {
    associations.push({
      to: { id: dealId },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 85 }],
    })
  }

  const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/communications`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({
      properties: {
        hs_communication_channel_type: 'WHATS_APP',
        hs_communication_body: body,
        hs_communication_logged_from: 'CRM',
        hs_timestamp: String(Date.now()),
      },
      associations,
    }),
  })

  if (!res.ok) {
    console.error('HubSpot communication error:', await res.text())
    return null
  }
  const data = await res.json()
  return data.id
}

export async function createPlaceholderContact(phone: string): Promise<HubSpotContact | null> {
  const existing = await prisma_countPlaceholders()
  const placeholderName = `ContatoWhats${String(existing + 1).padStart(2, '0')}`

  const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({
      properties: {
        firstname: placeholderName,
        phone: phone,
        mobilephone: phone,
        hs_whatsapp_phone_number: phone,
      },
    }),
  })

  if (!res.ok) {
    console.error('HubSpot create contact error:', await res.text())
    return null
  }
  const data = await res.json()
  return { id: data.id, properties: data.properties }
}

async function prisma_countPlaceholders(): Promise<number> {
  try {
    const { prisma } = await import('./db')
    const count = await prisma.message.groupBy({
      by: ['contactPhone'],
      where: { contactName: { startsWith: 'ContatoWhats' } },
    })
    return count.length
  } catch {
    return 0
  }
}

export async function findOrCreateContact(phone: string): Promise<HubSpotContact | null> {
  const existing = await searchContactByPhone(phone)
  if (existing) return existing
  return createPlaceholderContact(phone)
}

export async function getContactById(contactId: string): Promise<HubSpotContact | null> {
  const token = await getToken()
  if (!token) {
    console.error('getContactById: HUBSPOT_ACCESS_TOKEN is empty/missing')
    return null
  }
  const props = ['firstname', 'lastname', 'phone', 'mobilephone', 'hs_whatsapp_phone_number', 'email'].join(',')
  const url = `${HUBSPOT_API}/crm/v3/objects/contacts/${contactId}?properties=${props}`
  const res = await fetch(url, { headers: await headers() })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    console.error(`getContactById(${contactId}) failed: HTTP ${res.status} — ${errBody}`)
    return null
  }
  const data = await res.json()
  return { id: data.id, properties: data.properties }
}

export async function getContactDeals(contactId: string): Promise<string | null> {
  const res = await fetch(
    `${HUBSPOT_API}/crm/v4/objects/contacts/${contactId}/associations/deals`,
    { headers: await headers() }
  )
  if (!res.ok) return null
  const data = await res.json()
  return data.results?.[0]?.toObjectId || null
}
