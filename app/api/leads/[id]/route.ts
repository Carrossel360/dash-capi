import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, email, phone, notes, source, pipelineStageId } = body

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
  })
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  const updated = await prisma.lead.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
      ...(notes !== undefined && { notes }),
      ...(source !== undefined && { source }),
      ...(pipelineStageId !== undefined && { pipelineStageId }),
    },
    include: { stage: true, deals: { include: { product: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
  })

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
  })
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  await prisma.lead.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
