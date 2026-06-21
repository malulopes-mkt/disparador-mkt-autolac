export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { downloadAndUploadMedia } from '@/lib/whatsapp'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const template = await prisma.template.findUnique({ where: { id } })
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const sourceUrl: string | null = body.imageUrl || template.headerMediaUrl

  if (!sourceUrl) {
    return NextResponse.json({ error: 'No image URL available. Provide imageUrl in the request body.' }, { status: 400 })
  }

  if (sourceUrl.startsWith('mid:')) {
    return NextResponse.json({ ok: true, message: 'Already using media ID', headerMediaUrl: sourceUrl })
  }

  try {
    const mediaIdValue = await downloadAndUploadMedia(sourceUrl)

    await prisma.template.update({
      where: { id },
      data: { headerMediaUrl: mediaIdValue },
    })

    return NextResponse.json({ ok: true, headerMediaUrl: mediaIdValue })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
