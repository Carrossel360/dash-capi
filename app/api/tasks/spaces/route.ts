import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Returns full hierarchy: spaces → folders → lists (with task counts)
export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const spaces = await prisma.taskSpace.findMany({
    where: { workspaceId: auth.workspaceId },
    include: {
      folders: {
        orderBy: { position: 'asc' },
        include: {
          lists: {
            orderBy: { position: 'asc' },
            include: { _count: { select: { tasks: { where: { parentId: null } } } } },
          },
        },
      },
      lists: {
        where: { folderId: null },
        orderBy: { position: 'asc' },
        include: { _count: { select: { tasks: { where: { parentId: null } } } } },
      },
      customFields: { orderBy: { position: 'asc' } },
    },
    orderBy: { position: 'asc' },
  })

  return NextResponse.json({ spaces })
}

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, color, icon } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const count = await prisma.taskSpace.count({ where: { workspaceId: auth.workspaceId } })

  const space = await prisma.taskSpace.create({
    data: {
      workspaceId: auth.workspaceId,
      name: name.trim(),
      color: color ?? '#6a11cb',
      icon: icon ?? null,
      position: count,
    },
    include: { folders: true, lists: true, customFields: true },
  })

  return NextResponse.json({ space }, { status: 201 })
}
