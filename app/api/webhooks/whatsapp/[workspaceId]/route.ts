import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { enqueueCapiEvent } from '@/lib/capi-events'

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
        const adMeta   = metaAdId ? { metaAdId, adHeadline: referral.headline ?? null } : undefined
        const contact  = contacts.find((c: any) => c.wa_id === waId)
        const name     = contact?.profile?.name || waId
        const phone    = '+' + waId

        const existingLead = await prisma.lead.findFirst({
          where: { workspaceId, phone },
        })

        if (existingLead) {
          // New ad click on existing contact — update attribution data
          if (ctwaClid && !existingLead.ctwaClid) {
            await prisma.lead.update({
              where: { id: existingLead.id },
              data: {
                ctwaClid,
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

        const newLead = await prisma.lead.create({
          data: {
            workspaceId,
            name,
            phone,
            source: 'whatsapp',
            ctwaClid,
            metadata: adMeta ?? undefined,
            pipelineStageId: firstStage.id,
          },
        })

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
