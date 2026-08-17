import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { normalizeImportedPhone } from '@/lib/lead-import-parser'
import { findDuplicateLead, getLeadIdentity, isLeadIdentityConflict } from '@/lib/lead-identity'

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
  clientType?: string
  receivedAt?: string
  utmMedium?: string
  notes?: string
  dealValue?: number
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
  const monthAliases: Record<string, string> = {
    'jan.': 'Jan', 'fev.': 'Feb', 'mar.': 'Mar', 'abr.': 'Apr', 'mai.': 'May', 'jun.': 'Jun',
    'jul.': 'Jul', 'ago.': 'Aug', 'set.': 'Sep', 'out.': 'Oct', 'nov.': 'Nov', 'dez.': 'Dec',
  }
  const normalized = Object.entries(monthAliases).reduce(
    (dateValue, [from, to]) => dateValue.replace(new RegExp(`^${from.replace('.', '\\.')}\\s`, 'i'), `${to} `),
    value.trim(),
  )
  const date = new Date(normalized)
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
  const statusAliases: Record<string, string> = {
    novo: 'novo lead',
    'sem conversao': 'visita realizada sem conversao',
    perdido: 'contato perdido',
  }

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
    const normalizedStatus = requestedStatus ? normalizeStageName(requestedStatus) : ''
    const targetStage = requestedStatus
      ? stageByName.get(normalizedStatus) ?? stageByName.get(statusAliases[normalizedStatus] ?? '')
      : stage
    if (requestedStatus && !targetStage) {
      statusFallback++
      unknownStatuses.add(requestedStatus)
    }
    const resolvedStage = targetStage ?? stage
    const createdAt = parseImportDate(row.receivedAt)
    const dealValue = typeof row.dealValue === 'number' && row.dealValue > 0 ? row.dealValue : null

    if (!phone && !email && !row.importKey) { invalid++; continue }

    const identityMatch = await findDuplicateLead(auth.workspaceId, phone, email)
    const importKeyMatch = row.importKey ? await prisma.lead.findFirst({
      where: { workspaceId: auth.workspaceId, metadata: { path: ['importKey'], equals: row.importKey } },
      select: { id: true },
    }) : null
    const crossSourceMatch = identityMatch ?? importKeyMatch
    if (crossSourceMatch) {
      const existing = await prisma.lead.findUnique({
        where: { id: crossSourceMatch.id },
        include: { deals: { select: { id: true } } },
      })
      if (existing) {
        const existingMetadata = existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
          ? existing.metadata as Prisma.JsonObject
          : {}
        const shouldFillPhone = !existing.phone || existing.phone.replace(/\D/g, '').length < 7
        const mergedIdentity = shouldFillPhone && phone
          ? await getLeadIdentity(auth.workspaceId, phone, existing.email)
          : {}

        await prisma.$transaction(async tx => {
          await tx.lead.update({
            where: { id: existing.id },
            data: {
              ...((!existing.name || /^sem nome$|^lead \d+$/i.test(existing.name)) && name !== 'Sem nome' && { name }),
              ...(shouldFillPhone && phone && { phone, ...mergedIdentity }),
              source: leadSource,
              utmMedium: row.utmMedium?.trim() || existing.utmMedium || 'Importação',
              ...(row.notes?.trim() && { notes: row.notes.trim() }),
              ...(row.clientType?.trim() && { clientType: row.clientType.trim() }),
              ...(requestedStatus && targetStage && { pipelineStageId: targetStage.id }),
              ...(dealValue && !existing.dealValue && { dealValue, closedAt: createdAt ?? new Date() }),
              metadata: {
                ...existingMetadata,
                ...(row.metadata ?? {}),
                ...(row.importKey ? { importKey: row.importKey } : {}),
              } as Prisma.InputJsonValue,
            },
          })
          if (dealValue && !existing.dealValue && existing.deals.length === 0) {
            await tx.deal.create({
              data: { workspaceId: auth.workspaceId, leadId: existing.id, value: dealValue },
            })
          }
        })
      }
      duplicated++
      continue
    }

    const identity = await getLeadIdentity(auth.workspaceId, phone, email)
    try {
      await prisma.$transaction(async tx => {
        const importedLead = await tx.lead.create({
          data: {
            workspaceId: auth.workspaceId,
            name,
            phone,
            email,
            ...identity,
            clientType: row.clientType?.trim() || null,
            source: leadSource,
            utmMedium: row.utmMedium?.trim() || 'Importação',
            notes: row.notes?.trim() || null,
            dealValue,
            metadata: row.metadata || row.importKey
              ? { ...(row.metadata ?? {}), ...(row.importKey ? { importKey: row.importKey } : {}) }
              : undefined,
            pipelineStageId: resolvedStage.id,
            ...(createdAt && { createdAt }),
            ...((dealValue || resolvedStage.triggerCapiEvent === 'purchase') && { closedAt: createdAt ?? new Date() }),
          },
          select: { id: true },
        })
        if (dealValue) {
          await tx.deal.create({
            data: { workspaceId: auth.workspaceId, leadId: importedLead.id, value: dealValue },
          })
        }
      })
      created++
    } catch (error) {
      if (isLeadIdentityConflict(error)) { duplicated++; continue }
      throw error
    }
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
