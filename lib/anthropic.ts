import Anthropic from '@anthropic-ai/sdk'
import { REPORT_JSON_SCHEMA, REPORT_SYSTEM_PROMPT, buildReportUserPrompt, type GeneratedReport } from '@/lib/ai-reports'
import { SITE_JSON_SCHEMA, parseGeneratedSite } from '@/lib/site-generator/prompts'
import type { GeneratedSite } from '@/lib/site-generator/types'
import { getAiApiKey } from '@/lib/ai-keys'
import type { GeneratedSlide } from '@/lib/openai'

async function getClient(): Promise<Anthropic> {
  return new Anthropic({ apiKey: await getAiApiKey('anthropic') })
}

const CAROUSEL_JSON_SCHEMA = {
  type: 'object',
  properties: {
    slides: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'number' },
          title: { type: 'string' },
          body: { type: 'string' },
          imageSuggestion: { type: 'string' },
        },
        required: ['index', 'title', 'body', 'imageSuggestion'],
        additionalProperties: false,
      },
    },
  },
  required: ['slides'],
  additionalProperties: false,
} as const

// Mesmo formato de saída de generateCarouselSlides (lib/openai.ts) — o Estúdio de Criação
// trata o provedor como intercambiável.
export async function generateCarouselSlidesClaude(input: {
  topic: string
  slideCount: number
  tone?: string
  model?: string
}): Promise<GeneratedSlide[]> {
  const { topic, slideCount, tone, model } = input

  const response = await (await getClient()).messages.create({
    model: model || 'claude-sonnet-5',
    max_tokens: 2048,
    system:
      'Você é um estrategista de conteúdo para redes sociais especializado em carrosséis do Instagram. ' +
      'Gere textos curtos, diretos e persuasivos em português do Brasil. ' +
      'Sempre responda em JSON válido no formato { "slides": [{ "index": number, "title": string, "body": string, "imageSuggestion": string }] }. ' +
      'O primeiro slide é a capa (gancho forte), os do meio desenvolvem o tema, e o último é uma chamada para ação (CTA).',
    messages: [{
      role: 'user',
      content:
        `Tópico: ${topic}\n` +
        `Quantidade de slides: ${slideCount}\n` +
        (tone ? `Tom de voz: ${tone}\n` : '') +
        `Gere exatamente ${slideCount} slides. Para cada um: "title" (frase de impacto, até 60 caracteres), ` +
        `"body" (texto de apoio, até 140 caracteres), e "imageSuggestion" (prompt curto em inglês descrevendo uma imagem/fundo que combine com o slide).`,
    }],
    ...({ output_config: { format: { type: 'json_schema', schema: CAROUSEL_JSON_SCHEMA } } } as object),
  })

  const block = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  if (!block?.text) throw new Error('Resposta vazia da Anthropic')

  const parsed = JSON.parse(block.text) as { slides: GeneratedSlide[] }
  if (!Array.isArray(parsed.slides)) throw new Error('Formato inesperado na resposta da Anthropic')
  return parsed.slides
}

export async function generateTrafficReportClaude(input: {
  snapshot: unknown
  customPrompt?: string
  model?: string
}): Promise<GeneratedReport> {
  // output_config (Structured Outputs) ainda não está tipado no SDK instalado —
  // funciona na API real (confirmado contra a doc atual), só falta o type definition.
  const response = await (await getClient()).messages.create({
    model: input.model || 'claude-sonnet-5',
    max_tokens: 2048,
    system: REPORT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildReportUserPrompt(input.snapshot, input.customPrompt) }],
    ...({ output_config: { format: { type: 'json_schema', schema: REPORT_JSON_SCHEMA } } } as object),
  })

  const block = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  if (!block?.text) throw new Error('Resposta vazia da Anthropic')

  const parsed = JSON.parse(block.text) as GeneratedReport
  if (!parsed.summary || !Array.isArray(parsed.insights) || !Array.isArray(parsed.recommendations)) {
    throw new Error('Formato inesperado na resposta da Anthropic')
  }
  return parsed
}

// Mesmo formato de saída em todos os 3 provedores (ver lib/gemini.ts/lib/openai.ts).
export async function generatePostCopyClaude(input: {
  topic: string
  platform: string
  tone?: string
  model?: string
}): Promise<{ copy: string; hashtags: string[] }> {
  const { topic, platform, tone, model } = input

  const response = await (await getClient()).messages.create({
    model: model || 'claude-sonnet-5',
    max_tokens: 1024,
    system:
      'Você é um copywriter especializado em redes sociais, escrevendo em português do Brasil. ' +
      'Gere copy persuasivo, natural, sem parecer robótico, com quebras de linha quando fizer sentido. ' +
      'Sempre responda em JSON válido no formato { "copy": string, "hashtags": string[] } — hashtags sem o "#".',
    messages: [{
      role: 'user',
      content:
        `Tópico/produto: ${topic}\n` +
        `Plataforma: ${platform}\n` +
        (tone ? `Tom de voz: ${tone}\n` : '') +
        'Gere uma legenda pronta pra publicar (copy) e uma lista de 5 a 10 hashtags relevantes.',
    }],
  })

  const block = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  if (!block?.text) throw new Error('Resposta vazia da Anthropic')

  const parsed = JSON.parse(block.text) as { copy: string; hashtags: string[] }
  if (typeof parsed.copy !== 'string' || !Array.isArray(parsed.hashtags)) {
    throw new Error('Formato inesperado na resposta da Anthropic')
  }
  return parsed
}

// Gerar um site completo (múltiplos arquivos) é bem mais verboso que texto de análise
// — max_tokens bem acima dos 2048 usados nos relatórios.
export async function generateSiteClaude(input: {
  systemPrompt: string
  userPrompt: string
  model?: string
}): Promise<GeneratedSite> {
  const response = await (await getClient()).messages.create({
    model: input.model || 'claude-sonnet-5',
    max_tokens: 16000,
    system: input.systemPrompt,
    messages: [{ role: 'user', content: input.userPrompt }],
    ...({ output_config: { format: { type: 'json_schema', schema: SITE_JSON_SCHEMA } } } as object),
  })

  const block = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  if (!block?.text) throw new Error('Resposta vazia da Anthropic')
  return parseGeneratedSite(block.text)
}
