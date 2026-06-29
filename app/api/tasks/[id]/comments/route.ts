import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma as db } from '@/lib/db'

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

  const { content, userName } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 })

  const task = await db.task.findFirst({ where: { id: params.id, workspaceId: auth.workspaceId } })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const comment = await db.taskComment.create({
    data: { taskId: params.id, userId: auth.userId, userName: userName ?? 'Usuário', content: content.trim() },
  })
  return NextResponse.json({ comment }, { status: 201 })
}
