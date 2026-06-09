export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendTemplate, TemplateComponent } from '@/lib/whatsapp'
import { findOrCreateContact, createCommunicationNote, getContactDeals } from '@/lib/hubspot'
import { normalizePhone, isInternalPhone } from '@/lib/utils'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

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

    if (!phone) {
      return NextResponse.json({ error: 'No phone provided' }, { status: 400 })
    }

    const normalizedPhone = normalizePhone(phone)

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
      // MODE 1: Direct — HubSpot workflow sends templateName in body
      templateName = directTemplateName
      const dbTemplate = await prisma.template.findFirst({
        where: { name: directTemplateName, status: 'APPROVED' },
      })
      templateBody = dbTemplate?.bodyText || `[Template: ${directTemplateName}]`
      templateLanguage = dbTemplate?.language || directLanguage
      mode = 'direct'

      // Build variables from body if provided
      if (body.variables && typeof body.variables === 'object') {
        const parameters = Object.entries(body.variables as Record<string, string>)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([, value]) => ({ type: 'text' as const, text: String(value) }))
        if (parameters.length > 0) {
          components = [{ type: 'body', parameters }]
        }
      }
    } else {
      // MODE 2: Trigger — match by event type + property
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
        contactName,
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
    if (messageStatus === 'sent' && hubspotContactId) {
      const dealId = await getContactDeals(hubspotContactId).catch(() => null)
      const noteBody = `<p><strong>WhatsApp Template Enviado:</strong> ${templateName}</p><p>Para: ${normalizedPhone}</p>`
      createCommunicationNote(hubspotContactId, noteBody, dealId || undefined).catch(console.error)
    } else if (!hubspotContactId && messageStatus === 'sent') {
      const contact = await findOrCreateContact(normalizedPhone).catch(() => null)
      if (contact) {
        const isPlaceholder = contact.properties.firstname?.startsWith('ContatoWhats')
        await prisma.message.update({
          where: { id: message.id },
          data: {
            hubspotContactId: contact.id,
            contactName: isPlaceholder ? contact.properties.firstname : (contactName || [contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(' ') || null),
          },
        })
        const dealId = await getContactDeals(contact.id).catch(() => null)
        const noteBody = isPlaceholder
          ? `<p><strong>WhatsApp Template Enviado:</strong> ${templateName}</p><p>Para: ${normalizedPhone}</p><p><em>Contato criado automaticamente — revisar dados.</em></p>`
          : `<p><strong>WhatsApp Template Enviado:</strong> ${templateName}</p><p>Para: ${normalizedPhone}</p>`
        createCommunicationNote(contact.id, noteBody, dealId || undefined).catch(console.error)
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
    return NextResponse.json({ error: 'Internal error' }, { status: 200 })
  }
}
