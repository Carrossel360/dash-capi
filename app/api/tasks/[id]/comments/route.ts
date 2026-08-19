import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma as db } from '@/lib/db'
import { notifyTaskUser } from '@/lib/task-notifications'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const comments = await db.taskComment.findMany({
    where: { taskId: params.id, task: { workspaceId: auth.workspaceId } },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ comments })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'attendant'].includes(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { content, userName, mentionUserIds } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 })

  const task = await db.task.findFirst({ where: { id: params.id, workspaceId: auth.workspaceId } })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const comment = await db.taskComment.create({
    data: {
      taskId: params.id,
      userId: auth.userId,
      userName: userName ?? 'Usuário',
      content: content.trim(),
      mentionUserIds: Array.isArray(mentionUserIds) ? mentionUserIds : [],
    },
  })
  await db.taskActivity.create({
    data: { taskId: task.id, userId: auth.userId, userName: userName ?? 'Usuário', action: 'commented' },
  })
  for (const userId of comment.mentionUserIds) {
    if (userId === auth.userId) continue
    await notifyTaskUser({
      workspaceId: auth.workspaceId,
      userId,
      taskId: task.id,
      taskTitle: task.title,
      eventType: 'mentioned',
      message: `${userName ?? 'Alguém'} mencionou você em um comentário: “${content.trim().slice(0, 160)}”`,
    })
  }
  return NextResponse.json({ comment }, { status: 201 })
}
