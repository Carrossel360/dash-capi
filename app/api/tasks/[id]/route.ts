import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload, getAccessibleTaskSpaceIds } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { notifyTaskUser } from '@/lib/task-notifications'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accessibleSpaceIds = await getAccessibleTaskSpaceIds(auth)
  const task = await prisma.task.findFirst({
    where: {
      id: params.id,
      workspaceId: auth.workspaceId,
      ...(accessibleSpaceIds ? { project: { spaceId: { in: accessibleSpaceIds } } } : {}),
    },
    include: {
      project: { select: { id: true, name: true, color: true, spaceId: true, folderId: true } },
      subtasks: {
        orderBy: { position: 'asc' },
        include: { _count: { select: { subtasks: true } } },
      },
      comments: { orderBy: { createdAt: 'asc' }, include: { attachments: true } },
      customFieldValues: { include: { field: true } },
      assignees: { orderBy: { createdAt: 'asc' } },
      attachments: { where: { commentId: null }, orderBy: { createdAt: 'asc' } },
      checklistItems: { orderBy: { position: 'asc' } },
      sourceRelations: { include: { targetTask: { select: { id: true, title: true, status: true } } } },
      targetRelations: { include: { sourceTask: { select: { id: true, title: true, status: true } } } },
      activities: { orderBy: { createdAt: 'desc' }, take: 100 },
      timeEntries: { orderBy: { startedAt: 'desc' }, take: 50 },
    },
  })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ task })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'attendant'].includes(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const data = await req.json()
  const existing = await prisma.task.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
    include: { assignees: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const scalarFields = ['title', 'description', 'status', 'priority', 'assigneeId', 'assigneeName', 'startDate', 'dueDate', 'projectId', 'position', 'taskTags', 'estimatedMinutes', 'timeSpentMinutes', 'clientWorkspaceId', 'serviceKey']
  const update: Record<string, unknown> = {}
  for (const k of scalarFields) {
    if (k in data) {
      const v = data[k]
      if ((k === 'startDate' || k === 'dueDate') && v) update[k] = new Date(v)
      else update[k] = v === '' ? null : v
    }
  }

  await prisma.task.update({ where: { id: existing.id }, data: update })

  let newAssigneeIds: string[] = []
  if (Array.isArray(data.assigneeIds)) {
    const users = await prisma.user.findMany({
      where: {
        id: { in: data.assigneeIds },
        memberships: { some: { workspaceId: auth.workspaceId } },
      },
      select: { id: true, name: true },
    })
    newAssigneeIds = users.map(user => user.id).filter(id => !existing.assignees.some(item => item.userId === id))
    await prisma.$transaction([
      prisma.taskAssignee.deleteMany({ where: { taskId: existing.id } }),
      prisma.taskAssignee.createMany({
        data: users.map(user => ({ taskId: existing.id, userId: user.id, userName: user.name })),
        skipDuplicates: true,
      }),
    ])
  }

  // Update custom field values
  if (data.customFieldValues && typeof data.customFieldValues === 'object') {
    const entries = Object.entries(data.customFieldValues as Record<string, string>)
    if (entries.length > 0) {
      await prisma.$transaction(
        entries.map(([fieldId, value]) =>
          prisma.customFieldValue.upsert({
            where: { taskId_customFieldId: { taskId: params.id, customFieldId: fieldId } },
            create: { taskId: params.id, customFieldId: fieldId, value: value ?? null },
            update: { value: value ?? null },
          })
        )
      )
    }
  }

  const actor = await prisma.user.findUnique({ where: { id: auth.userId }, select: { name: true } })
  const changedFields = Object.keys(update)
  if (changedFields.length || Array.isArray(data.assigneeIds)) {
    await prisma.taskActivity.create({
      data: {
        taskId: existing.id,
        userId: auth.userId,
        userName: actor?.name ?? 'Usuário',
        action: 'updated',
        metadata: { fields: changedFields },
      },
    })
  }

  const notificationDeliveries = []
  for (const userId of newAssigneeIds) {
    if (userId === auth.userId) continue
    const delivery = await notifyTaskUser({
      workspaceId: auth.workspaceId,
      userId,
      taskId: existing.id,
      taskTitle: String(update.title ?? existing.title),
      eventType: 'assigned',
      message: `${actor?.name ?? 'Alguém'} atribuiu a tarefa “${String(update.title ?? existing.title)}” a você.`,
    })
    notificationDeliveries.push({ userId, ...delivery })
  }

  if (data.status && data.status !== existing.status) {
    const statusDefinition = await prisma.taskStatus.findFirst({ where: { workspaceId: auth.workspaceId, key: data.status }, select: { category: true } })
    const eventType = statusDefinition?.category === 'closed' || data.status === 'done' ? 'completed' : 'status_changed'
    for (const assignee of existing.assignees) {
      if (assignee.userId === auth.userId) continue
      await notifyTaskUser({
        workspaceId: auth.workspaceId,
        userId: assignee.userId,
        taskId: existing.id,
        taskTitle: String(update.title ?? existing.title),
        eventType,
        message: `${actor?.name ?? 'Alguém'} alterou o status da tarefa “${String(update.title ?? existing.title)}”.`,
      })
    }
  }

  return NextResponse.json({ ok: true, notificationDeliveries })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.task.deleteMany({ where: { id: params.id, workspaceId: auth.workspaceId } })
  return NextResponse.json({ ok: true })
}
