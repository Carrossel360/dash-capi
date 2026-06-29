import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  const spaceId   = searchParams.get('spaceId')
  const status    = searchParams.get('status')
  const assigneeId = searchParams.get('assigneeId')

  const tasks = await prisma.task.findMany({
    where: {
      workspaceId: auth.workspaceId,
      parentId: null,  // only top-level tasks
      ...(projectId ? { projectId } : {}),
      ...(spaceId ? { project: { spaceId } } : {}),
      ...(status ? { status } : {}),
      ...(assigneeId ? { assigneeId } : {}),
    },
    include: {
      project: { select: { id: true, name: true, color: true, spaceId: true } },
      _count: { select: { comments: true, subtasks: true } },
    },
    orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json({ tasks })
}

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const {
    title, projectId, status, priority, assigneeId, assigneeName,
    startDate, dueDate, description, createdByName, parentId,
    taskTags, customFieldValues,
  } = body

  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const maxPos = await prisma.task.aggregate({
    where: { workspaceId: auth.workspaceId, status: status ?? 'todo', parentId: null },
    _max: { position: true },
  })

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
      description: description ?? null,
      position: (maxPos._max.position ?? 0) + 1,
      createdById: auth.userId,
      createdByName: createdByName ?? null,
      parentId: parentId ?? null,
      taskTags: taskTags ?? [],
    },
    include: {
      project: { select: { id: true, name: true, color: true, spaceId: true } },
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

  return NextResponse.json({ task }, { status: 201 })
}
