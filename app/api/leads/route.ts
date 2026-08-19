import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { dateRange } from '@/lib/trafego-period'
import { findDuplicateLead, getLeadIdentity, isLeadIdentityConflict } from '@/lib/lead-identity'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const stageId = searchParams.get('stageId')
  const period  = searchParams.get('period')
  const from    = searchParams.get('from')
  const to      = searchParams.get('to')
  // dateField=closedAt — pra faturamento por período (quando a venda fechou), não quando o
  // lead entrou. Sem isso, "últimos 30 dias" de faturamento ficava contando só vendas de leads
  // que também chegaram nesses 30 dias, ignorando vendas fechadas agora de leads mais antigos
  // (foi exatamente a causa de "Faturamento" no Dashboard não bater com o CRM antigo).
  const dateField = searchParams.get('dateField') === 'closedAt' ? 'closedAt' : 'createdAt'

  // `period` (this_month/last_month/7d/30d/custom/...) monta um range fechado {gte,lte} via
  // dateRange — mesmo helper usado por Tráfego Pago/Social Media, pra "Visão Geral" respeitar
  // o período selecionado. Sem `period`, mantém o comportamento legado só com `from` (gte aberto),
  // usado pelo Pipeline (que só filtra "a partir de", sem período fechado).
  const range = period ? dateRange(period, from, to) : undefined
  const directRange = from
    ? { gte: new Date(from), ...(to ? { lte: new Date(to) } : {}) }
    : undefined
  const dateFilter = range ? { [dateField]: range } : directRange ? { [dateField]: directRange } : {}

  const leads = await prisma.lead.findMany({
    where: {
      workspaceId: auth.workspaceId,
      ...(stageId ? { pipelineStageId: stageId } : {}),
      ...dateFilter,
    },
    include: {
      stage: true,
      deals: { select: { id: true, value: true, product: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(leads)
}

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, phone, email, source, stageId, dealValue, tags, clientType } = body

  if (!name || !stageId) {
    return NextResponse.json({ error: 'name e stageId são obrigatórios' }, { status: 400 })
  }

  const stage = await prisma.pipelineStage.findFirst({
    where: { id: stageId, workspaceId: auth.workspaceId },
  })
  if (!stage) return NextResponse.json({ error: 'Stage não encontrado' }, { status: 404 })

  const duplicate = await findDuplicateLead(auth.workspaceId, phone, email)
  if (duplicate) {
    return NextResponse.json({ error: 'Já existe um lead com este telefone ou e-mail', leadId: duplicate.id }, { status: 409 })
  }

  const identity = await getLeadIdentity(auth.workspaceId, phone, email)
  let lead
  try {
    lead = await prisma.lead.create({
      data: {
        workspaceId: auth.workspaceId,
        name,
        phone,
        email,
        ...identity,
        clientType: clientType || null,
        source,
        pipelineStageId: stageId,
        dealValue,
        tags: tags || [],
      },
      include: { stage: true },
    })
  } catch (error) {
    if (isLeadIdentityConflict(error)) {
      return NextResponse.json({ error: 'Já existe um lead com este telefone ou e-mail' }, { status: 409 })
    }
    throw error
  }

  return NextResponse.json(lead, { status: 201 })
}
