export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncTemplatesFromMeta, extractTemplateBody, extractTemplateVariables, extractHeaderMediaUrl } from '@/lib/whatsapp'

export async function POST() {
  try {
    const metaTemplates = await syncTemplatesFromMeta()
    let synced = 0

    for (const t of metaTemplates) {
      const bodyText = extractTemplateBody(t.components)
      const variables = extractTemplateVariables(bodyText)
      const headerMediaUrl = extractHeaderMediaUrl(t.components)

      const existing = await prisma.template.findUnique({ where: { metaTemplateId: t.id } })

      await prisma.template.upsert({
        where: { metaTemplateId: t.id },
        update: {
          name: t.name,
          language: t.language,
          status: t.status,
          category: t.category,
          bodyText,
          variables: JSON.stringify(variables),
          componentsJson: JSON.stringify(t.components),
          headerMediaUrl: existing?.headerMediaUrl || headerMediaUrl,
          lastSyncedAt: new Date(),
        },
        create: {
          metaTemplateId: t.id,
          name: t.name,
          language: t.language,
          status: t.status,
          category: t.category,
          bodyText,
          variables: JSON.stringify(variables),
          componentsJson: JSON.stringify(t.components),
          headerMediaUrl,
        },
      })
      synced++
    }

    return NextResponse.json({ ok: true, synced })
  } catch (err) {
    console.error('Template sync error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
