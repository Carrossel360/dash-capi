import { generateSiteOpenAI } from '@/lib/openai'
import { generateSiteClaude } from '@/lib/anthropic'
import type { GeneratedSite } from './types'

// Dispatcher por provedor — espelha generateAndSaveReport (lib/ai-reports.ts).
export async function generateSite(input: {
  systemPrompt: string
  userPrompt: string
  aiProvider: string
  aiModel?: string | null
}): Promise<GeneratedSite> {
  const generate = input.aiProvider === 'anthropic' ? generateSiteClaude : generateSiteOpenAI
  return generate({
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    model: input.aiModel ?? undefined,
  })
}
