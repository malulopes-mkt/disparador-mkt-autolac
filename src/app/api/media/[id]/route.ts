export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { downloadMedia } from '@/lib/whatsapp'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Missing media id' }, { status: 400 })
  }

  const result = await downloadMedia(id)
  if (!result) {
    return NextResponse.json({ error: 'Media not found or expired' }, { status: 404 })
  }

  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      'Content-Type': result.mimeType,
      'Cache-Control': 'private, max-age=86400',
    },
  })
}
