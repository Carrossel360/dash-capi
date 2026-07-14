import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status     = searchParams.get('status')
  const search     = searchParams.get('search')
  const phone      = searchParams.get('phone')
  const assignedTo = searchParams.get('assignedTo')

  const conversations = await prisma.conversation.findMany({
    where: {
      workspaceId: auth.workspaceId,
      ...(status && status !== 'all' ? { status } : {}),
      ...(phone ? { customerPhone: { contains: phone } } : {}),
      ...(assignedTo === 'unassigned' ? { assignedTo: null }
        : assignedTo && assignedTo !== 'all' ? { assignedTo } : {}),
    },
    orderBy: { lastMessageAt: 'desc' },
    include: {
      tags: { include: { tag: true } },
      messages: { orderBy: { sentAt: 'desc' }, take: 1 },
      lead: { select: { id: true, name: true, ctwaClid: true, stage: { select: { id: true, name: true, color: true } } } },
    },
  })

  const filtered = search
    ? conversations.filter(c =>
        c.customerPhone.includes(search) ||
        c.customerName?.toLowerCase().includes(search.toLowerCase()))
    : conversations

  // Resolve assignedTo names
  const assigneeIds = [...new Set(filtered.map(c => c.assignedTo).filter(Boolean))] as string[]
  const members = assigneeIds.length
    ? await prisma.workspaceMember.findMany({
        where: { workspaceId: auth.workspaceId, userId: { in: assigneeIds } },
        include: { user: { select: { id: true, name: true } } },
      })
    : []
  const memberMap = Object.fromEntries(members.map(m => [m.userId, m.user.name]))

  return NextResponse.json(filtered.map(c => ({
    id:            c.id,
    customerPhone: c.customerPhone,
    customerName:  c.customerName,
    leadId:        c.leadId,
    lead:          c.lead,
    assignedTo:    c.assignedTo,
    assignedName:  c.assignedTo ? (memberMap[c.assignedTo] ?? null) : null,
    status:        c.status,
    lastMessageAt: c.lastMessageAt,
    unreadCount:   c.unreadCount,
    lastMessage:   c.messages[0]
      ? { content: c.messages[0].content, direction: c.messages[0].direction, deletedAt: c.messages[0].deletedAt }
      : null,
    tags:      c.tags.map(ct => ({ id: ct.tag.id, name: ct.tag.name, color: ct.tag.color })),
    createdAt: c.createdAt,
  })))
}
