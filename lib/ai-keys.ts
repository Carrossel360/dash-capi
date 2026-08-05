import { prisma } from '@/lib/db'

// Chave configurável via UI (aba "Relatórios com IA" em Configurações, só na linha
// isAgency:true) — cai pra env var (OPENAI_API_KEY/ANTHROPIC_API_KEY/GEMINI_API_KEY) quando não
// configurada no banco, mesmo padrão de uazapiAdminToken/telegramBotToken.
export async function getAiApiKey(provider: 'openai' | 'anthropic' | 'gemini'): Promise<string | undefined> {
  const agency = await prisma.workspace.findFirst({
    where: { isAgency: true },
    select: { openaiApiKey: true, anthropicApiKey: true, geminiApiKey: true },
  })
  const dbKey = provider === 'openai' ? agency?.openaiApiKey
    : provider === 'anthropic' ? agency?.anthropicApiKey
    : agency?.geminiApiKey
  if (dbKey) return dbKey
  return provider === 'openai' ? process.env.OPENAI_API_KEY
    : provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY
    : process.env.GEMINI_API_KEY
}
