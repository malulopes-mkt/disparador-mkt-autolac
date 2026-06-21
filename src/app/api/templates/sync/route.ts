export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncTemplatesFromMeta, extractTemplateBody, extractTemplateVariables, extractHeaderMediaUrl, downloadAndUploadMedia } from '@/lib/whatsapp'

export async function POST() {
  try {
    const metaTemplates = await syncTemplatesFromMeta()
    let synced = 0

    for (const t of metaTemplates) {
      const bodyText = extractTemplateBody(t.components)
      const variables = extractTemplateVariables(bodyText)
      const headerMediaUrl = extractHeaderMediaUrl(t.components)

      const existing = await prisma.template.findUnique({ where: { metaTemplateId: t.id } })

      const keepExistingMedia = existing?.headerMediaUrl?.startsWith('mid:') ?? false
      const resolvedMediaUrl = keepExistingMedia ? existing!.headerMediaUrl : headerMediaUrl

      const record = await prisma.template.upsert({
        where: { metaTemplateId: t.id },
        update: {
          name: t.name,
          language: t.language,
          status: t.status,
          category: t.category,
          bodyText,
          variables: JSON.stringify(variables),
          componentsJson: JSON.stringify(t.components),
          headerMediaUrl: resolvedMediaUrl,
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

      if (record.headerMediaUrl && !record.headerMediaUrl.startsWith('mid:')) {
        try {
          const mediaIdValue = await downloadAndUploadMedia(record.headerMediaUrl)
          await prisma.template.update({
            where: { id: record.id },
            data: { headerMediaUrl: mediaIdValue },
          })
        } catch (uploadErr) {
          console.warn(`[sync] Media upload failed for "${t.name}":`, uploadErr instanceof Error ? uploadErr.message : uploadErr)
        }
      }

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
