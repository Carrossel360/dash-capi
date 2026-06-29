import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200)

  const events = await prisma.cAPIEvent.findMany({
    where: {
      workspaceId: auth.workspaceId,
      ...(status ? { status: status as any } : {}),
    },
    include: { lead: { select: { id: true, name: true, phone: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  const summary = await prisma.cAPIEvent.groupBy({
    by: ['status'],
    where: { workspaceId: auth.workspaceId },
    _count: true,
  })

  return NextResponse.json({ events, summary })
}
