import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'attendant'].includes(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { targetTaskId, type } = await req.json()
  if (!targetTaskId || targetTaskId === params.id) return NextResponse.json({ error: 'Invalid target' }, { status: 400 })
  const count = await prisma.task.count({ where: { id: { in: [params.id, targetTaskId] }, workspaceId: auth.workspaceId } })
  if (count !== 2) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const relation = await prisma.taskRelation.upsert({
    where: { sourceTaskId_targetTaskId_type: { sourceTaskId: params.id, targetTaskId, type: type ?? 'related' } },
    create: { sourceTaskId: params.id, targetTaskId, type: type ?? 'related' },
    update: {},
  })
  return NextResponse.json({ relation }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'attendant'].includes(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const relationId = req.nextUrl.searchParams.get('relationId')
  await prisma.taskRelation.deleteMany({
    where: { id: relationId ?? '', OR: [{ sourceTaskId: params.id }, { targetTaskId: params.id }], sourceTask: { workspaceId: auth.workspaceId } },
  })
  return NextResponse.json({ ok: true })
}
