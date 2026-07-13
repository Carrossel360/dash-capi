import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { dateRange } from '@/lib/trafego-period'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const stageId = searchParams.get('stageId')
  const period  = searchParams.get('period')
  const from    = searchParams.get('from')
  const to      = searchParams.get('to')

  // `period` (this_month/last_month/7d/30d/custom/...) monta um range fechado {gte,lte} via
  // dateRange — mesmo helper usado por Tráfego Pago/Social Media, pra "Visão Geral" respeitar
  // o período selecionado. Sem `period`, mantém o comportamento legado só com `from` (gte aberto),
  // usado pelo Pipeline (que só filtra "a partir de", sem período fechado).
  const range = period ? dateRange(period, from, to) : undefined
  const dateFilter = range ? { createdAt: range } : from ? { createdAt: { gte: new Date(from) } } : {}

  const leads = await prisma.lead.findMany({
    where: {
      workspaceId: auth.workspaceId,
      ...(stageId ? { pipelineStageId: stageId } : {}),
      ...dateFilter,
    },
    include: { stage: true },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(leads)
}

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, phone, email, source, stageId, dealValue, tags } = body

  if (!name || !stageId) {
    return NextResponse.json({ error: 'name e stageId são obrigatórios' }, { status: 400 })
  }

  const stage = await prisma.pipelineStage.findFirst({
    where: { id: stageId, workspaceId: auth.workspaceId },
  })
  if (!stage) return NextResponse.json({ error: 'Stage não encontrado' }, { status: 404 })

  const lead = await prisma.lead.create({
    data: {
      workspaceId: auth.workspaceId,
      name,
      phone,
      email,
      source,
      pipelineStageId: stageId,
      dealValue,
      tags: tags || [],
    },
    include: { stage: true },
  })

  return NextResponse.json(lead, { status: 201 })
}
