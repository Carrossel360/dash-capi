import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const carousels = await prisma.carousel.findMany({
    where: { workspaceId: auth.workspaceId },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json(carousels)
}

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, format, slides } = await req.json()

  if (!title || !slides) {
    return NextResponse.json({ error: 'title e slides são obrigatórios' }, { status: 400 })
  }

  const carousel = await prisma.carousel.create({
    data: {
      workspaceId: auth.workspaceId,
      title,
      format: format === 'story' ? 'story' : 'square',
      slides,
    },
  })

  return NextResponse.json(carousel, { status: 201 })
}
