import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

// 'agencia' — métricas da Visão Geral da Agência sem fonte automática (item 4/12 do pedido):
// reunioes/cac/ticket_medio_tipo1/qtd_ativos_tipo1/qtd_ativos_tipo2/ltv/churn/csat/nps/
// mrr/mrr_projetado/custo_csp/custo_mcb — ver app/api/agency/overview/route.ts
const VALID_SERVICES = ['meta_ads', 'google_ads', 'social_media', 'agencia']

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = req.nextUrl.searchParams.get('service')
  const period = req.nextUrl.searchParams.get('period')
  if (!service || !period || !VALID_SERVICES.includes(service)) {
    return NextResponse.json({ error: 'service e period obrigatórios' }, { status: 400 })
  }

  const rows = await prisma.manualMetric.findMany({
    where: { workspaceId: auth.workspaceId, service, period },
  })

  const overrides = Object.fromEntries(rows.map(r => [r.metricKey, r.value]))
  return NextResponse.json({ overrides })
}

export async function PUT(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { service, period, metricKey, value } = await req.json()
  if (!service || !period || !metricKey || value === undefined || !VALID_SERVICES.includes(service)) {
    return NextResponse.json({ error: 'service, period, metricKey e value obrigatórios' }, { status: 400 })
  }

  const row = await prisma.manualMetric.upsert({
    where: {
      workspaceId_service_metricKey_period: {
        workspaceId: auth.workspaceId, service, metricKey, period,
      },
    },
    create: { workspaceId: auth.workspaceId, service, metricKey, period, value: Number(value) },
    update: { value: Number(value) },
  })

  return NextResponse.json(row)
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const service = req.nextUrl.searchParams.get('service')
  const period = req.nextUrl.searchParams.get('period')
  const metricKey = req.nextUrl.searchParams.get('metricKey')
  if (!service || !period || !metricKey) {
    return NextResponse.json({ error: 'service, period e metricKey obrigatórios' }, { status: 400 })
  }

  await prisma.manualMetric.deleteMany({
    where: { workspaceId: auth.workspaceId, service, metricKey, period },
  })

  return NextResponse.json({ ok: true })
}
