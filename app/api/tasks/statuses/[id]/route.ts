import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const current = await prisma.taskStatus.findFirst({ where: { id: params.id, workspaceId: auth.workspaceId } })
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const status = await prisma.taskStatus.update({
    where: { id: current.id },
    data: {
      ...(body.name?.trim() ? { name: body.name.trim() } : {}),
      ...(body.color ? { color: body.color } : {}),
      ...(body.category ? { category: body.category } : {}),
      ...(Number.isInteger(body.position) ? { position: body.position } : {}),
    },
  })
  return NextResponse.json({ status })
}
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const replacementKey = req.nextUrl.searchParams.get('replacementKey')
  const current = await prisma.taskStatus.findFirst({ where: { id: params.id, workspaceId: auth.workspaceId } })
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const taskCount = await prisma.task.count({ where: { workspaceId: auth.workspaceId, status: current.key } })
  if (taskCount && !replacementKey) return NextResponse.json({ error: 'replacementKey required', taskCount }, { status: 409 })
  await prisma.$transaction([
    ...(replacementKey ? [prisma.task.updateMany({ where: { workspaceId: auth.workspaceId, status: current.key }, data: { status: replacementKey } })] : []),
    prisma.taskStatus.delete({ where: { id: current.id } }),
  ])
  return NextResponse.json({ ok: true })
}
