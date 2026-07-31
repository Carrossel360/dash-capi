import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, color } = await req.json()
  const data: { name?: string; color?: string } = {}
  if (typeof name === 'string' && name.trim()) data.name = name.trim()
  if (typeof color === 'string' && color.trim()) data.color = color.trim()

  const result = await prisma.supportTag.updateMany({
    where: { id: params.id, workspaceId: auth.workspaceId },
    data,
  })
  if (result.count === 0) return NextResponse.json({ error: 'Tag não encontrada' }, { status: 404 })

  const tag = await prisma.supportTag.findUnique({ where: { id: params.id } })
  return NextResponse.json(tag)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.supportTag.deleteMany({
    where: { id: params.id, workspaceId: auth.workspaceId },
  })
  return new NextResponse(null, { status: 204 })
}
