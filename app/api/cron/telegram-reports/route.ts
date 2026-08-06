import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendTelegramAlert } from '@/lib/telegram'
import { REPORT_SERVICES, parseGeneratedReport } from '@/lib/ai-reports'

// Item 9 da lista de ajustes — notificação diária no grupo único do Telegram da agência
// (mesmo lib/telegram.ts já usado pelos alertas de lib/monitor.ts), por dia da semana:
// Seg = Visão Geral agregada (sem IA, direto do banco), Ter = Tráfego Pago, Qua = Social
// Media (relatório de IA mais recente já gerado por cada cliente, um Telegram por cliente).
// Qui (Pendências) fica de fora por enquanto — depende da gestão de tarefas, ainda não
// implementada. Sex/Sáb/Dom sem envio.
//
// Diferente de app/api/cron/reports (que decide QUANDO gerar um novo relatório, conforme
// ReportConfig.frequencyDays): este cron só decide QUANDO avisar sobre o que já existe —
// não força geração nova toda terça/quarta, só pega o Insight mais recente de cada cliente.
export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get('authorization')
  if (process.env.CRON_SECRET && cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const day = new Date().getDay() // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
  let sent = 0
  let failed = 0

  if (day === 1) {
    const ok = await sendMondayOverview()
    ok ? sent++ : failed++
  } else if (day === 2) {
    const r = await sendServiceDigest('trafego_pago')
    sent += r.sent; failed += r.failed
  } else if (day === 3) {
    const r = await sendServiceDigest('social_media')
    sent += r.sent; failed += r.failed
  }
  // Qui (Pendências) e Sex/Sáb/Dom: sem envio por enquanto.

  return NextResponse.json({ day, sent, failed })
}

function fmtMoney(value: number, currency: string): string {
  const cs = currency === 'USD' ? 'US$' : 'R$'
  return `${cs} ${value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}

// Segunda-feira — resumo agregado de todos os clientes ativos, sem IA (direto dos dados),
// cobrindo os últimos 7 dias (cadência semanal, diferente dos 30 dias usados pelo relatório
// de IA de Tráfego Pago). Investimento é somado por moeda separadamente — clientes em BRL e
// USD não podem ser somados juntos sem distorcer o total.
async function sendMondayOverview(): Promise<boolean> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const clients = await prisma.workspace.findMany({
    where: { isAgency: false, isActive: true },
    select: { id: true, currency: true },
  })
  if (clients.length === 0) return false
  const clientIds = clients.map(c => c.id)
  const currencyByWorkspace = Object.fromEntries(clients.map(c => [c.id, c.currency ?? 'BRL']))

  const [metaRows, googleRows, leadsCount, deals] = await Promise.all([
    prisma.metaAdsDailyData.findMany({ where: { workspaceId: { in: clientIds }, date: { gte: since } }, select: { workspaceId: true, valorGasto: true } }),
    prisma.googleAdsDailyData.findMany({ where: { workspaceId: { in: clientIds }, date: { gte: since } }, select: { workspaceId: true, valorGasto: true } }),
    prisma.lead.count({ where: { workspaceId: { in: clientIds }, createdAt: { gte: since } } }),
    prisma.deal.aggregate({
      where: { workspaceId: { in: clientIds }, status: 'ganho', createdAt: { gte: since } },
      _count: { id: true },
      _sum: { value: true },
    }),
  ])

  const investByCurrency: Record<string, number> = {}
  for (const r of [...metaRows, ...googleRows]) {
    const cur = currencyByWorkspace[r.workspaceId] ?? 'BRL'
    investByCurrency[cur] = (investByCurrency[cur] ?? 0) + (Number(r.valorGasto) || 0)
  }
  const investLines = Object.entries(investByCurrency).map(([cur, val]) => fmtMoney(val, cur)).join(' + ')

  const text =
    `📊 <b>Visão Geral da Semana — Sistema Orbital</b>\n` +
    `Últimos 7 dias, ${clients.length} cliente${clients.length === 1 ? '' : 's'} ativo${clients.length === 1 ? '' : 's'}\n\n` +
    `💰 Investimento: ${investLines || 'sem dado'}\n` +
    `👥 Leads: ${leadsCount}\n` +
    `✅ Clientes fechados (vendas): ${deals._count.id} (${fmtMoney(deals._sum.value ?? 0, 'BRL')})`

  return sendTelegramAlert(text)
}

type DigestService = 'trafego_pago' | 'social_media'

// Terça/quarta — um Telegram por cliente, com o resumo executivo do relatório de IA mais
// recente já gerado (não gera um novo agora — só avisa sobre o que já existe).
async function sendServiceDigest(service: DigestService): Promise<{ sent: number; failed: number }> {
  const clients = await prisma.workspace.findMany({
    where: {
      isAgency: false,
      isActive: true,
      ...(service === 'trafego_pago'
        ? { OR: [{ svcMetaAds: true }, { svcGoogleAds: true }] }
        : { svcSocialMedia: true }),
    },
    select: { id: true, name: true },
  })

  let sent = 0
  let failed = 0

  for (const client of clients) {
    const insight = await prisma.insight.findFirst({
      where: { workspaceId: client.id, service },
      orderBy: { createdAt: 'desc' },
    })
    if (!insight) continue // nada gerado ainda pra esse cliente/serviço — pula silenciosamente

    try {
      const report = parseGeneratedReport(insight.content)
      const label = REPORT_SERVICES[service]
      // Tráfego Pago pode vir no formato novo (resumoExecutivo/diagnosticoTecnico, Camada 1
      // já é o texto pro cliente) ou no antigo (summary) — Social Media só tem o antigo.
      const excerpt = report.kind === 'v2' ? report.resumoExecutivo : report.summary
      const text =
        `📈 <b>${label} — ${client.name}</b>\n\n` +
        `${excerpt}`
      const ok = await sendTelegramAlert(text)
      ok ? sent++ : failed++
    } catch (err) {
      console.error(`[telegram-reports] ${service} workspace ${client.id}`, err)
      failed++
    }
  }

  return { sent, failed }
}
