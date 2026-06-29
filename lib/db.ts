import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// Neon + PgBouncer: connection_limit=1 evita esgotamento do pool e reduz erros "kind: Closed"
function buildUrl(base: string): string {
  if (!base) return base
  const sep = base.includes('?') ? '&' : '?'
  const parts: string[] = []
  if (!base.includes('connection_limit')) parts.push('connection_limit=1')
  if (!base.includes('pool_timeout'))     parts.push('pool_timeout=15')
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

  // Filtra o ruído de reconexão do Neon (conexões fechadas por inatividade são normais)
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
