import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { backfillWorkspaceMetaAds } from '@/lib/ads-sync'
import { dateRange } from '@/lib/trafego-period'

const MAX_BACKFILL_DAYS = 90

// Botão "Buscar dados históricos" em Tráfego Pago (Meta Ads) — mesmo raciocínio do backfill
// de Google Ads: o sync horário só reprocessa uma janela móvel de 30 dias.
export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const range = dateRange(body.period ?? 'custom', body.from, body.to)
  if (!range) return NextResponse.json({ error: 'Período inválido' }, { status: 400 })

  const days = Math.ceil((range.lte.getTime() - range.gte.getTime()) / 86_400_000) + 1
  if (days > MAX_BACKFILL_DAYS) {
    return NextResponse.json({ error: `Range muito grande (máx. ${MAX_BACKFILL_DAYS} dias por vez)` }, { status: 400 })
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: auth.workspaceId } })
  if (!workspace) return NextResponse.json({ error: 'Workspace não encontrado' }, { status: 404 })

  const fromStr = range.gte.toISOString().slice(0, 10)
  const toStr = range.lte.toISOString().slice(0, 10)
  const result = await backfillWorkspaceMetaAds(workspace, fromStr, toStr)
  return NextResponse.json({ result })
}
