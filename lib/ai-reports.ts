import { prisma } from '@/lib/db'
import { buildMetaTrafficSnapshot, buildGoogleTrafficSnapshot, buildSocialMediaSnapshot, buildGoogleBusinessSnapshot } from '@/lib/trafego-aggregate'
import { generateTrafficReportOpenAI, generateTrafficReportV2OpenAI } from '@/lib/openai'
import { generateTrafficReportClaude, generateTrafficReportV2Claude } from '@/lib/anthropic'
import { fetchMetaAdCreatives, leadCount, sumActions, MESSAGING_ACTION_TYPES } from '@/lib/meta-ads'
import { fetchGoogleAdsKeywords, fetchGoogleAdsSearchTerms, isGoogleAdsConfigured, type GoogleAdsMcc } from '@/lib/google-ads'

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

// Formato "duas camadas" — só usado por trafego_pago (ver REPORT_SYSTEM_PROMPT_V2). Social
// Media/GBP continuam no formato antigo (GeneratedReport/REPORT_JSON_SCHEMA) — não precisam
// da tabela de exame por bloco/anúncio que só faz sentido pra tráfego pago.
export interface TrafficReportV2 {
  resumoExecutivo: string
  diagnosticoTecnico: string
}

export const TRAFFIC_REPORT_V2_JSON_SCHEMA = {
  type: 'object',
  properties: {
    resumoExecutivo: { type: 'string' },
    diagnosticoTecnico: { type: 'string' },
  },
  required: ['resumoExecutivo', 'diagnosticoTecnico'],
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

// Formato "duas camadas" (ver docs/report-semanal-prompt.md pro rascunho original) — só usado
// por trafego_pago. Camada 1 é o que o cliente lê primeiro; Camada 2 é a "tabela de exame" pra
// equipe interna, com markdown (inclui tabelas GFM) em vez de JSON estruturado por bloco —
// mais simples de gerar de forma confiável e de renderizar (react-markdown) do que modelar cada
// tabela como schema.
export const REPORT_SYSTEM_PROMPT_V2 =
  'Você é um analista de tráfego pago sênior de uma agência de marketing, escrevendo em português do Brasil, ' +
  'pra clientes cujo funil termina em VENDA FECHADA NO CRM — não em checkout/compra online. ' +
  'O funil real é: Anúncio (Meta e/ou Google) → Lead capturado (WhatsApp clique-to-chat, Formulário do Site, ' +
  'Formulário Nativo Meta, ou busca no Google) → Pipeline do CRM → Venda fechada. Não existe checkout online ' +
  'nesse fluxo — "venda" é sempre um negócio marcado como ganho no CRM ("vendasCRM": {count, value}), nunca os ' +
  'campos "vendas"/"roas" dentro de "chart"/"campaigns" (em meta/google), que são placeholders sempre ' +
  'zerados/"-" e NUNCA devem ser usados pra afirmar algo sobre vendas. A métrica-chave não é ROAS, é quantos ' +
  'leads viraram venda no CRM, e se o canal com lead mais barato/numeroso é o que realmente mais fecha negócio ' +
  '(às vezes não é).\n\n' +

  'CLASSIFICAÇÃO DE CAMPANHAS (N1/N2/N3) — classifique cada campanha do snapshot pelo objetivo (nome da ' +
  'campanha é só pista, não fonte primária): N1 = atração pro perfil (visitas, seguidores, page likes); ' +
  'N2 = aquecimento (engajamento, alcance, reconhecimento); N3 = captação de leads (WhatsApp, Formulário do ' +
  'Site, Formulário Nativo, leads do Google Ads) — a maioria dos clientes hoje só roda N3, então se não houver ' +
  'campanha claramente N1/N2 no snapshot, pule esses blocos na Camada 2 sem inventar dado.\n\n' +

  'TABELA DE REFERÊNCIA (tráfego, aplica em qualquer bloco) — use 🔴🟠🟡🟢 nessas métricas: ' +
  'CTR link: 🔴 <0,8% · 🟠 0,8–1,4% · 🟡 1,5–2,9% · 🟢 ≥3%. ' +
  'CPM: 🔴 >R$100 · 🟠 R$56–99 · 🟡 R$18–55 · 🟢 <R$18. ' +
  'Frequência (Meta): 🔴 >4 (fadiga) · 🟠 2,5–4 · 🟡 1,8–2,4 · 🟢 1,2–1,7 — MAS a maioria dos clientes roda ' +
  'campanha em raio geográfico pequeno, satura mais rápido que campanha nacional: se a frequência estiver ' +
  'subindo rápido no comparativo, sinalize como ponto de atenção mesmo estando em 🟡/🟠, não espere chegar em 🔴. ' +
  'NÃO existe faixa de referência universal pra CPL, Conv. Lead→Venda, Ticket Médio — nunca invente uma faixa ' +
  'pra essas, use ⚪ "sem referência" e compare só com o histórico do próprio período anterior (campo ' +
  '"comparison", quando vier).\n\n' +

  'DIAGNÓSTICO CRUZADO — use esses cruzamentos na Camada 2 quando os dois lados do dado existirem (não force ' +
  'quando só um lado existe): CTR bom + poucos leads → anúncio atrai clique mas não gera intenção de contato, ' +
  'revisar oferta/CTA/destino. CTR baixo + CPM alto → criativo fraco pro público. Frequência subindo + CTR ' +
  'caindo → público saturado (mais crítico aqui por causa do alcance geográfico limitado). CPL baixo + poucas ' +
  'vendas fechadas no CRM → gargalo comercial no pipeline, não do anúncio (checar tempo de resposta/qualificação ' +
  'antes de mexer na campanha). Muitos leads de um canal ("leadsPorCanal") que não aparece puxando vendas → ' +
  'canal traz volume mas não intenção real, considerar realocar verba. Se o cliente tiver Google Ads: quality ' +
  'score baixo + CPC alto → keyword/anúncio/página de destino desalinhados; search_impression_share baixo + CTR ' +
  'bom → orçamento está limitando um anúncio que já performa bem.\n\n' +

  'DADO DISPONÍVEL NO SNAPSHOT: "meta"/"google" (kpis agregados + campanhas + comparativo com período ' +
  'anterior, quando houver); "vendasCRM" {count, value} — única fonte de vendas real; "leadsPorCanal" ' +
  '[{canal, leads}] — contagem por canal de entrada, SEM CPL por canal (o gasto é só por plataforma de ' +
  'anúncio, não por canal de destino do lead — nunca calcule ou invente CPL por canal, comente só em volume); ' +
  '"topBottomAds" {top: [...3 por leads], bottom: [...3 por CPL mais alto]} quando Meta Ads estiver configurado ' +
  '(pode vir null se não houver dado — nesse caso escreva "sem dado disponível" pro bloco de anúncios, não ' +
  'invente nome de anúncio); "googleKeywords" {topKeywords, topSearchTerms} quando Google Ads estiver ' +
  'configurado (também pode vir null). Instagram/Social Media NÃO faz parte desse relatório — já existe um ' +
  'relatório dedicado de Social Media, não tente preencher esse bloco aqui.\n\n' +

  'REGRAS DURAS: nunca invente dado (escreva "—" ou "sem dado disponível" quando faltar); nunca invente ' +
  'atribuição de uma venda do CRM a uma campanha específica (não existe esse vínculo confiável nos dados — ' +
  'trate vendas sempre como total do período); cite o nome exato do anúncio/campanha quando destacar algo; ' +
  'bloco sem investimento no período: "Sem investimento na semana", sem análise forçada; se o cliente não tiver ' +
  'Google Ads configurado, omita o bloco Google inteiro (não escreva "sem dado" pra ele).\n\n' +

  'FORMATO DE SAÍDA — responda em JSON válido: { "resumoExecutivo": string, "diagnosticoTecnico": string }.\n' +
  '"resumoExecutivo" (Camada 1, pro cliente ler direto — até ~2000 caracteres, linguagem simples, sem termo ' +
  'técnico, sem tabela): panorama geral (investimento, quantos leads entraram, quantas vendas fecharam no CRM), ' +
  '2-3 destaques (melhor resultado citando o anúncio/canal, ponto de atenção, algo do funil lead→venda), e ' +
  '2-3 próximos passos concretos.\n' +
  '"diagnosticoTecnico" (Camada 2, pra equipe interna — sem limite de tamanho, em MARKDOWN com tabelas estilo ' +
  'GFM, use os emojis de status 🔴🟠🟡🟢⚪ nas células): comece com uma tabela "Visão Geral" (investimento, ' +
  'alcance, leads capturados, vendas fechadas no CRM, ticket médio, comparativo com período anterior quando ' +
  'houver); depois os blocos N1/N2/N3 que existirem com tabela de exame; uma tabela de "leadsPorCanal"; se ' +
  'houver "topBottomAds", uma seção com os 3 melhores e 3 piores anúncios (tabela com nome, leads, CPL, CTR); ' +
  'se houver Google Ads, um bloco com CTR/CPC/CPM/quality score/search impression share e as principais ' +
  'palavras-chave/termos de pesquisa; uma seção "Diagnóstico cruzado" com os cruzamentos que se aplicarem (ou ' +
  '"Sem cruzamentos relevantes esta semana" se nenhum se aplicar); e por fim uma tabela "Plano de ação" com ' +
  'colunas Prioridade (🔴/🟡/🟢) / Ação / Bloco / Justificativa em 1 linha.'

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

// Relatórios salvos antes dessa mudança ficam no formato antigo pra sempre (Insight.content é
// só texto JSON solto, sem migração) — por isso reconhece as duas formas em vez de assumir uma
// só. A UI decide como renderizar com base em qual campo existe.
function parseGeneratedReport(raw: string): (TrafficReportV2 & { kind: 'v2' }) | (GeneratedReport & { kind: 'legacy' }) {
  const parsed = JSON.parse(raw) as Partial<TrafficReportV2 & GeneratedReport>
  if (typeof parsed.resumoExecutivo === 'string' && typeof parsed.diagnosticoTecnico === 'string') {
    return { kind: 'v2', resumoExecutivo: parsed.resumoExecutivo, diagnosticoTecnico: parsed.diagnosticoTecnico }
  }
  if (
    typeof parsed.summary === 'string' &&
    Array.isArray(parsed.insights) &&
    Array.isArray(parsed.recommendations)
  ) {
    return { kind: 'legacy', summary: parsed.summary, insights: parsed.insights, recommendations: parsed.recommendations }
  }
  throw new Error('Formato inesperado na resposta da IA')
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
  return REPORT_SYSTEM_PROMPT_V2
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Top/bottom 3 anúncios do Meta por leads/CPL — dado que só existe sob demanda (Graph API),
// não fica salvo no banco (ver fetchMetaAdCreatives, mesma função usada na Análise de
// Criativos). Não-fatal: se o token/conta não estiver configurado ou a chamada falhar, o
// relatório segue sem esse bloco em vez de derrubar a geração inteira.
async function fetchTopBottomMetaAds(workspaceId: string, days: number) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { metaAdAccountId: true } })
  const accessToken = process.env.META_ADS_ACCESS_TOKEN
  if (!workspace?.metaAdAccountId || !accessToken) return null

  try {
    const until = ymd(new Date())
    const since = ymd(new Date(Date.now() - days * 24 * 60 * 60 * 1000))
    const ads = await fetchMetaAdCreatives({ adAccountId: workspace.metaAdAccountId, accessToken, since, until })

    const rows = ads.map(ad => {
      const row = ad.insights?.data?.[0]
      const spend = Number(row?.spend) || 0
      const leads = leadCount(row?.actions) + sumActions(row?.actions, MESSAGING_ACTION_TYPES)
      return {
        name: ad.name,
        spend: Math.round(spend),
        impressions: Number(row?.impressions) || 0,
        ctr: Number(row?.inline_link_click_ctr) || 0,
        cpm: Number(row?.cpm) || 0,
        cpc: Number(row?.cpc) || 0,
        leads,
        cpl: leads > 0 ? Math.round((spend / leads) * 100) / 100 : null,
      }
    }).filter(r => r.spend > 0)

    if (rows.length === 0) return null

    const top = [...rows].sort((a, b) => b.leads - a.leads).slice(0, 3)
    const withCpl = rows.filter(r => r.cpl != null)
    const bottom = [...withCpl].sort((a, b) => (b.cpl as number) - (a.cpl as number)).slice(0, 3)
    return { top, bottom }
  } catch (err) {
    console.error('[fetchTopBottomMetaAds]', err)
    return null
  }
}

function mccForCurrency(currency: string | null | undefined): GoogleAdsMcc {
  return currency === 'USD' ? 'US' : 'BR'
}

// Palavras-chave e termos de pesquisa do Google Ads — mesmo padrão sob-demanda usado em
// buildGoogleTrafficSnapshot (mcc/customerId), não persistido no banco. Também não-fatal.
async function fetchGoogleKeywordSignals(workspaceId: string, days: number) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { googleAdsCustomerId: true, currency: true } })
  if (!workspace?.googleAdsCustomerId) return null
  const mcc = mccForCurrency(workspace.currency)
  if (!isGoogleAdsConfigured(mcc)) return null

  try {
    const until = ymd(new Date())
    const since = ymd(new Date(Date.now() - days * 24 * 60 * 60 * 1000))
    const [keywords, searchTerms] = await Promise.all([
      fetchGoogleAdsKeywords({ mcc, customerId: workspace.googleAdsCustomerId, since, until }),
      fetchGoogleAdsSearchTerms({ mcc, customerId: workspace.googleAdsCustomerId, since, until }),
    ])
    return {
      topKeywords: keywords.slice(0, 10),
      topSearchTerms: searchTerms.slice(0, 10),
    }
  } catch (err) {
    console.error('[fetchGoogleKeywordSignals]', err)
    return null
  }
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
    const days = parseInt(REPORT_PERIOD, 10)
    const [meta, google, vendasCRM, leadsPorCanal, topBottomAds, googleKeywords] = await Promise.all([
      workspace.svcMetaAds ? buildMetaTrafficSnapshot(workspace.id, REPORT_PERIOD) : Promise.resolve(null),
      workspace.svcGoogleAds ? buildGoogleTrafficSnapshot(workspace.id, REPORT_PERIOD) : Promise.resolve(null),
      fetchClosedDealsSummary(workspace.id, days),
      fetchLeadChannelBreakdown(workspace.id, days),
      workspace.svcMetaAds ? fetchTopBottomMetaAds(workspace.id, days) : Promise.resolve(null),
      workspace.svcGoogleAds ? fetchGoogleKeywordSignals(workspace.id, days) : Promise.resolve(null),
    ])
    if (!meta && !google) {
      throw new Error('Cliente não tem Meta Ads nem Google Ads configurado — nada para analisar')
    }
    snapshot = { periodo: 'últimos 30 dias', meta, google, vendasCRM, leadsPorCanal, topBottomAds, googleKeywords }
  }

  const generate = service === 'trafego_pago'
    ? (config.aiProvider === 'anthropic' ? generateTrafficReportV2Claude : generateTrafficReportV2OpenAI)
    : (config.aiProvider === 'anthropic' ? generateTrafficReportClaude : generateTrafficReportOpenAI)
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
