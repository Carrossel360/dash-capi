import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  // `id` já é único por si só — o filtro por workspaceId é o que garante isolamento entre
  // tenants; sem filtrar por `service` aqui, funciona pra qualquer um dos 3 (era hardcoded
  // em REPORT_SERVICE antes, o que quebrava excluir relatórios de Social Media/GBP).
  await prisma.insight.deleteMany({
    where: { id: params.id, workspaceId: auth.workspaceId },
  })
  return NextResponse.json({ ok: true })
}
