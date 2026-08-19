import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload, isAgencyStaff } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Independe do workspace selecionado no momento — quem é da agência vê alerta de
  // qualquer cliente mesmo enquanto está com um cliente específico aberto no seletor.
  const isAgencyManager = await isAgencyStaff(auth.userId)
  const unreadOnly = req.nextUrl.searchParams.get('unreadOnly') === 'true'

  const [notifications, agencyConfig] = await Promise.all([
    prisma.notification.findMany({
      where: {
        AND: [
          isAgencyManager ? {} : { workspaceId: auth.workspaceId },
          { OR: [{ recipientUserId: null }, { recipientUserId: auth.userId }] },
        ],
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { workspace: { select: { name: true } } },
    }),
    prisma.workspace.findFirst({ where: { isAgency: true }, select: { notificationSound: true } }),
  ])

  return NextResponse.json({ notifications, notificationSound: agencyConfig?.notificationSound ?? 'soft' })
}
