import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const notification = await prisma.notification.findUnique({ where: { id: params.id } })
  if (!notification) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 })

  const ws = await prisma.workspace.findUnique({ where: { id: auth.workspaceId }, select: { isAgency: true } })
  const isAgencyManager = ws?.isAgency === true && ['admin', 'manager'].includes(auth.role)
  if (notification.workspaceId !== auth.workspaceId && !isAgencyManager) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const updated = await prisma.notification.update({
    where: { id: params.id },
    data: { readAt: new Date() },
  })

  return NextResponse.json({ notification: updated })
}
