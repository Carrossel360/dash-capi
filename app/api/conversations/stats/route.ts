import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Estatísticas simples da Central de Atendimento — contagem por status, não lidas, distribuição
// por atendente e tempo médio até a 1ª resposta (aproximado: primeira mensagem outbound da
// conversa vs. primeira inbound, não necessariamente "resposta" à mensagem específica).
export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [byStatus, conversations, members] = await Promise.all([
    prisma.conversation.groupBy({
      by: ['status'],
      where: { workspaceId: auth.workspaceId },
      _count: true,
      _sum: { unreadCount: true },
    }),
    prisma.conversation.findMany({
      where: { workspaceId: auth.workspaceId },
      select: { id: true, assignedTo: true, status: true },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId: auth.workspaceId },
      include: { user: { select: { id: true, name: true } } },
    }),
  ])

  const statusCounts: Record<string, number> = { open: 0, in_progress: 0, closed: 0 }
  let totalUnread = 0
  for (const row of byStatus) {
    statusCounts[row.status] = row._count
    totalUnread += row._sum.unreadCount ?? 0
  }
  const total = conversations.length

  const memberMap = Object.fromEntries(members.map(m => [m.userId, m.user.name]))
  const byAssignee = new Map<string, { name: string; total: number; open: number }>()
  for (const c of conversations) {
    const key = c.assignedTo ?? 'unassigned'
    const name = c.assignedTo ? (memberMap[c.assignedTo] ?? 'Ex-membro') : 'Sem atendente'
    if (!byAssignee.has(key)) byAssignee.set(key, { name, total: 0, open: 0 })
    const entry = byAssignee.get(key)!
    entry.total++
    if (c.status !== 'closed') entry.open++
  }

  // Tempo médio até a 1ª resposta: min(sentAt) por direção, por conversa.
  const firstByConv = await prisma.message.groupBy({
    by: ['conversationId', 'direction'],
    where: { conversation: { workspaceId: auth.workspaceId } },
    _min: { sentAt: true },
  })
  const firstMap = new Map<string, { inbound?: Date; outbound?: Date }>()
  for (const row of firstByConv) {
    if (!firstMap.has(row.conversationId)) firstMap.set(row.conversationId, {})
    const entry = firstMap.get(row.conversationId)!
    if (row._min.sentAt) entry[row.direction as 'inbound' | 'outbound'] = row._min.sentAt
  }
  const diffsMs: number[] = []
  for (const { inbound, outbound } of firstMap.values()) {
    if (inbound && outbound && outbound > inbound) diffsMs.push(outbound.getTime() - inbound.getTime())
  }
  const avgFirstResponseMs = diffsMs.length ? diffsMs.reduce((a, b) => a + b, 0) / diffsMs.length : null

  return NextResponse.json({
    total,
    byStatus: statusCounts,
    totalUnread,
    byAssignee: [...byAssignee.values()].sort((a, b) => b.total - a.total),
    avgFirstResponseMs,
  })
}
