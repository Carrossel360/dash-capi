import { prisma } from '@/lib/db'
import { buildMetaTrafficSnapshot, buildGoogleTrafficSnapshot } from '@/lib/trafego-aggregate'
import { generateTrafficReportOpenAI } from '@/lib/openai'
import { generateTrafficReportClaude } from '@/lib/anthropic'

export const REPORT_SERVICE = 'trafego_pago'
const REPORT_PERIOD = '30d'

// Tipo compartilhado entre os provedores de IA (OpenAI/Anthropic) — a UI de
// Relatórios com IA renderiza esse shape sem se importar com quem gerou.
export interface GeneratedReport {
  summary: string
  insights: string[]
  recommendations: string[]
}

export const REPORT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    insights: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'insights', 'recommendations'],
  additionalProperties: false,
} as const

export const REPORT_SYSTEM_PROMPT =
  'Você é um analista de tráfego pago sênior de uma agência de marketing, escrevendo em português do Brasil. ' +
  'Analise os dados de campanhas (Meta Ads e/ou Google Ads) fornecidos e produza uma análise objetiva e acionável, ' +
  'sem enrolação. Responda sempre em JSON válido no formato ' +
  '{ "summary": string, "insights": string[], "recommendations": string[] } — ' +
  '"summary" é um parágrafo curto com o panorama geral do período; "insights" são observações concretas ' +
  'baseadas nos números (o que subiu/caiu, o que chama atenção); "recommendations" são ações práticas sugeridas. ' +
  'IMPORTANTE: os campos "vendas" e "roas" dentro de "chart" e "campaigns" (em meta/google) são placeholders ' +
  'sempre zerados/"-" — ainda não são calculados por campanha, então NUNCA os use pra afirmar algo sobre vendas ou ' +
  'ausência delas. A única fonte confiável de vendas reais é o campo "vendasCRM" (fora de meta/google): ' +
  '{ count, value } com os negócios fechados no CRM dentro do período — baseie qualquer comentário sobre ' +
  'conversão em vendas/faturamento só nesse campo.'

export function buildReportUserPrompt(snapshot: unknown, customPrompt?: string): string {
  return (
    `Dados do período (JSON):\n${JSON.stringify(snapshot)}\n\n` +
    (customPrompt
      ? `Instrução específica deste cliente sobre o que priorizar na análise: ${customPrompt}\n\n`
      : '') +
    'Gere a análise agora, seguindo o formato JSON pedido.'
  )
}

function parseGeneratedReport(raw: string): GeneratedReport {
  const parsed = JSON.parse(raw) as Partial<GeneratedReport>
  if (
    typeof parsed.summary !== 'string' ||
    !Array.isArray(parsed.insights) ||
    !Array.isArray(parsed.recommendations)
  ) {
    throw new Error('Formato inesperado na resposta da IA')
  }
  return parsed as GeneratedReport
}

export { parseGeneratedReport }

// Vendas reais fechadas no CRM dentro do período — diferente de "vendas"/"roas" em
// chart/campaigns (placeholders zerados, nunca ligados ao CRM). Usa o model Deal
// (criado quando o negócio é registrado como ganho no LeadModal), não Lead.closedAt —
// esse campo existe no schema mas nunca é preenchido pelo app hoje, então filtrar por
// ele sempre retornaria zero mesmo com vendas reais no período.
async function fetchClosedDealsSummary(workspaceId: string, days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const result = await prisma.deal.aggregate({
    where: { workspaceId, status: 'ganho', createdAt: { gte: since } },
    _count: { id: true },
    _sum: { value: true },
  })
  return { count: result._count.id, value: result._sum.value ?? 0 }
}

// Usado tanto pela rota on-demand (app/api/reports/generate) quanto pelo
// cron diário (app/api/cron/reports) — monta o snapshot de tráfego do
// workspace, chama o provedor de IA configurado e grava o resultado como
// Insight, além de atualizar lastGeneratedAt na config.
export async function generateAndSaveReport(
  workspace: { id: string; svcMetaAds: boolean; svcGoogleAds: boolean },
  config: { aiProvider: string; customPrompt?: string | null }
) {
  const [meta, google, vendasCRM] = await Promise.all([
    workspace.svcMetaAds ? buildMetaTrafficSnapshot(workspace.id, REPORT_PERIOD) : Promise.resolve(null),
    workspace.svcGoogleAds ? buildGoogleTrafficSnapshot(workspace.id, REPORT_PERIOD) : Promise.resolve(null),
    fetchClosedDealsSummary(workspace.id, parseInt(REPORT_PERIOD, 10)),
  ])

  if (!meta && !google) {
    throw new Error('Cliente não tem Meta Ads nem Google Ads configurado — nada para analisar')
  }

  const snapshot = { periodo: 'últimos 30 dias', meta, google, vendasCRM }
  const generate = config.aiProvider === 'anthropic' ? generateTrafficReportClaude : generateTrafficReportOpenAI
  const report = await generate({ snapshot, customPrompt: config.customPrompt ?? undefined })

  const [insight] = await Promise.all([
    prisma.insight.create({
      data: {
        workspaceId: workspace.id,
        service: REPORT_SERVICE,
        period: REPORT_PERIOD,
        content: JSON.stringify(report),
      },
    }),
    prisma.reportConfig.updateMany({
      where: { workspaceId: workspace.id, service: REPORT_SERVICE },
      data: { lastGeneratedAt: new Date() },
    }),
  ])

  return insight
}
