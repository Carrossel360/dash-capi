import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const carousel = await prisma.carousel.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
  })
  if (!carousel) return NextResponse.json({ error: 'Carrossel não encontrado' }, { status: 404 })

  return NextResponse.json(carousel)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, format, slides } = await req.json()

  const carousel = await prisma.carousel.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
  })
  if (!carousel) return NextResponse.json({ error: 'Carrossel não encontrado' }, { status: 404 })

  const updated = await prisma.carousel.update({
    where: { id: params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(format !== undefined && { format: format === 'story' ? 'story' : 'square' }),
      ...(slides !== undefined && { slides }),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const carousel = await prisma.carousel.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
  })
  if (!carousel) return NextResponse.json({ error: 'Carrossel não encontrado' }, { status: 404 })

  await prisma.carousel.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
