export type DateRange = { gte: Date; lte: Date }

// Compartilhado entre app/api/trafego/meta/route.ts e app/api/trafego/google/route.ts
// (era duplicado idêntico nos dois arquivos até este módulo existir).
//
// Tudo em UTC (setUTCHours/getUTCFullYear/Date.UTC), não em fuso local do servidor:
// as datas em MetaAdsDailyData/GoogleAdsDailyData são gravadas como meia-noite UTC do dia
// (a partir da string "YYYY-MM-DD" que a Meta/Google devolvem). Se essa função usasse
// fuso local (new Date(ano, mês, dia, 0,0,0,0) é sempre local, não UTC) e o processo
// rodasse num fuso diferente de UTC, o primeiro dia do período ficaria de fora do filtro
// `gte` por algumas horas — bug real encontrado testando localmente (fuso BRT/UTC-3):
// "Este mês" perdia o dia 1 inteiro porque 01/07 00:00 UTC é anterior a 01/07 03:00 UTC
// (meia-noite local em UTC-3). Em produção (Vercel roda em UTC) isso não se manifestava,
// mas ficava um risco latente — por isso a correção vale independente do ambiente.
export function dateRange(period: string, from?: string | null, to?: string | null): DateRange | undefined {
  const now = new Date()

  if (period === 'custom') {
    if (!from || !to) return undefined
    const gte = new Date(from); gte.setUTCHours(0, 0, 0, 0)
    const lte = new Date(to); lte.setUTCHours(23, 59, 59, 999)
    return { gte, lte }
  }
  if (period === 'today') {
    const gte = new Date(now); gte.setUTCHours(0, 0, 0, 0)
    const lte = new Date(now); lte.setUTCHours(23, 59, 59, 999)
    return { gte, lte }
  }
  if (period === 'yesterday') {
    const gte = new Date(now); gte.setUTCDate(gte.getUTCDate() - 1); gte.setUTCHours(0, 0, 0, 0)
    const lte = new Date(now); lte.setUTCDate(lte.getUTCDate() - 1); lte.setUTCHours(23, 59, 59, 999)
    return { gte, lte }
  }
  if (period === 'this_month') {
    const gte = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
    const lte = new Date(now); lte.setUTCHours(23, 59, 59, 999)
    return { gte, lte }
  }
  if (period === 'last_month') {
    const gte = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0))
    const lte = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999)) // dia 0 do mês atual = último dia do mês anterior
    return { gte, lte }
  }
  const days = period === '7d' ? 7 : period === '30d' ? 30 : null
  if (!days) return undefined
  const gte = new Date(now); gte.setUTCDate(gte.getUTCDate() - days); gte.setUTCHours(0, 0, 0, 0)
  const lte = new Date(now); lte.setUTCHours(23, 59, 59, 999)
  return { gte, lte }
}

// Janela imediatamente anterior, de mesma duração, usada pro badge de comparação
// percentual ("vs período anterior"). 'all' não tem período anterior que faça
// sentido comparar — retorna undefined e o chamador não computa comparação.
export function previousRange(period: string, current: DateRange | undefined): DateRange | undefined {
  if (period === 'today') return dateRange('yesterday')
  if (period === 'yesterday') {
    const now = new Date()
    const gte = new Date(now); gte.setUTCDate(gte.getUTCDate() - 2); gte.setUTCHours(0, 0, 0, 0)
    const lte = new Date(now); lte.setUTCDate(lte.getUTCDate() - 2); lte.setUTCHours(23, 59, 59, 999)
    return { gte, lte }
  }
  if (period === 'this_month') return dateRange('last_month')
  if (period === 'last_month') {
    const now = new Date()
    const gte = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1, 0, 0, 0, 0))
    const lte = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 0, 23, 59, 59, 999))
    return { gte, lte }
  }
  if ((period === '7d' || period === '30d' || period === 'custom') && current) {
    const spanMs = current.lte.getTime() - current.gte.getTime()
    const lte = new Date(current.gte.getTime() - 1)
    const gte = new Date(lte.getTime() - spanMs)
    return { gte, lte }
  }
  return undefined
}

function percentDiff(current: number, previous: number): number | null {
  if (!isFinite(previous) || previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

// Monta o objeto { chave: percentual } comparando os KPIs do período atual com os
// do período anterior — só pras chaves numéricas listadas (evita comparar campos
// como hasData/roas legado que não fazem sentido nesse cálculo).
export function buildComparison(
  current: Record<string, unknown>,
  previous: Record<string, unknown> | null,
  keys: string[]
): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  if (!previous) return out
  for (const key of keys) {
    const c = current[key]
    const p = previous[key]
    out[key] = (typeof c === 'number' && typeof p === 'number') ? percentDiff(c, p) : null
  }
  return out
}
