import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Public endpoint — no auth required (URL acts as the access token via random cuid)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const file = await prisma.mediaFile.findUnique({ where: { id: params.id } })
  if (!file) return new NextResponse('Not found', { status: 404 })

  // data is stored as a data URL: "data:image/jpeg;base64,..."
  const [header, base64] = file.data.split(',')
  const mimeMatch = header?.match(/data:([^;]+)/)
  const mime = mimeMatch?.[1] ?? 'application/octet-stream'
  const buffer = Buffer.from(base64 ?? '', 'base64')

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':  mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
