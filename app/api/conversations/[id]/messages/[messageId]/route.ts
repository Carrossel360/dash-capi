import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

// PATCH — editar o texto de uma mensagem já enviada (só outbound, só texto puro, mesmo padrão
// best-effort de app/api/conversations/[id]/messages/route.ts pro envio via UazAPI).
export async function PATCH(req: NextRequest, { params }: { params: { id: string; messageId: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const conv = await prisma.conversation.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
    include: { workspace: { select: { uazapiUrl: true, uazapiToken: true } } },
  })
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const message = await prisma.message.findFirst({ where: { id: params.messageId, conversationId: params.id } })
  if (!message) return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 })
  if (message.direction !== 'outbound') return NextResponse.json({ error: 'Só é possível editar mensagens enviadas por você' }, { status: 403 })
  if (message.deletedAt) return NextResponse.json({ error: 'Mensagem já apagada' }, { status: 400 })
  if (message.content.startsWith('[')) return NextResponse.json({ error: 'Só é possível editar mensagens de texto' }, { status: 400 })

  const { content } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: 'Texto vazio' }, { status: 400 })

  const { uazapiUrl, uazapiToken } = conv.workspace
  if (uazapiUrl && uazapiToken && message.externalId) {
    try {
      await fetch(`${uazapiUrl}/message/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: uazapiToken },
        body: JSON.stringify({ id: message.externalId, text: content.trim() }),
      })
    } catch { /* best effort */ }
  }

  const updated = await prisma.message.update({
    where: { id: params.messageId },
    data: { content: content.trim(), editedAt: new Date() },
  })

  return NextResponse.json({ id: updated.id, content: updated.content, editedAt: updated.editedAt })
}

// DELETE — soft-delete: mantém o registro (auditoria) mas marca deletedAt, e a UI passa a
// mostrar "Mensagem apagada" no lugar do conteúdo original.
export async function DELETE(req: NextRequest, { params }: { params: { id: string; messageId: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const conv = await prisma.conversation.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
    include: { workspace: { select: { uazapiUrl: true, uazapiToken: true } } },
  })
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const message = await prisma.message.findFirst({ where: { id: params.messageId, conversationId: params.id } })
  if (!message) return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 })
  if (message.direction !== 'outbound') return NextResponse.json({ error: 'Só é possível apagar mensagens enviadas por você' }, { status: 403 })
  if (message.deletedAt) return NextResponse.json({ error: 'Mensagem já apagada' }, { status: 400 })

  const { uazapiUrl, uazapiToken } = conv.workspace
  if (uazapiUrl && uazapiToken && message.externalId) {
    try {
      await fetch(`${uazapiUrl}/message/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: uazapiToken },
        body: JSON.stringify({ id: message.externalId }),
      })
    } catch { /* best effort */ }
  }

  const updated = await prisma.message.update({ where: { id: params.messageId }, data: { deletedAt: new Date() } })
  return NextResponse.json({ id: updated.id, deletedAt: updated.deletedAt })
}

// POST — reagir/desreagir com emoji (marcação interna entre atendentes, não sincronizada com
// o WhatsApp real — não há confirmação de que a UazAPI exponha endpoint de reação).
export async function POST(req: NextRequest, { params }: { params: { id: string; messageId: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const conv = await prisma.conversation.findFirst({ where: { id: params.id, workspaceId: auth.workspaceId } })
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const message = await prisma.message.findFirst({ where: { id: params.messageId, conversationId: params.id } })
  if (!message) return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 })

  const { emoji } = await req.json()
  if (!emoji) return NextResponse.json({ error: 'Emoji obrigatório' }, { status: 400 })

  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId: auth.workspaceId, userId: auth.userId },
    include: { user: { select: { name: true } } },
  })

  const reactions = Array.isArray(message.reactions) ? message.reactions as { userId: string; userName: string; emoji: string }[] : []
  const already = reactions.some(r => r.userId === auth.userId && r.emoji === emoji)
  const nextReactions = already
    ? reactions.filter(r => !(r.userId === auth.userId && r.emoji === emoji))
    : [...reactions, { userId: auth.userId, userName: member?.user.name ?? 'Você', emoji }]

  const updated = await prisma.message.update({
    where: { id: params.messageId },
    data: { reactions: nextReactions },
  })

  return NextResponse.json({ id: updated.id, reactions: updated.reactions })
}
