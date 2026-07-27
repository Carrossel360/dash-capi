import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// Supabase Supavisor (transaction pooler): pgbouncer=true desativa prepared statements,
// exigido pelo pooler em modo transaction; connection_limit=1 evita esgotamento do pool
// em ambiente serverless (múltiplas invocações concorrentes na Vercel).
function buildUrl(base: string): string {
  if (!base) return base
  const sep = base.includes('?') ? '&' : '?'
  const parts: string[] = []
  if (!base.includes('pgbouncer'))        parts.push('pgbouncer=true')
  if (!base.includes('connection_limit')) parts.push('connection_limit=1')
  return parts.length ? `${base}${sep}${parts.join('&')}` : base
}

function createClient() {
  const client = new PrismaClient({
    log: [
      { level: 'warn',  emit: 'event' },
      { level: 'error', emit: 'event' },
    ],
    datasources: {
      db: { url: buildUrl(process.env.DATABASE_URL ?? '') },
    },
  })

  // Filtra ruído de reconexão do pool (conexões fechadas por inatividade são normais)
  client.$on('error', (e) => {
    if (e.message.includes('kind: Closed') || e.message.includes('kind: Reset')) return
    console.error('[prisma error]', e.message)
  })
  client.$on('warn', (e) => {
    console.warn('[prisma warn]', e.message)
  })

  return client
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
