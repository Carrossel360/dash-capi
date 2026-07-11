import Anthropic from '@anthropic-ai/sdk'
import { REPORT_JSON_SCHEMA, REPORT_SYSTEM_PROMPT, buildReportUserPrompt, type GeneratedReport } from '@/lib/ai-reports'

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return client
}

export async function generateTrafficReportClaude(input: {
  snapshot: unknown
  customPrompt?: string
}): Promise<GeneratedReport> {
  // output_config (Structured Outputs) ainda não está tipado no SDK instalado —
  // funciona na API real (confirmado contra a doc atual), só falta o type definition.
  const response = await getClient().messages.create({
    model: 'claude-sonnet-5',
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
