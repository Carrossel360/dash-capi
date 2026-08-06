import { prisma } from '@/lib/db'
import { buildMetaTrafficSnapshot, buildGoogleTrafficSnapshot, buildSocialMediaSnapshot, buildGoogleBusinessSnapshot } from '@/lib/trafego-aggregate'
import { generateTrafficReportOpenAI } from '@/lib/openai'
import { generateTrafficReportClaude } from '@/lib/anthropic'

// Mantido por compatibilidade com quem importava REPORT_SERVICE como o único serviço
// existente — hoje ReportConfig/Insight.service pode ser qualquer chave de REPORT_SERVICES.
export const REPORT_SERVICE = 'trafego_pago'

export const REPORT_SERVICES: Record<string, string> = {
  trafego_pago: 'Tráfego Pago',
  social_media: 'Social Media',
  google_business: 'Google Business Profile',
}
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
  'Você é um analista de tráfego pago sênior de uma agência de marketing, escrevendo em português do Brasil, ' +
  'pra clientes cujo funil termina em VENDA FECHADA NO CRM — não em checkout/compra online. ' +
  'O funil real é: Anúncio (Meta e/ou Google) → Lead capturado (WhatsApp clique-to-chat, Formulário do Site, ' +
  'Formulário Nativo Meta, ou busca no Google) → Pipeline do CRM → Venda fechada. Isso muda o que importa: em vez ' +
  'de ROAS/conversão de checkout, a métrica-chave é quantos leads efetivamente viraram venda no CRM, e se o canal ' +
  'que traz o lead mais barato/mais numeroso é realmente o que mais fecha negócio (às vezes não é). ' +
  'Responda sempre em JSON válido no formato { "summary": string, "insights": string[], "recommendations": string[] } ' +
  '— "summary" é um parágrafo curto com o panorama geral do período, sempre citando quantos leads entraram e ' +
  'quantas vendas fecharam no CRM; "insights" são observações concretas e diagnósticas baseadas nos números ' +
  '(o que subiu/caiu, cruzamentos como "CTR bom mas poucos leads" ou "lead barato mas poucas vendas fechadas" — ' +
  'esse último é sinal de gargalo comercial no pipeline, não do anúncio); "recommendations" são ações práticas. ' +
  'REGRAS IMPORTANTES: ' +
  '(1) Os campos "vendas" e "roas" dentro de "chart" e "campaigns" (em meta/google) são placeholders sempre ' +
  'zerados/"-" — NUNCA os use pra afirmar algo sobre vendas ou ausência delas. A única fonte confiável de vendas ' +
  'reais é "vendasCRM" (fora de meta/google): { count, value } com os negócios fechados no CRM no período. ' +
  '(2) "leadsPorCanal" traz a contagem de leads por canal de entrada no período — não existe CPL por canal ' +
  '(o gasto é só por plataforma de anúncio, não por canal de destino do lead), então NUNCA calcule ou invente ' +
  'um CPL por canal; comente só em volume/proporção. ' +
  '(3) Frequência (Meta) merece atenção mesmo antes de ficar alta: a maioria dos clientes roda campanhas em ' +
  'região/raio geográfico pequeno, então o público satura mais rápido que uma campanha nacional — se a frequência ' +
  'estiver subindo rápido, já vale sinalizar como ponto de atenção. ' +
  '(4) Se o cliente tiver Google Ads, considere quality_score e search_impression_share no diagnóstico: quality ' +
  'score baixo + CPC alto sugere keyword/anúncio/página de destino desalinhados; search_impression_share baixo + ' +
  'CTR bom sugere que o orçamento está limitando um anúncio que já performa bem. ' +
  '(5) Nunca invente atribuição de uma venda do CRM a uma campanha específica — não existe esse vínculo confiável ' +
  'nos dados disponíveis; trate vendas sempre como total do período, nunca "a campanha X gerou a venda Y".'

export const SOCIAL_MEDIA_SYSTEM_PROMPT =
  'Você é um analista de social media sênior de uma agência de marketing, escrevendo em português do Brasil. ' +
  'Analise os dados de Instagram fornecidos (alcance, visualizações, interações, seguidores, visitas ao perfil) ' +
  'e produza uma análise objetiva e acionável, sem enrolação. Responda sempre em JSON válido no formato ' +
  '{ "summary": string, "insights": string[], "recommendations": string[] } — ' +
  '"summary" é um parágrafo curto com o panorama geral do período; "insights" são observações concretas ' +
  'baseadas nos números (o que subiu/caiu, o que chama atenção — ex: queda de alcance, pico de interação num ' +
  'tipo de conteúdo específico como Reel/Post/Story); "recommendations" são ações práticas sugeridas pro ' +
  'próximo período (ex: formato de conteúdo a priorizar, horário, frequência de postagem). ' +
  'IMPORTANTE: se "hasData" ou "hasInstagram" no snapshot forem false, não invente números — diga claramente ' +
  'que não há dado suficiente no período pra análise.'

export const GOOGLE_BUSINESS_SYSTEM_PROMPT =
  'Você é um analista de marketing local sênior de uma agência, escrevendo em português do Brasil. ' +
  'Analise os dados do perfil Google Business (Google Meu Negócio) fornecidos — visualizações, ligações, ' +
  'solicitações de rota, avaliações, posição média de busca/mapa — e produza uma análise objetiva e acionável. ' +
  'Responda sempre em JSON válido no formato { "summary": string, "insights": string[], "recommendations": string[] }. ' +
  'O snapshot traz o mês mais recente ("current") e o anterior ("previous", pode ser null) pra comparação — ' +
  'esse dado é lançado manualmente 1x por mês pela equipe, não é sincronizado automaticamente, então trate como ' +
  'uma foto mensal, não uma série diária. Se "hasData" for false ou "current" for null, diga claramente que ' +
  'ainda não há dado lançado pra esse cliente, sem inventar números.'

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

// Quebra de leads por canal (utmMedium já carrega "WhatsApp"/"Formulário"/"Formulário Nativo"
// dependendo de onde o lead entrou — ver webhooks de uazapi/elementor/ads-sync). Não dá pra
// calcular CPL por canal com confiança (o gasto é só por plataforma de anúncio, não por canal
// de destino do lead), então só a contagem entra no snapshot — a IA é instruída a não inventar
// CPL por canal.
async function fetchLeadChannelBreakdown(workspaceId: string, days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const rows = await prisma.lead.groupBy({
    by: ['utmMedium'],
    where: { workspaceId, createdAt: { gte: since } },
    _count: { id: true },
  })
  return rows
    .map(r => ({ canal: r.utmMedium || 'Indefinido', leads: r._count.id }))
    .sort((a, b) => b.leads - a.leads)
}

function systemPromptForService(service: string): string {
  if (service === 'social_media') return SOCIAL_MEDIA_SYSTEM_PROMPT
  if (service === 'google_business') return GOOGLE_BUSINESS_SYSTEM_PROMPT
  return REPORT_SYSTEM_PROMPT
}

// Usado tanto pela rota on-demand (app/api/reports/generate) quanto pelo cron diário
// (app/api/cron/reports) — monta o snapshot do serviço pedido (config.service), chama o
// provedor de IA configurado com o prompt de sistema certo pro serviço, e grava o resultado
// como Insight, além de atualizar lastGeneratedAt na config.
export async function generateAndSaveReport(
  workspace: { id: string; svcMetaAds: boolean; svcGoogleAds: boolean; svcSocialMedia: boolean; svcGoogleBusiness: boolean },
  config: { service: string; aiProvider: string; aiModel?: string | null; customPrompt?: string | null }
) {
  const service = config.service in REPORT_SERVICES ? config.service : REPORT_SERVICE

  let snapshot: unknown
  if (service === 'social_media') {
    if (!workspace.svcSocialMedia) throw new Error('Cliente não tem Social Media configurado — nada para analisar')
    snapshot = { periodo: 'últimos 30 dias', ...await buildSocialMediaSnapshot(workspace.id, REPORT_PERIOD) }
  } else if (service === 'google_business') {
    if (!workspace.svcGoogleBusiness) throw new Error('Cliente não tem Google Business configurado — nada para analisar')
    snapshot = await buildGoogleBusinessSnapshot(workspace.id)
  } else {
    const [meta, google, vendasCRM, leadsPorCanal] = await Promise.all([
      workspace.svcMetaAds ? buildMetaTrafficSnapshot(workspace.id, REPORT_PERIOD) : Promise.resolve(null),
      workspace.svcGoogleAds ? buildGoogleTrafficSnapshot(workspace.id, REPORT_PERIOD) : Promise.resolve(null),
      fetchClosedDealsSummary(workspace.id, parseInt(REPORT_PERIOD, 10)),
      fetchLeadChannelBreakdown(workspace.id, parseInt(REPORT_PERIOD, 10)),
    ])
    if (!meta && !google) {
      throw new Error('Cliente não tem Meta Ads nem Google Ads configurado — nada para analisar')
    }
    snapshot = { periodo: 'últimos 30 dias', meta, google, vendasCRM, leadsPorCanal }
  }

  const generate = config.aiProvider === 'anthropic' ? generateTrafficReportClaude : generateTrafficReportOpenAI
  const report = await generate({
    snapshot,
    customPrompt: config.customPrompt ?? undefined,
    model: config.aiModel ?? undefined,
    systemPrompt: systemPromptForService(service),
  })

  const [insight] = await Promise.all([
    prisma.insight.create({
      data: {
        workspaceId: workspace.id,
        service,
        period: REPORT_PERIOD,
        content: JSON.stringify(report),
      },
    }),
    prisma.reportConfig.updateMany({
      where: { workspaceId: workspace.id, service },
      data: { lastGeneratedAt: new Date() },
    }),
  ])

  return insight
}
