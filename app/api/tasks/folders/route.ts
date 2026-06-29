import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { spaceId, name, color } = await req.json()
  if (!spaceId || !name?.trim()) return NextResponse.json({ error: 'spaceId and name required' }, { status: 400 })

  const space = await prisma.taskSpace.findFirst({ where: { id: spaceId, workspaceId: auth.workspaceId } })
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 })

  const count = await prisma.taskFolder.count({ where: { spaceId } })
  const folder = await prisma.taskFolder.create({
    data: { spaceId, name: name.trim(), color: color ?? '#475569', position: count },
    include: { lists: { include: { _count: { select: { tasks: true } } } } },
  })
  return NextResponse.json({ folder }, { status: 201 })
}
