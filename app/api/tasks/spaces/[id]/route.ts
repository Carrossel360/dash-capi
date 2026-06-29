import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, color, icon } = await req.json()
  await prisma.taskSpace.updateMany({
    where: { id: params.id, workspaceId: auth.workspaceId },
    data: { ...(name && { name }), ...(color && { color }), ...(icon !== undefined && { icon }) },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.taskSpace.deleteMany({ where: { id: params.id, workspaceId: auth.workspaceId } })
  return NextResponse.json({ ok: true })
}
