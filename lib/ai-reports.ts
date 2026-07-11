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
  'baseadas nos números (o que subiu/caiu, o que chama atenção); "recommendations" são ações práticas sugeridas.'

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

// Usado tanto pela rota on-demand (app/api/reports/generate) quanto pelo
// cron diário (app/api/cron/reports) — monta o snapshot de tráfego do
// workspace, chama o provedor de IA configurado e grava o resultado como
// Insight, além de atualizar lastGeneratedAt na config.
export async function generateAndSaveReport(
  workspace: { id: string; svcMetaAds: boolean; svcGoogleAds: boolean },
  config: { aiProvider: string; customPrompt?: string | null }
) {
  const [meta, google] = await Promise.all([
    workspace.svcMetaAds ? buildMetaTrafficSnapshot(workspace.id, REPORT_PERIOD) : Promise.resolve(null),
    workspace.svcGoogleAds ? buildGoogleTrafficSnapshot(workspace.id, REPORT_PERIOD) : Promise.resolve(null),
  ])

  if (!meta && !google) {
    throw new Error('Cliente não tem Meta Ads nem Google Ads configurado — nada para analisar')
  }

  const snapshot = { periodo: 'últimos 30 dias', meta, google }
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
