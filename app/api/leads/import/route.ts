import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { normalizeImportedPhone } from '@/lib/lead-import-parser'

// Import em lote — pra clientes cujo canal ainda não tem sync automático pro CRM (hoje é o
// caso do Local Service Ads: só relatório agregado, sem lead individual disponível na API).
// Mesmo padrão de dedupe por telefone/e-mail já usado nos outros canais (uazapi/elementor/
// ads-sync) — evita duplicar quem já chegou por outro caminho antes do import manual.
interface ImportRow {
  name?: string
  phone?: string
  email?: string
  source?: string
  status?: string
  receivedAt?: string
  utmMedium?: string
  notes?: string
  importKey?: string
  metadata?: Record<string, string | null>
}

function normalizeStageName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function parseImportDate(value?: string): Date | undefined {
  if (!value?.trim()) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { items, stageId, source } = await req.json() as { items?: ImportRow[]; stageId?: string; source?: string }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items é obrigatório e não pode ser vazio' }, { status: 400 })
  }
  if (items.length > 1000) {
    return NextResponse.json({ error: 'Máximo de 1000 leads por importação' }, { status: 400 })
  }

  const [workspace, stages] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: auth.workspaceId }, select: { currency: true } }),
    prisma.pipelineStage.findMany({ where: { workspaceId: auth.workspaceId }, orderBy: { order: 'asc' } }),
  ])
  const stage = stageId ? stages.find(item => item.id === stageId) : stages[0]
  if (!stage) return NextResponse.json({ error: 'Nenhum estágio de pipeline encontrado' }, { status: 404 })

  const fallbackSource = source?.trim() || 'Importação Manual'
  const stageByName = new Map(stages.map(item => [normalizeStageName(item.name), item]))

  let created = 0
  let duplicated = 0
  let invalid = 0
  let statusFallback = 0
  const unknownStatuses = new Set<string>()

  for (const row of items) {
    const name = row.name?.trim() || 'Sem nome'
    const rawEmail = row.email?.trim().toLowerCase() || ''
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : null
    const phone = row.phone ? normalizeImportedPhone(row.phone, workspace?.currency ?? 'BRL') : null
    const leadSource = row.source?.trim() || fallbackSource
    const requestedStatus = row.status?.trim()
    const targetStage = requestedStatus ? stageByName.get(normalizeStageName(requestedStatus)) : stage
    if (requestedStatus && !targetStage) {
      statusFallback++
      unknownStatuses.add(requestedStatus)
    }
    const resolvedStage = targetStage ?? stage
    const createdAt = parseImportDate(row.receivedAt)

    if (!phone && !email && !row.importKey) { invalid++; continue }

    const crossSourceMatch = await prisma.lead.findFirst({
      where: {
        workspaceId: auth.workspaceId,
        OR: [
          phone ? { phone } : undefined,
          email ? { email } : undefined,
          row.importKey ? { metadata: { path: ['importKey'], equals: row.importKey } } : undefined,
        ].filter(Boolean) as Prisma.LeadWhereInput[],
      },
      select: { id: true },
    })
    if (crossSourceMatch) { duplicated++; continue }

    await prisma.lead.create({
      data: {
        workspaceId: auth.workspaceId,
        name,
        phone,
        email,
        source: leadSource,
        utmMedium: row.utmMedium?.trim() || 'Importação',
        notes: row.notes?.trim() || null,
        metadata: row.metadata || row.importKey
          ? { ...(row.metadata ?? {}), ...(row.importKey ? { importKey: row.importKey } : {}) }
          : undefined,
        pipelineStageId: resolvedStage.id,
        ...(createdAt && { createdAt }),
        ...(resolvedStage.triggerCapiEvent === 'purchase' && { closedAt: createdAt ?? new Date() }),
      },
    })
    created++
  }

  return NextResponse.json({
    ok: true,
    created,
    duplicated,
    invalid,
    total: items.length,
    statusFallback,
    unknownStatuses: [...unknownStatuses],
  })
}
