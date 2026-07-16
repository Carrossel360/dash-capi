import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { enqueueCapiEvent, stageEventName } from '@/lib/capi-events'

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { leadId, productId, value, stageId } = await req.json()
  if (!leadId || !stageId) return NextResponse.json({ error: 'leadId e stageId obrigatórios' }, { status: 400 })

  const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId: auth.workspaceId } })
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, workspaceId: auth.workspaceId } })
  if (!stage) return NextResponse.json({ error: 'Stage não encontrado' }, { status: 404 })

  // Create deal
  const deal = await prisma.deal.create({
    data: {
      workspaceId: auth.workspaceId,
      leadId,
      productId: productId || null,
      value: Number(value) || 0,
      status: 'won',
    },
    include: { product: true },
  })

  // Move lead to the stage and record deal value
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      pipelineStageId: stageId,
      dealValue: Number(value) || 0,
      closedAt: new Date(),
    },
  })

  // Fire CAPI event if stage has a trigger configured
  const eventName = stageEventName(stage.triggerCapiEvent)
  if (eventName) {
    const source = lead.ctwaClid ? 'whatsapp' : 'crm'
    await enqueueCapiEvent({
      workspaceId: auth.workspaceId,
      leadId,
      eventName,
      source,
      userData: { email: lead.email, phone: lead.phone, ctwaClid: lead.ctwaClid ?? undefined },
      customData: { value: Number(value) || 0, currency: 'BRL' },
      dedupe: eventName !== 'Purchase',
    })
  }

  return NextResponse.json({ deal })
}
