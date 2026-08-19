import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const exclude = req.nextUrl.searchParams.get('exclude')
  const projectId = req.nextUrl.searchParams.get('projectId')
  const tasks = await prisma.task.findMany({
    where: {
      workspaceId: auth.workspaceId,
      ...(exclude ? { id: { not: exclude } } : {}),
      ...(projectId ? { projectId } : {}),
      ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
    },
    select: { id: true, title: true, status: true, project: { select: { name: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 30,
  })
  return NextResponse.json({ tasks })
}
