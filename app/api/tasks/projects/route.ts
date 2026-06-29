import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const spaceId = searchParams.get('spaceId')

  const projects = await prisma.taskProject.findMany({
    where: { workspaceId: auth.workspaceId, ...(spaceId ? { spaceId } : {}) },
    include: { _count: { select: { tasks: { where: { parentId: null } } } } },
    orderBy: { position: 'asc' },
  })

  return NextResponse.json({ projects })
}

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, color, spaceId, folderId } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const count = await prisma.taskProject.count({
    where: { workspaceId: auth.workspaceId, spaceId: spaceId ?? null },
  })

  const project = await prisma.taskProject.create({
    data: {
      workspaceId: auth.workspaceId,
      name: name.trim(),
      color: color ?? '#6a11cb',
      spaceId: spaceId ?? null,
      folderId: folderId ?? null,
      position: count,
    },
  })

  return NextResponse.json({ project }, { status: 201 })
}
