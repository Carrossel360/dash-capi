import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return digits.slice(2)
  return digits
}

export async function POST(
  req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  const { workspaceId } = params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const workspace = await prisma.workspace.findUnique({
    where:  { id: workspaceId },
    select: { id: true, uazapiUrl: true, uazapiToken: true },
  })
  if (!workspace) return NextResponse.json({ ok: true })

  const msg = body['message'] as Record<string, unknown> | undefined
  if (!msg) return NextResponse.json({ ok: true })

  const fromMe       = msg['fromMe'] as boolean
  const wasSentByApi = msg['wasSentByApi'] as boolean
  const isGroup      = msg['isGroup'] as boolean

  // Ignore our own API-sent messages (avoid duplicates)
  if (fromMe && wasSentByApi) return NextResponse.json({ ok: true })
  // Ignore group messages
  if (isGroup) return NextResponse.json({ ok: true })

  const chatid = (msg['chatid'] as string) ?? ''
  if (!chatid) return NextResponse.json({ ok: true })

  const externalId = (msg['messageid'] as string) ?? null
  const senderName = (msg['senderName'] as string) ?? null

  // Detect message type and build content string
  const rawType     = ((msg['type'] as string) || '').toLowerCase()
  const msgType     = rawType.endsWith('message') ? rawType.slice(0, -7) : rawType
  const mediaType   = ((msg['mediaType'] as string) || '').toLowerCase()
  const rawContent  = msg['content']

  let content    = ''
  let isAudio    = msgType === 'ptt' || msgType === 'audio' || mediaType.startsWith('audio')
  let detectedType = ''
  let encUrl: string | null = null
  let contextInfo: Record<string, unknown> | undefined

  if (typeof rawContent === 'object' && rawContent !== null) {
    const mediaObj = rawContent as Record<string, unknown>
    contextInfo = mediaObj['contextInfo'] as Record<string, unknown> | undefined
    const mime = ((mediaObj['mimetype'] as string) || '').toLowerCase()
    // ExtendedTextMessage: texto com contexto (resposta a anúncio, citação etc) — content
    // vem como objeto {text, contextInfo}, não uma mídia. Sem isso, cai no fallback
    // "[mídia]" mais abaixo mesmo sendo uma mensagem de texto normal.
    if (typeof mediaObj['text'] === 'string' && !mime && !mediaObj['URL'] && !mediaObj['url']) {
      content = mediaObj['text'] as string
    } else {
      encUrl = (mediaObj['URL'] as string) || (mediaObj['url'] as string) || null
      if (mime.startsWith('audio') || (mediaObj['PTT'] as boolean)) {
        isAudio = true
      } else if (mime.startsWith('image'))       detectedType = 'image'
      else if (mime.startsWith('video'))         detectedType = 'video'
      else if (mime.startsWith('application'))   detectedType = 'document'
    }
  } else {
    content = (rawContent as string) || (msg['text'] as string) || ''
  }

  const fileUrl = (msg['fileUrl'] as string) || (msg['file'] as string) || null
  if (fileUrl && !content) encUrl = encUrl || fileUrl

  const effectiveType = msgType || detectedType
  const MEDIA_TYPES   = ['image', 'video', 'document', 'sticker']

  if (isAudio) {
    content = encUrl ? `[audio:${encUrl}]` : '[áudio]'
  } else if (MEDIA_TYPES.includes(effectiveType) && encUrl) {
    content = `[${effectiveType}:${encUrl}]`
  } else if (MEDIA_TYPES.includes(effectiveType)) {
    content = `[${effectiveType}]`
  } else if (!content) {
    content = '[mídia]'
  }

  // Try UazAPI media download for any inbound media (always attempt, not just mmg.whatsapp.net)
  const isMediaType = isAudio || MEDIA_TYPES.includes(effectiveType)
  if (isMediaType && externalId && workspace.uazapiUrl && workspace.uazapiToken) {
    // UazAPI sometimes appends type to token (e.g. UUID/AudioMessage) — strip suffix
    const cleanToken = workspace.uazapiToken.split('/')[0]!
    try {
      const dlRes = await fetch(`${workspace.uazapiUrl}/message/download`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', token: cleanToken },
        body:    JSON.stringify({ id: externalId, return_link: true, return_base64: false }),
      })
      if (dlRes.ok) {
        const dlJson = await dlRes.json() as { fileURL?: string; url?: string }
        const fileUrl = dlJson.fileURL ?? dlJson.url
        if (fileUrl) {
          const mediaTag = isAudio ? 'audio' : (detectedType || effectiveType || 'media')
          content = `[${mediaTag}:${fileUrl}]`
        }
      }
    } catch { /* keep raw url */ }
  }

  const chat         = body['chat'] as Record<string, unknown> | undefined
  const customerName = (chat?.['name'] as string) ?? senderName ?? null
  const rawPhone     = chatid.split('@')[0]!
  const phone        = normalizePhone(rawPhone)

  const direction    = fromMe ? 'outbound' : 'inbound'

  // Find existing lead by phone
  let lead = await prisma.lead.findFirst({
    where: {
      workspaceId,
      OR: [
        { phone: `+55${phone}` },
        { phone: phone },
        { phone: { contains: phone.slice(-8) } },
      ],
    },
    select: { id: true },
  })

  // Sem lead ainda + primeira mensagem do cliente: cria o Lead já com a origem identificada.
  // Prioridade: (1) contexto real de anúncio Meta anexado pela própria mensagem (contextInfo),
  // (2) frase cadastrada em Configurações (link do site/Instagram/Google com texto pré-preenchido),
  // (3) sem identificação — ainda assim vira lead, só sem origem marcada.
  if (!lead && direction === 'inbound') {
    const adReply = contextInfo?.['externalAdReply'] as Record<string, unknown> | undefined
    const isMetaAd = contextInfo?.['conversionSource'] === 'FB_Ads'
      || contextInfo?.['entryPointConversionSource'] === 'ctwa_ad'
      || adReply?.['sourceType'] === 'ad'

    let source = 'whatsapp'
    let utmSource: string | null = null
    let utmMedium: string | null = null
    let utmCampaign: string | null = null
    let ctwaClid: string | null = null
    let metadata: Record<string, unknown> | undefined

    if (isMetaAd) {
      source = 'meta'
      utmSource = 'meta'
      utmMedium = 'whatsapp'
      ctwaClid = (adReply?.['ctwaClid'] as string) ?? null
      utmCampaign = (adReply?.['title'] as string) ?? (adReply?.['sourceID'] as string) ?? null
      metadata = {
        adSourceId:  adReply?.['sourceID'] ?? undefined,
        adSourceUrl: adReply?.['sourceURL'] ?? undefined,
        adTitle:     adReply?.['title'] ?? undefined,
        adBody:      adReply?.['body'] ?? undefined,
        adSourceApp: adReply?.['sourceApp'] ?? undefined,
      }
    } else if (content) {
      const phrases = await prisma.trackingPhrase.findMany({ where: { workspaceId } })
      const lower = content.toLowerCase()
      const matched = phrases.find(p => lower.includes(p.phrase.toLowerCase()))
      if (matched) {
        source = matched.source
        utmMedium = 'whatsapp'
        utmCampaign = matched.campaign ?? null
      }
    }

    const firstStage = await prisma.pipelineStage.findFirst({
      where: { workspaceId },
      orderBy: { order: 'asc' },
      select: { id: true },
    })

    if (firstStage) {
      const newLead = await prisma.lead.create({
        data: {
          workspaceId,
          name: customerName || phone,
          phone: `+55${phone}`,
          source,
          utmSource, utmMedium, utmCampaign,
          ctwaClid,
          metadata: metadata as Prisma.InputJsonValue | undefined,
          pipelineStageId: firstStage.id,
          notes: content ? `Primeira mensagem: ${content}` : undefined,
        },
        select: { id: true },
      })
      lead = newLead
    }
  }

  const existing = await prisma.conversation.findUnique({
    where: { workspaceId_customerPhone: { workspaceId, customerPhone: phone } },
    select: { id: true, leadId: true },
  })

  const conversation = await prisma.conversation.upsert({
    where:  { workspaceId_customerPhone: { workspaceId, customerPhone: phone } },
    create: {
      workspaceId,
      customerPhone: phone,
      customerName:  customerName ?? null,
      leadId:        lead?.id ?? null,
      status:        'open',
      lastMessageAt: new Date(),
      unreadCount:   direction === 'inbound' ? 1 : 0,
    },
    update: {
      lastMessageAt:  new Date(),
      ...(direction === 'inbound' ? { unreadCount: { increment: 1 } } : {}),
      ...(customerName ? { customerName } : {}),
      ...(!existing?.leadId && lead?.id ? { leadId: lead.id } : {}),
    },
  })

  try {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        content,
        direction,
        senderName: direction === 'outbound' ? (senderName ?? 'WhatsApp') : (senderName ?? phone),
        externalId: externalId ?? null,
      },
    })
  } catch {
    // externalId unique violation = duplicate message, ignore
  }

  return NextResponse.json({ ok: true })
}
