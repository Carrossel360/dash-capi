import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload, getAccessibleTaskSpaceIds } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { notifyTaskUser } from '@/lib/task-notifications'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  const spaceId   = searchParams.get('spaceId')
  const status    = searchParams.get('status')
  const assigneeId = searchParams.get('assigneeId')
  const search = searchParams.get('search')?.trim()
  const priorities = searchParams.get('priorities')?.split(',').filter(Boolean) ?? []
  const statuses = searchParams.get('statuses')?.split(',').filter(Boolean) ?? []
  const clientId = searchParams.get('clientId')
  const serviceKey = searchParams.get('serviceKey')
  const dueFrom = searchParams.get('dueFrom')
  const dueTo = searchParams.get('dueTo')

  const accessibleSpaceIds = await getAccessibleTaskSpaceIds(auth)
  if (spaceId && accessibleSpaceIds && !accessibleSpaceIds.includes(spaceId)) {
    return NextResponse.json({ tasks: [] })
  }

  const conditions = [
    ...(assigneeId ? [{ OR: [{ assigneeId }, { assignees: { some: { userId: assigneeId } } }] }] : []),
    ...(search ? [{ OR: [
      { title: { contains: search, mode: 'insensitive' as const } },
      { description: { contains: search, mode: 'insensitive' as const } },
    ] }] : []),
  ]

  const tasks = await prisma.task.findMany({
    where: {
      workspaceId: auth.workspaceId,
      parentId: null,  // only top-level tasks
      ...(projectId ? { projectId } : {}),
      ...(spaceId ? { project: { spaceId } } : {}),
      ...(!projectId && !spaceId && accessibleSpaceIds ? { project: { spaceId: { in: accessibleSpaceIds } } } : {}),
      ...(status ? { status } : statuses.length ? { status: { in: statuses } } : {}),
      ...(priorities.length ? { priority: { in: priorities } } : {}),
      ...(clientId ? { clientWorkspaceId: clientId } : {}),
      ...(serviceKey ? { serviceKey } : {}),
      ...(dueFrom || dueTo ? { dueDate: { ...(dueFrom ? { gte: new Date(dueFrom) } : {}), ...(dueTo ? { lte: new Date(dueTo) } : {}) } } : {}),
      ...(conditions.length ? { AND: conditions } : {}),
    },
    include: {
      project: { select: { id: true, name: true, color: true, spaceId: true } },
      assignees: { orderBy: { createdAt: 'asc' } },
      customFieldValues: { include: { field: true } },
      _count: { select: { comments: true, subtasks: true } },
    },
    orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json({ tasks })
}

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager', 'attendant'].includes(auth.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const {
    title, projectId, status, priority, assigneeId, assigneeName,
    startDate, dueDate, description, createdByName, parentId,
    taskTags, customFieldValues, assigneeIds, estimatedMinutes, clientWorkspaceId, serviceKey,
  } = body

  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const maxPos = await prisma.task.aggregate({
    where: { workspaceId: auth.workspaceId, status: status ?? 'todo', parentId: null },
    _max: { position: true },
  })

  const requestedAssigneeIds = Array.isArray(assigneeIds)
    ? [...new Set(assigneeIds.filter((id): id is string => typeof id === 'string'))]
    : []
  const assigneeUsers = requestedAssigneeIds.length
    ? await prisma.user.findMany({
        where: {
          id: { in: requestedAssigneeIds },
          memberships: { some: { workspaceId: auth.workspaceId } },
        },
        select: { id: true, name: true },
      })
    : []

  const task = await prisma.task.create({
    data: {
      workspaceId: auth.workspaceId,
      title: title.trim(),
      projectId: projectId ?? null,
      status: status ?? 'todo',
      priority: priority ?? 'medium',
      assigneeId: assigneeId ?? null,
      assigneeName: assigneeName ?? null,
      startDate: startDate ? new Date(startDate) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
      estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null,
      clientWorkspaceId: clientWorkspaceId ?? null,
      serviceKey: serviceKey ?? null,
      description: description ?? null,
      position: (maxPos._max.position ?? 0) + 1,
      createdById: auth.userId,
      createdByName: createdByName ?? null,
      parentId: parentId ?? null,
      taskTags: taskTags ?? [],
      assignees: assigneeUsers.length ? {
        create: assigneeUsers.map(user => ({ userId: user.id, userName: user.name })),
      } : undefined,
      activities: { create: { userId: auth.userId, userName: createdByName ?? 'Usuário', action: 'created' } },
    },
    include: {
      project: { select: { id: true, name: true, color: true, spaceId: true } },
      assignees: true,
      _count: { select: { comments: true, subtasks: true } },
    },
  })

  // Save custom field values
  if (customFieldValues && typeof customFieldValues === 'object') {
    const entries = Object.entries(customFieldValues as Record<string, string>)
      .filter(([, v]) => v !== undefined && v !== '')
    if (entries.length > 0) {
      await prisma.$transaction(
        entries.map(([fieldId, value]) =>
          prisma.customFieldValue.upsert({
            where: { taskId_customFieldId: { taskId: task.id, customFieldId: fieldId } },
            create: { taskId: task.id, customFieldId: fieldId, value },
            update: { value },
          })
        )
      )
    }
  }

  const notificationDeliveries = []
  for (const assignee of task.assignees) {
    if (assignee.userId === auth.userId) continue
    const delivery = await notifyTaskUser({
      workspaceId: auth.workspaceId,
      userId: assignee.userId,
      taskId: task.id,
      taskTitle: task.title,
      eventType: 'assigned',
      message: `${createdByName ?? 'Alguém'} atribuiu a tarefa “${task.title}” a você.`,
    })
    notificationDeliveries.push({ userId: assignee.userId, ...delivery })
  }

  return NextResponse.json({ task, notificationDeliveries }, { status: 201 })
}
