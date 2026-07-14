import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const conv = await prisma.conversation.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
    include: {
      tags:     { include: { tag: true } },
      messages: { orderBy: { sentAt: 'asc' } },
      lead:     { select: { id: true, name: true, ctwaClid: true, stage: { select: { id: true, name: true, color: true } } } },
    },
  })
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Zero unread when opening
  if (conv.unreadCount > 0) {
    await prisma.conversation.update({ where: { id: params.id }, data: { unreadCount: 0 } })
  }

  // Resolve assignedTo name
  let assignedName: string | null = null
  if (conv.assignedTo) {
    const m = await prisma.workspaceMember.findFirst({
      where: { workspaceId: auth.workspaceId, userId: conv.assignedTo },
      include: { user: { select: { name: true } } },
    })
    assignedName = m?.user.name ?? null
  }

  // Load workspace members for assignment dropdown
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: auth.workspaceId },
    include: { user: { select: { id: true, name: true } } },
  })

  return NextResponse.json({
    id:            conv.id,
    customerPhone: conv.customerPhone,
    customerName:  conv.customerName,
    leadId:        conv.leadId,
    lead:          conv.lead,
    assignedTo:    conv.assignedTo,
    assignedName,
    status:        conv.status,
    lastMessageAt: conv.lastMessageAt,
    unreadCount:   0,
    tags:          conv.tags.map(ct => ({ id: ct.tag.id, name: ct.tag.name, color: ct.tag.color })),
    messages:      conv.messages.map(m => ({
      id:          m.id,
      content:     m.content,
      direction:   m.direction,
      senderName:  m.senderName,
      senderUserId: m.senderUserId,
      sentAt:      m.sentAt,
      reactions:   m.reactions,
      editedAt:    m.editedAt,
      deletedAt:   m.deletedAt,
    })),
    members: members.map(m => ({ userId: m.userId, name: m.user.name, role: m.role })),
    createdAt: conv.createdAt,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const conv = await prisma.conversation.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
  })
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const update: Record<string, unknown> = {}
  if (body.status     !== undefined) update.status     = body.status
  if (body.assignedTo !== undefined) update.assignedTo = body.assignedTo
  if (body.customerName !== undefined) update.customerName = body.customerName

  const updated = await prisma.conversation.update({ where: { id: params.id }, data: update })
  return NextResponse.json({ id: updated.id, status: updated.status, assignedTo: updated.assignedTo })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const conv = await prisma.conversation.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
  })
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.conversation.delete({ where: { id: params.id } })
  return new NextResponse(null, { status: 204 })
}
