import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload, isAgencyStaff } from '@/lib/auth'
import { prisma } from '@/lib/db'

const ORIGINS = ['Google', 'Meta', 'Indefinido']

function isMatri(workspace: { name: string; slug: string }) {
  return workspace.name.toLowerCase().trim() === 'matri' || workspace.slug === 'matri'
}

function toNumber(v: unknown) {
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function monthToPeriod(month: Date | string | null | undefined) {
  if (!month) return 'total'
  const d = typeof month === 'string' ? new Date(month) : month
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

async function requireMatriWorkspace(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true, slug: true },
  })
  if (!workspace) return { error: NextResponse.json({ error: 'Workspace não encontrado' }, { status: 404 }) }
  if (!isMatri(workspace)) return { error: NextResponse.json({ error: 'Conciliação disponível apenas para Matri' }, { status: 403 }) }
  return { workspace }
}

async function spendFor(workspaceId: string, origin: string, period: string) {
  if (origin === 'Indefinido') return 0
  const where = period === 'total'
    ? { workspaceId }
    : {
        workspaceId,
        date: {
          gte: new Date(`${period}-01T00:00:00.000Z`),
          lt: new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 1)),
        },
      }
  const result = origin === 'Google'
    ? await prisma.googleAdsDailyData.aggregate({ where, _sum: { valorGasto: true } })
    : await prisma.metaAdsDailyData.aggregate({ where, _sum: { valorGasto: true } })
  return result._sum.valorGasto ?? 0
}

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const guard = await requireMatriWorkspace(auth.workspaceId)
  if ('error' in guard) return guard.error

  const period = req.nextUrl.searchParams.get('period')
  const [summary, rows] = await Promise.all([
    prisma.leadReconciliationSummary.findUnique({ where: { workspaceId: auth.workspaceId } }),
    prisma.leadReconciliationRow.findMany({
      where: { workspaceId: auth.workspaceId, ...(period ? { period } : {}) },
      orderBy: [{ month: 'asc' }, { origin: 'asc' }],
    }),
  ])

  const rowsWithSpend = await Promise.all(rows.map(async r => ({
    row: r,
    spend: await spendFor(auth.workspaceId, r.origin, r.period),
  })))

  return NextResponse.json({
    summary: summary ? {
      totalLinhasBc: summary.totalLinhasBc,
      leadsUnicos: summary.leadsUnicos,
      duplicatas: summary.duplicatas,
      leadsConvertidos: summary.leadsConvertidos,
      leadsNaoConvertidos: summary.leadsNaoConvertidos,
      faturamentoTotal: Number(summary.faturamentoTotal),
      ticketMedio: Number(summary.ticketMedio),
      taxaConversao: Number(summary.taxaConversao),
      leadsCrmTotal: summary.leadsCrmTotal,
      obs: summary.obs,
    } : null,
    rows: rowsWithSpend.map(({ row: r, spend }) => ({
      id: r.id,
      origin: r.origin,
      period: r.period,
      month: r.month?.toISOString().slice(0, 10) ?? null,
      leadsUnicos: r.leadsUnicos,
      convertidos: r.convertidos,
      faturamento: Number(r.faturamento),
      spend,
    })),
  })
}

export async function PUT(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAgencyStaff(auth.userId))) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const guard = await requireMatriWorkspace(auth.workspaceId)
  if ('error' in guard) return guard.error

  const body = await req.json()

  if (body.summary) {
    const s = body.summary
    const leadsUnicos = Math.max(0, Math.round(toNumber(s.leadsUnicos)))
    const leadsConvertidos = Math.max(0, Math.round(toNumber(s.leadsConvertidos)))
    const faturamentoTotal = toNumber(s.faturamentoTotal)
    const derivedSummary = {
      totalLinhasBc: Math.max(0, Math.round(toNumber(s.totalLinhasBc))),
      leadsUnicos,
      duplicatas: Math.max(0, Math.round(toNumber(s.duplicatas))),
      leadsConvertidos,
      leadsNaoConvertidos: Math.max(0, leadsUnicos - leadsConvertidos),
      faturamentoTotal,
      ticketMedio: leadsConvertidos > 0 ? faturamentoTotal / leadsConvertidos : 0,
      taxaConversao: leadsUnicos > 0 ? (leadsConvertidos / leadsUnicos) * 100 : 0,
      leadsCrmTotal: Math.max(0, Math.round(toNumber(s.leadsCrmTotal))),
      obs: typeof s.obs === 'string' ? s.obs : null,
    }
    await prisma.leadReconciliationSummary.upsert({
      where: { workspaceId: auth.workspaceId },
      update: derivedSummary,
      create: { workspaceId: auth.workspaceId, ...derivedSummary },
    })
  }

  if (body.row) {
    const r = body.row
    const origin = ORIGINS.includes(r.origin) ? r.origin : 'Indefinido'
    const period = typeof r.period === 'string' && r.period ? r.period : monthToPeriod(r.month)
    const month = period === 'total' ? null : new Date(`${period}-01T00:00:00.000Z`)
    await prisma.leadReconciliationRow.upsert({
      where: { workspaceId_origin_period: { workspaceId: auth.workspaceId, origin, period } },
      update: {
        leadsUnicos: Math.max(0, Math.round(toNumber(r.leadsUnicos))),
        convertidos: Math.max(0, Math.round(toNumber(r.convertidos))),
        faturamento: toNumber(r.faturamento),
        month,
      },
      create: {
        workspaceId: auth.workspaceId,
        origin,
        period,
        leadsUnicos: Math.max(0, Math.round(toNumber(r.leadsUnicos))),
        convertidos: Math.max(0, Math.round(toNumber(r.convertidos))),
        faturamento: toNumber(r.faturamento),
        month,
      },
    })
  }

  return NextResponse.json({ ok: true })
}
