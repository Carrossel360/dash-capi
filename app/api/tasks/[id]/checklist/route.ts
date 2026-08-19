import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'attendant'].includes(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const task = await prisma.task.findFirst({ where: { id: params.id, workspaceId: auth.workspaceId } })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { text } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'Text required' }, { status: 400 })
  const position = await prisma.taskChecklistItem.count({ where: { taskId: task.id } })
  const item = await prisma.taskChecklistItem.create({ data: { taskId: task.id, text: text.trim(), position } })
  return NextResponse.json({ item }, { status: 201 })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'attendant'].includes(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { itemId, text, done, position } = await req.json()
  const item = await prisma.taskChecklistItem.findFirst({ where: { id: itemId, taskId: params.id, task: { workspaceId: auth.workspaceId } } })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const updated = await prisma.taskChecklistItem.update({
    where: { id: item.id },
    data: { ...(text !== undefined ? { text } : {}), ...(done !== undefined ? { done } : {}), ...(position !== undefined ? { position } : {}) },
  })
  return NextResponse.json({ item: updated })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'attendant'].includes(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const itemId = req.nextUrl.searchParams.get('itemId')
  await prisma.taskChecklistItem.deleteMany({ where: { id: itemId ?? '', taskId: params.id, task: { workspaceId: auth.workspaceId } } })
  return NextResponse.json({ ok: true })
}
