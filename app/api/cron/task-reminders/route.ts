import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { notifyTaskUser } from '@/lib/task-notifications'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authorization = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const closedStatuses = await prisma.taskStatus.findMany({ where: { category: 'closed' }, select: { workspaceId: true, key: true } })
  const closedByWorkspace = new Map<string, string[]>()
  for (const status of closedStatuses) closedByWorkspace.set(status.workspaceId, [...(closedByWorkspace.get(status.workspaceId) ?? []), status.key])

  const tasks = await prisma.task.findMany({
    where: { dueDate: { gte: now, lte: end }, parentId: null },
    include: { assignees: true },
  })
  let sent = 0
  for (const task of tasks) {
    if ((closedByWorkspace.get(task.workspaceId) ?? ['done']).includes(task.status)) continue
    const dateKey = task.dueDate!.toISOString().slice(0, 10)
    for (const assignee of task.assignees) {
      await notifyTaskUser({
        workspaceId: task.workspaceId,
        userId: assignee.userId,
        taskId: task.id,
        taskTitle: task.title,
        eventType: 'due_reminder',
        message: `A tarefa “${task.title}” vence nas próximas 24 horas.`,
        dedupeKey: `task:${task.id}:due:${dateKey}:${assignee.userId}`,
      })
      sent++
    }
  }
  return NextResponse.json({ checked: tasks.length, sent })
}
