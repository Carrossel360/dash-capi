import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { uploadMedia } from '@/lib/storage'

export const maxDuration = 60

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'attendant'].includes(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const task = await prisma.task.findFirst({ where: { id: params.id, workspaceId: auth.workspaceId } })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { dataUrl, name, mimeType, size, commentId } = await req.json()
  if (!dataUrl || !name) return NextResponse.json({ error: 'File required' }, { status: 400 })
  if (Number(size) > 15 * 1024 * 1024) return NextResponse.json({ error: 'Arquivo excede 15 MB' }, { status: 413 })
  const url = await uploadMedia(dataUrl, auth.workspaceId, mimeType)
  const attachment = await prisma.taskAttachment.create({
    data: {
      taskId: task.id, commentId: commentId ?? null, userId: auth.userId,
      name: String(name).slice(0, 240), url, mimeType: mimeType ?? 'application/octet-stream',
      size: size ? Number(size) : null,
    },
  })
  return NextResponse.json({ attachment }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'attendant'].includes(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const attachmentId = req.nextUrl.searchParams.get('attachmentId')
  if (!attachmentId) return NextResponse.json({ error: 'attachmentId required' }, { status: 400 })
  await prisma.taskAttachment.deleteMany({
    where: { id: attachmentId, taskId: params.id, task: { workspaceId: auth.workspaceId } },
  })
  return NextResponse.json({ ok: true })
}
