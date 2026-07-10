import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Série fixa dos últimos 12 meses calendário (independente do período escolhido nos KPIs
// acima) — o gráfico "Leads por mês" deve sempre mostrar uma tendência mensal estável.
const MONTHS = 12

function resultOf(resultados: number | null, conversas: number | null): number {
  return (Number(resultados) || 0) || (Number(conversas) || 0)
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthPayload(req)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const now = new Date()
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1), 1))

    const [metaRows, googRows] = await Promise.all([
      prisma.metaAdsDailyData.findMany({
        where: { workspaceId: auth.workspaceId, date: { gte: since } },
        select: { date: true, resultados: true, conversasIniciadas: true },
      }),
      prisma.googleAdsDailyData.findMany({
        where: { workspaceId: auth.workspaceId, date: { gte: since } },
        select: { date: true, resultados: true },
      }),
    ])

    const byMonth = new Map<string, { meta: number; google: number }>()
    for (let i = 0; i < MONTHS; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1 - i), 1))
      byMonth.set(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, { meta: 0, google: 0 })
    }

    for (const r of metaRows) {
      const key = `${r.date.getUTCFullYear()}-${String(r.date.getUTCMonth() + 1).padStart(2, '0')}`
      const bucket = byMonth.get(key)
      if (bucket) bucket.meta += resultOf(r.resultados, r.conversasIniciadas)
    }
    for (const r of googRows) {
      const key = `${r.date.getUTCFullYear()}-${String(r.date.getUTCMonth() + 1).padStart(2, '0')}`
      const bucket = byMonth.get(key)
      if (bucket) bucket.google += Number(r.resultados) || 0
    }

    const chart = [...byMonth.entries()].map(([key, v]) => {
      const [y, m] = key.split('-')
      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'short' })
      return { mes: label.charAt(0).toUpperCase() + label.slice(1).replace('.', ''), meta: Math.round(v.meta), google: Math.round(v.google) }
    })

    return NextResponse.json({ chart })
  } catch (err) {
    console.error('[/api/dashboard/leads-by-month]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
