import { prisma } from '@/lib/db'

// Chave configurável via UI (aba "Relatórios com IA" em Configurações, só na linha
// isAgency:true) — cai pra env var (OPENAI_API_KEY/ANTHROPIC_API_KEY) quando não
// configurada no banco, mesmo padrão de uazapiAdminToken/telegramBotToken.
export async function getAiApiKey(provider: 'openai' | 'anthropic'): Promise<string | undefined> {
  const agency = await prisma.workspace.findFirst({
    where: { isAgency: true },
    select: { openaiApiKey: true, anthropicApiKey: true },
  })
  const dbKey = provider === 'openai' ? agency?.openaiApiKey : agency?.anthropicApiKey
  if (dbKey) return dbKey
  return provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY
}
