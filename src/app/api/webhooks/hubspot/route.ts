export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { sendTemplate, buildHeaderComponent, TemplateComponent } from '@/lib/whatsapp'
import { findOrCreateContact, createCommunicationNote, getContactById } from '@/lib/hubspot'
import { normalizePhone, isInternalPhone } from '@/lib/utils'
import { getSetting } from '@/lib/settings'

const MAX_BODY_SIZE = 1_000_000
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000

function timingSafeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

async function verifyHubSpotSignatureV3(
  rawBody: string,
  req: NextRequest
): Promise<boolean> {
  const signatureHeader = req.headers.get('x-hubspot-signature-v3')
  const timestampHeader = req.headers.get('x-hubspot-request-timestamp')
  if (!signatureHeader || !timestampHeader) return false

  const timestamp = Number(timestampHeader)
  if (isNaN(timestamp) || Date.now() - timestamp > MAX_TIMESTAMP_AGE_MS) return false

  const clientSecret = await getSetting('HUBSPOT_CLIENT_SECRET')
  if (!clientSecret) {
    console.error('HUBSPOT_CLIENT_SECRET not configured')
    return false
  }

  const protocol = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  const path = req.nextUrl.pathname + req.nextUrl.search
  const requestUri = `${protocol}://${host}${path}`

  const sourceString = req.method + requestUri + rawBody + timestampHeader
  const expectedSignature = crypto
    .createHmac('sha256', clientSecret)
    .update(sourceString, 'utf-8')
    .digest('base64')

  return timingSafeCompare(expectedSignature, signatureHeader)
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

  const hasHubSpotHeaders = req.headers.has('x-hubspot-signature-v3')
  const hasN8NHeader = req.headers.has('x-webhook-token')

  let authenticated = false
  if (hasHubSpotHeaders) {
    authenticated = await verifyHubSpotSignatureV3(rawBody, req)
  } else if (hasN8NHeader) {
    authenticated = await verifyN8NToken(req)
  }

  if (!authenticated) {
    console.error('Webhook auth failed — missing or invalid credentials')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = JSON.parse(rawBody)

    // --- Extract fields from HubSpot workflow payload ---
    const phone = body.phone || body.hs_calculated_phone_number || body.mobilephone || ''
    const contactName = body.firstname || body.contact_name || null
    const hubspotContactId = body.objectId ? String(body.objectId) : body.contactId || null

    // Direct mode: templateName sent directly from HubSpot workflow
    const directTemplateName = body.templateName || body.template_name || null
    const directLanguage = body.language || 'pt_BR'

    // Trigger mode: match by event type + property
    const eventType = body.eventType || body.event_type || 'custom'
    const propertyName = body.propertyName || body.property_name || ''
    const propertyValue = body.propertyValue || body.property_value || ''

    let resolvedPhone = phone
    let resolvedName = contactName

    let debugInfo: string | null = null
    if (!resolvedPhone && hubspotContactId) {
      const contact = await getContactById(hubspotContactId)
      if (contact) {
        resolvedPhone = contact.properties.phone || contact.properties.mobilephone || contact.properties.hs_whatsapp_phone_number || ''
        if (!resolvedName) {
          resolvedName = [contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(' ') || null
        }
        if (!resolvedPhone) {
          debugInfo = `Contact ${hubspotContactId} found but no phone fields: ${JSON.stringify(contact.properties)}`
        }
      } else {
        debugInfo = `getContactById(${hubspotContactId}) returned null — HubSpot API call failed (check HUBSPOT_ACCESS_TOKEN)`
      }
    }

    if (!resolvedPhone) {
      return NextResponse.json({
        error: 'No phone provided and could not resolve from HubSpot contact',
        debug: debugInfo,
        receivedFields: { phone, contactName, hubspotContactId, objectId: body.objectId },
      }, { status: 400 })
    }

    const normalizedPhone = normalizePhone(resolvedPhone)

    if (await isInternalPhone(normalizedPhone)) {
      return NextResponse.json({ ok: true, skipped: 'internal_phone' })
    }

    // --- Resolve which template to send ---
    let templateName: string | null = null
    let templateBody: string | null = null
    let templateLanguage = directLanguage
    let triggerId: string | null = null
    let triggerName: string | null = null
    let components: TemplateComponent[] | undefined
    let mode: 'direct' | 'trigger' = 'direct'

    if (directTemplateName) {
      templateName = directTemplateName
      const dbTemplate = await prisma.template.findFirst({
        where: { name: directTemplateName, status: 'APPROVED' },
      })
      templateBody = dbTemplate?.bodyText || `[Template: ${directTemplateName}]`
      templateLanguage = dbTemplate?.language || directLanguage
      mode = 'direct'

      if (body.variables && typeof body.variables === 'object') {
        const parameters = Object.entries(body.variables as Record<string, string>)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([, value]) => ({ type: 'text' as const, text: String(value) }))
        if (parameters.length > 0) {
          components = [{ type: 'body', parameters }]
        }
      }

      if (dbTemplate) {
        const headerComp = buildHeaderComponent(dbTemplate.componentsJson, dbTemplate.headerMediaUrl)
        if (headerComp) {
          components = components ? [headerComp, ...components] : [headerComp]
        }
      }
    } else {
      const triggers = await prisma.trigger.findMany({
        where: { active: true, hubspotEventType: eventType },
      })

      const matchedTrigger = triggers.find(t => {
        if (t.hubspotProperty && t.hubspotValue) {
          return t.hubspotProperty === propertyName && t.hubspotValue === propertyValue
        }
        if (t.hubspotProperty) {
          return t.hubspotProperty === propertyName
        }
        return true
      })

      if (!matchedTrigger) {
        return NextResponse.json({ ok: true, matched: false, hint: 'No trigger matched. You can send templateName directly in the webhook body.' })
      }

      templateName = matchedTrigger.templateName
      triggerId = matchedTrigger.id
      triggerName = matchedTrigger.name
      mode = 'trigger'

      const dbTemplate = await prisma.template.findFirst({
        where: { name: matchedTrigger.templateName, status: 'APPROVED' },
      })
      templateBody = dbTemplate?.bodyText || `[Template: ${matchedTrigger.templateName}]`
      templateLanguage = dbTemplate?.language || 'pt_BR'

      if (matchedTrigger.variableMapping && matchedTrigger.variableMapping !== '{}') {
        try {
          const mapping = JSON.parse(matchedTrigger.variableMapping) as Record<string, string>
          const parameters = Object.entries(mapping)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([, hubspotProp]) => ({
              type: 'text' as const,
              text: String(body[hubspotProp] || ''),
            }))
          if (parameters.length > 0) {
            components = [{ type: 'body', parameters }]
          }
        } catch { /* ignore bad JSON */ }
      }

      if (dbTemplate) {
        const headerComp = buildHeaderComponent(dbTemplate.componentsJson, dbTemplate.headerMediaUrl)
        if (headerComp) {
          components = components ? [headerComp, ...components] : [headerComp]
        }
      }
    }

    // --- Send WhatsApp template ---
    let messageStatus = 'sent'
    let waMessageId: string | null = null
    let failReason: string | null = null

    try {
      const result = await sendTemplate(
        normalizedPhone,
        templateName!,
        templateLanguage,
        components
      )
      waMessageId = result.messages?.[0]?.id || null
    } catch (err) {
      messageStatus = 'failed'
      failReason = err instanceof Error ? err.message : String(err)
    }

    // --- Record message in database ---
    const message = await prisma.message.create({
      data: {
        contactPhone: normalizedPhone,
        contactName: resolvedName,
        direction: 'outbound',
        templateName,
        body: templateBody || `[Template: ${templateName}]`,
        status: messageStatus,
        failReason,
        hubspotContactId,
        triggerId,
        waMessageId,
      },
    })

    // --- Create HubSpot communication note ---
    const bodyText = templateBody || `[Template: ${templateName}]`
    if (messageStatus === 'sent' && hubspotContactId) {
      const noteBody = `<p><strong>WhatsApp Template Enviado:</strong> ${templateName}</p><p>Para: ${normalizedPhone}</p><hr/><p>${bodyText}</p>`
      createCommunicationNote(hubspotContactId, noteBody).catch(console.error)
    } else if (!hubspotContactId && messageStatus === 'sent') {
      const contact = await findOrCreateContact(normalizedPhone).catch(() => null)
      if (contact) {
        const isPlaceholder = contact.properties.firstname?.startsWith('ContatoWhats')
        await prisma.message.update({
          where: { id: message.id },
          data: {
            hubspotContactId: contact.id,
            contactName: isPlaceholder ? contact.properties.firstname : (resolvedName || [contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(' ') || null),
          },
        })
        const noteBody = isPlaceholder
          ? `<p><strong>WhatsApp Template Enviado:</strong> ${templateName}</p><p>Para: ${normalizedPhone}</p><p><em>Contato criado automaticamente — revisar dados.</em></p><hr/><p>${bodyText}</p>`
          : `<p><strong>WhatsApp Template Enviado:</strong> ${templateName}</p><p>Para: ${normalizedPhone}</p><hr/><p>${bodyText}</p>`
        createCommunicationNote(contact.id, noteBody).catch(console.error)
      }
    }

    return NextResponse.json({
      ok: true,
      mode,
      templateName,
      trigger: triggerName,
      status: messageStatus,
      messageId: message.id,
    })
  } catch (err) {
    console.error('HubSpot webhook error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
