import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = await prisma.task.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
    include: {
      project: { select: { id: true, name: true, color: true, spaceId: true, folderId: true } },
      subtasks: {
        orderBy: { position: 'asc' },
        include: { _count: { select: { subtasks: true } } },
      },
      comments: { orderBy: { createdAt: 'asc' } },
      customFieldValues: { include: { field: true } },
    },
  })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ task })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await req.json()

  const scalarFields = ['title', 'description', 'status', 'priority', 'assigneeId', 'assigneeName', 'startDate', 'dueDate', 'projectId', 'position', 'taskTags']
  const update: Record<string, unknown> = {}
  for (const k of scalarFields) {
    if (k in data) {
      const v = data[k]
      if ((k === 'startDate' || k === 'dueDate') && v) update[k] = new Date(v)
      else update[k] = v === '' ? null : v
    }
  }

  await prisma.task.updateMany({ where: { id: params.id, workspaceId: auth.workspaceId }, data: update })

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

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.task.deleteMany({ where: { id: params.id, workspaceId: auth.workspaceId } })
  return NextResponse.json({ ok: true })
}
