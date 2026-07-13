import Anthropic from '@anthropic-ai/sdk'
import { REPORT_JSON_SCHEMA, REPORT_SYSTEM_PROMPT, buildReportUserPrompt, type GeneratedReport } from '@/lib/ai-reports'
import { SITE_JSON_SCHEMA, parseGeneratedSite } from '@/lib/site-generator/prompts'
import type { GeneratedSite } from '@/lib/site-generator/types'
import { getAiApiKey } from '@/lib/ai-keys'

async function getClient(): Promise<Anthropic> {
  return new Anthropic({ apiKey: await getAiApiKey('anthropic') })
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
