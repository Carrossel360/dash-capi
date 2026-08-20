import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { enqueueCapiEvent } from '@/lib/capi-events'
import { findDuplicateLead, getLeadIdentity, isLeadIdentityConflict } from '@/lib/lead-identity'

function messageText(message: any): string {
  if (typeof message?.text?.body === 'string') return message.text.body.trim()
  if (typeof message?.button?.text === 'string') return message.button.text.trim()
  if (typeof message?.interactive?.button_reply?.title === 'string') return message.interactive.button_reply.title.trim()
  if (typeof message?.interactive?.list_reply?.title === 'string') return message.interactive.list_reply.title.trim()
  return ''
}

function canFillSource(source: string | null | undefined): boolean {
  const normalized = source?.trim().toLowerCase()
  return !normalized || normalized === 'indefinido' || normalized === 'whatsapp'
}

// GET — Meta webhook verification (step 1 of setup)
export async function GET(
  req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (
    mode === 'subscribe' &&
    token === process.env.WHATSAPP_WEBHOOK_TOKEN &&
    challenge
  ) {
    return new Response(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// POST — Receives messages from WhatsApp Cloud API
export async function POST(
  req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  const { workspaceId } = params

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Confirm workspace exists
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true },
  })
  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue

      const value    = change.value
      const messages = value.messages ?? []
      const contacts = value.contacts ?? []

      for (const message of messages) {
        // Only process the first message (type: text, button, etc.)
        // Ignore status updates (they come in a different field)
        const waId     = message.from as string
        const referral = message.referral ?? {}
        const ctwaClid = (referral.ctwa_clid as string) || null
        const metaAdId = (referral.source_id as string) || null
        const hasMetaReferral = Boolean(metaAdId || ctwaClid)
        const text = messageText(message)
        const adMeta = hasMetaReferral ? {
          metaAdId,
          adHeadline: referral.headline ?? null,
          adBody: referral.body ?? null,
          adSourceUrl: referral.source_url ?? null,
          adSourceType: referral.source_type ?? null,
        } : undefined
        const contact  = contacts.find((c: any) => c.wa_id === waId)
        const name     = contact?.profile?.name || waId
        const phone    = '+' + waId

        let source = 'Indefinido'
        let utmSource: string | null = null
        const utmMedium = 'WhatsApp'
        let utmCampaign: string | null = null

        if (hasMetaReferral) {
          source = 'Meta'
          utmSource = 'meta'
          utmCampaign = (referral.headline as string) || metaAdId
        } else if (text) {
          const phrases = await prisma.trackingPhrase.findMany({ where: { workspaceId } })
          const normalizedText = text.toLocaleLowerCase('pt-BR')
          const matched = phrases.find(item => {
            const phrase = item.phrase.trim().toLocaleLowerCase('pt-BR')
            return phrase.length > 0 && normalizedText.includes(phrase)
          })
          if (matched) {
            source = matched.source
            utmCampaign = matched.campaign ?? null
          }
        }

        const existingLead = await findDuplicateLead(workspaceId, phone, null)

        if (existingLead) {
          // Enriquece contatos antigos sem substituir uma origem válida que a equipe já definiu.
          const fillSource = source !== 'Indefinido' && canFillSource(existingLead.source)
          if (
            fillSource
            || (ctwaClid && !existingLead.ctwaClid)
            || (metaAdId && !existingLead.metaAdId)
          ) {
            await prisma.lead.update({
              where: { id: existingLead.id },
              data: {
                ...(fillSource && { source }),
                ...(fillSource && utmSource && !existingLead.utmSource && { utmSource }),
                ...(fillSource && !existingLead.utmMedium && { utmMedium }),
                ...(fillSource && utmCampaign && !existingLead.utmCampaign && { utmCampaign }),
                ...(ctwaClid && !existingLead.ctwaClid && { ctwaClid }),
                ...(metaAdId && !existingLead.metaAdId && { metaAdId }),
                ...(adMeta && { metadata: adMeta }),
              },
            })
          }
          continue
        }

        // New contact — find the first pipeline stage to place them in
        const firstStage = await prisma.pipelineStage.findFirst({
          where: { workspaceId },
          orderBy: { order: 'asc' },
        })
        if (!firstStage) continue

        const identity = await getLeadIdentity(workspaceId, phone, null)
        let newLead
        try {
          newLead = await prisma.lead.create({
            data: {
              workspaceId,
              name,
              phone,
              ...identity,
              source,
              utmSource,
              utmMedium,
              utmCampaign,
              ctwaClid,
              metaAdId,
              metadata: adMeta ?? undefined,
              notes: text ? `Primeira mensagem: ${text}` : undefined,
              pipelineStageId: firstStage.id,
            },
          })
        } catch (error) {
          if (isLeadIdentityConflict(error)) continue
          throw error
        }

        // Immediately queue a Lead CAPI event if we have a ctwa_clid
        // This tells Meta that the ad generated a lead (top-of-funnel signal)
        if (ctwaClid) {
          await enqueueCapiEvent({
            workspaceId,
            leadId: newLead.id,
            eventName: 'Lead',
            source: 'whatsapp',
            userData: { phone: newLead.phone, ctwaClid },
          })
        }
      }
    }
  }

  // Meta requires 200 OK, otherwise it retries the webhook
  return NextResponse.json({ received: true })
}
