import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ws = await prisma.workspace.findUnique({ where: { id: auth.workspaceId }, select: { isAgency: true } })
  const isAgencyManager = ws?.isAgency === true && ['admin', 'manager'].includes(auth.role)
  const unreadOnly = req.nextUrl.searchParams.get('unreadOnly') === 'true'

  const notifications = await prisma.notification.findMany({
    where: {
      ...(isAgencyManager ? {} : { workspaceId: auth.workspaceId }),
      ...(unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { workspace: { select: { name: true } } },
  })

  return NextResponse.json({ notifications })
}
