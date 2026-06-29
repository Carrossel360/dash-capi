import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { generateEventId } from '@/lib/utils'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { stageId, dealValue } = await req.json()
  if (!stageId) return NextResponse.json({ error: 'stageId obrigatório' }, { status: 400 })

  const stage = await prisma.pipelineStage.findFirst({
    where: { id: stageId, workspaceId: auth.workspaceId },
  })
  if (!stage) return NextResponse.json({ error: 'Stage não encontrado' }, { status: 404 })

  const lead = await prisma.lead.update({
    where: { id: params.id, workspaceId: auth.workspaceId },
    data: {
      pipelineStageId: stageId,
      ...(dealValue !== undefined && { dealValue }),
      ...(stage.triggerCapiEvent === 'purchase' && { closedAt: new Date() }),
    },
    include: { stage: true },
  })

  // Enfileira evento CAPI se o stage tem trigger configurado
  if (stage.triggerCapiEvent !== 'none') {
    const eventName = stage.triggerCapiEvent === 'purchase' ? 'Purchase' : 'Lead'
    const source = lead.ctwaClid ? 'whatsapp' : 'crm'
    await prisma.cAPIEvent.create({
      data: {
        workspaceId: auth.workspaceId,
        leadId: lead.id,
        eventName,
        eventTime: new Date(),
        eventId: generateEventId(),
        source,
        status: 'queued',
        userData: {
          email: lead.email,
          phone: lead.phone,
          ctwaClid: lead.ctwaClid ?? undefined,
        },
        customData: eventName === 'Purchase'
          ? { value: dealValue ?? lead.dealValue, currency: 'BRL' }
          : undefined,
      },
    })
  }

  return NextResponse.json(lead)
}
