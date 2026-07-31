import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { enqueueCapiEvent, stageEventName } from '@/lib/capi-events'

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { leadId, stageId, items } = await req.json() as {
    leadId?: string; stageId?: string; items?: { productId: string | null; value: number }[]
  }
  if (!leadId || !stageId) return NextResponse.json({ error: 'leadId e stageId obrigatórios' }, { status: 400 })

  const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId: auth.workspaceId } })
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, workspaceId: auth.workspaceId } })
  if (!stage) return NextResponse.json({ error: 'Stage não encontrado' }, { status: 404 })

  // Uma venda pode envolver mais de um produto/serviço ao mesmo tempo (ex: "Odontologia
  // estética" + "Periodontia" juntas) — cada item vira seu próprio Deal (schema não tem
  // tabela de itens por Deal), e o valor total do lead é a soma de todos.
  const validItems = (Array.isArray(items) ? items : []).filter(i => i.value > 0)
  const total = validItems.reduce((s, i) => s + i.value, 0)

  const deals = await Promise.all(validItems.map(item => prisma.deal.create({
    data: {
      workspaceId: auth.workspaceId,
      leadId,
      productId: item.productId || null,
      value: item.value,
      status: 'won',
    },
  })))

  // Move lead to the stage and record deal value
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      pipelineStageId: stageId,
      dealValue: total,
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
      customData: { value: total, currency: 'BRL' },
      dedupe: eventName !== 'Purchase',
    })
  }

  return NextResponse.json({ deals, total })
}
