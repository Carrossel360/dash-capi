import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

async function requireManage(workspaceId: string, userId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  })
  return membership && ['admin', 'manager'].includes(membership.role)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; stageId: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await requireManage(params.id, auth.userId))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const body = await req.json()
  const { name, color, order, triggerCapiEvent } = body

  const stage = await prisma.pipelineStage.findFirst({ where: { id: params.stageId, workspaceId: params.id } })
  if (!stage) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.pipelineStage.update({
    where: { id: params.stageId },
    data: {
      ...(name !== undefined && { name }),
      ...(color !== undefined && { color }),
      ...(order !== undefined && { order }),
      ...(triggerCapiEvent !== undefined && { triggerCapiEvent }),
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; stageId: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await requireManage(params.id, auth.userId))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const stage = await prisma.pipelineStage.findFirst({ where: { id: params.stageId, workspaceId: params.id } })
  if (!stage) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const leadsCount = await prisma.lead.count({ where: { pipelineStageId: params.stageId } })
  if (leadsCount > 0) return NextResponse.json({ error: `Existem ${leadsCount} leads neste estágio. Mova-os antes de excluir.` }, { status: 409 })

  await prisma.pipelineStage.delete({ where: { id: params.stageId } })
  return NextResponse.json({ ok: true })
}
