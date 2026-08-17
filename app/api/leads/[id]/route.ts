import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { findDuplicateLead, getLeadIdentity, isLeadIdentityConflict } from '@/lib/lead-identity'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, email, phone, notes, source, pipelineStageId, clientType } = body

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
  })
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  const nextPhone = phone !== undefined ? phone : lead.phone
  const nextEmail = email !== undefined ? email : lead.email
  const contactChanged = nextPhone !== lead.phone || nextEmail !== lead.email
  if (contactChanged) {
    const duplicate = await findDuplicateLead(auth.workspaceId, nextPhone, nextEmail, lead.id)
    if (duplicate) {
      return NextResponse.json({ error: 'Já existe outro lead com este telefone ou e-mail', leadId: duplicate.id }, { status: 409 })
    }
  }
  const identity = contactChanged ? await getLeadIdentity(auth.workspaceId, nextPhone, nextEmail) : {}

  let updated
  try {
    updated = await prisma.lead.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...identity,
        ...(clientType !== undefined && { clientType: clientType || null }),
        ...(notes !== undefined && { notes }),
        ...(source !== undefined && { source }),
        ...(pipelineStageId !== undefined && { pipelineStageId }),
      },
      include: { stage: true, deals: { include: { product: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
    })
  } catch (error) {
    if (isLeadIdentityConflict(error)) {
      return NextResponse.json({ error: 'Já existe outro lead com este telefone ou e-mail' }, { status: 409 })
    }
    throw error
  }

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
