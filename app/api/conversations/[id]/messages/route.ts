import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { uploadMedia } from '@/lib/storage'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const conv = await prisma.conversation.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
    include: { workspace: { select: { uazapiUrl: true, uazapiToken: true } } },
  })
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { content, mediaType, mediaBase64, mediaCaption } = await req.json()

  const isMedia = !!(mediaType && mediaBase64)
  if (!isMedia && !content?.trim()) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })

  // Look up sender name
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId: auth.workspaceId, userId: auth.userId },
    include: { user: { select: { name: true } } },
  })

  // Build stored content: text or media tag
  let storedContent = content?.trim() ?? ''
  if (isMedia) {
    storedContent = mediaCaption ? `[${mediaType}:${mediaCaption}]` : `[${mediaType}]`
  }

  const message = await prisma.message.create({
    data: {
      conversationId: params.id,
      content:      storedContent,
      direction:    'outbound',
      senderName:   member?.user.name ?? null,
      senderUserId: auth.userId,
    },
  })

  await prisma.conversation.update({
    where: { id: params.id },
    data: {
      lastMessageAt: message.sentAt,
      status: conv.status === 'open' ? 'in_progress' : conv.status,
    },
  })

  // Send via UazAPI
  const { uazapiUrl, uazapiToken } = conv.workspace
  if (uazapiUrl && uazapiToken) {
    try {
      const phone  = conv.customerPhone.replace(/\D/g, '')
      const number = phone.startsWith('55') ? phone : `55${phone}`

      let endpoint = `${uazapiUrl}/send/text`
      let body: Record<string, unknown> = { number, text: storedContent }

      if (isMedia) {
        endpoint = `${uazapiUrl}/send/media`

        if (mediaType === 'audio') {
          // PTT: send base64 directly with correct mimetype
          const rawBase64 = mediaBase64.includes(',') ? mediaBase64.split(',')[1] : mediaBase64
          body = { number, type: 'ptt', file: rawBase64, mimetype: 'audio/ogg; codecs=opus' }
        } else {
          // Images/video/docs: upload to Neon MediaFile, get public URL
          const publicUrl = await uploadMedia(mediaBase64, auth.workspaceId)
          const newContent = `[${mediaType}:${publicUrl}]`
          await prisma.message.update({ where: { id: message.id }, data: { content: newContent } }).catch(() => {})
          body = { number, type: mediaType, file: publicUrl, ...(mediaCaption ? { docName: mediaCaption } : {}) }
        }
      }

      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', token: uazapiToken },
        body:    JSON.stringify(body),
      })
      if (res.ok) {
        const data = await res.json() as { id?: string }
        if (data.id) {
          await prisma.message.update({ where: { id: message.id }, data: { externalId: data.id } }).catch(() => {})
        }
      }
    } catch { /* best effort */ }
  }

  return NextResponse.json({
    id:        message.id,
    content:   message.content,
    direction: message.direction,
    senderName: message.senderName,
    sentAt:    message.sentAt,
  })
}
