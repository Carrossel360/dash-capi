/**
 * Audita e corrige a importacao GLS da Waxing sem excluir leads.
 *
 * Uso:
 *   npx tsx scripts/import-waxing-gls-missing.ts --file=/caminho/leads.csv
 *   npx tsx scripts/import-waxing-gls-missing.ts --file=/caminho/leads.csv --apply
 */

import fs from 'fs'
import { Prisma, PrismaClient } from '@prisma/client'
import { normalizeImportedPhone, parseImportedDate, parseImportText } from '../lib/lead-import-parser'

for (const file of ['.env', '.env.local']) {
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

const WORKSPACE_ID = '298b48d4-6559-4682-a5a3-9b52c5d76966'
const filePath = process.argv.find(arg => arg.startsWith('--file='))?.slice('--file='.length)
const apply = process.argv.includes('--apply')

if (!filePath || !fs.existsSync(filePath)) {
  throw new Error('Informe um arquivo existente com --file=/caminho/leads.csv')
}
const csvFilePath = filePath

const prisma = new PrismaClient()

function normalizeStageName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function normalizedPhone(value: string | null | undefined, currency: string): string | null {
  let digits = value?.replace(/\D/g, '') ?? ''
  if (currency === 'USD' && digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  if (currency === 'BRL' && (digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2)
  return digits.length >= 7 ? digits : null
}

function jsonObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Prisma.JsonObject : {}
}

async function main() {
  const rows = parseImportText(fs.readFileSync(csvFilePath, 'utf8'))
  const [workspace, stages, existingLeads] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({ where: { id: WORKSPACE_ID }, select: { name: true, currency: true } }),
    prisma.pipelineStage.findMany({ where: { workspaceId: WORKSPACE_ID }, orderBy: { order: 'asc' } }),
    prisma.lead.findMany({
      where: { workspaceId: WORKSPACE_ID },
      select: {
        id: true, name: true, phone: true, normalizedPhone: true, email: true,
        pipelineStageId: true, metadata: true, createdAt: true,
      },
    }),
  ])

  const stagesByName = new Map(stages.map(stage => [normalizeStageName(stage.name), stage]))
  const phones = new Map<string, typeof existingLeads[number]>()
  const importKeys = new Map<string, typeof existingLeads[number]>()
  for (const lead of existingLeads) {
    const phone = lead.normalizedPhone || normalizedPhone(lead.phone, workspace.currency)
    if (phone) phones.set(phone, lead)
    const importKey = jsonObject(lead.metadata).importKey
    if (typeof importKey === 'string') importKeys.set(importKey, lead)
  }

  const uniqueRows = new Map<string, typeof rows[number]>()
  let repeatedInFile = 0
  for (const row of rows) {
    const phone = row.phone ? normalizeImportedPhone(row.phone, workspace.currency) : null
    const phoneKey = normalizedPhone(phone, workspace.currency)
    const logicalKey = phoneKey ? `phone:${phoneKey}` : `import:${row.importKey ?? ''}`
    if (uniqueRows.has(logicalKey)) {
      repeatedInFile++
      continue
    }
    uniqueRows.set(logicalKey, row)
  }

  const matched: Array<{ row: typeof rows[number]; leadId: string }> = []
  const missing: typeof rows = []
  for (const row of uniqueRows.values()) {
    const phone = row.phone ? normalizeImportedPhone(row.phone, workspace.currency) : null
    const phoneKey = normalizedPhone(phone, workspace.currency)
    const match = (phoneKey ? phones.get(phoneKey) : undefined)
      ?? (row.importKey ? importKeys.get(row.importKey) : undefined)
    if (match) matched.push({ row, leadId: match.id })
    else missing.push(row)
  }

  const placeholderLead = existingLeads.find(lead => normalizedPhone(lead.phone, workspace.currency) === '1111111111')
  const placeholderTargetIndex = placeholderLead
    ? missing.findIndex(row => !row.phone && Boolean(row.importKey))
    : -1

  console.log(JSON.stringify({
    workspace: workspace.name,
    csvRows: rows.length,
    uniqueLogicalLeads: uniqueRows.size,
    repeatedInFile,
    matchedExisting: matched.length,
    placeholderToRepair: placeholderTargetIndex >= 0 ? 1 : 0,
    toCreate: missing.length - (placeholderTargetIndex >= 0 ? 1 : 0),
    apply,
  }, null, 2))

  if (!apply) return

  if (placeholderTargetIndex >= 0 && placeholderLead) {
    const row = missing.splice(placeholderTargetIndex, 1)[0]
    const stage = stagesByName.get(normalizeStageName(row.status ?? '')) ?? stages[0]
    const receivedAt = parseImportedDate(row.receivedAt)
    await prisma.lead.update({
      where: { id: placeholderLead.id },
      data: {
        name: row.name || 'Sem nome',
        phone: null,
        normalizedPhone: null,
        source: row.source || 'GLS',
        utmMedium: row.utmMedium || 'Google Local Services',
        pipelineStageId: stage.id,
        ...(receivedAt && { createdAt: receivedAt }),
        notes: row.notes || null,
        metadata: { ...jsonObject(placeholderLead.metadata), ...(row.metadata ?? {}), importKey: row.importKey } as Prisma.InputJsonValue,
      },
    })
  }

  let created = 0
  for (const row of missing) {
    const stage = stagesByName.get(normalizeStageName(row.status ?? '')) ?? stages[0]
    const phone = row.phone ? normalizeImportedPhone(row.phone, workspace.currency) : null
    const receivedAt = parseImportedDate(row.receivedAt)
    await prisma.lead.create({
      data: {
        workspaceId: WORKSPACE_ID,
        name: row.name || 'Sem nome',
        phone,
        normalizedPhone: normalizedPhone(phone, workspace.currency),
        email: row.email || null,
        normalizedEmail: row.email?.trim().toLowerCase() || null,
        source: row.source || 'GLS',
        utmMedium: row.utmMedium || 'Google Local Services',
        pipelineStageId: stage.id,
        notes: row.notes || null,
        metadata: { ...(row.metadata ?? {}), importKey: row.importKey } as Prisma.InputJsonValue,
        ...(receivedAt && { createdAt: receivedAt }),
      },
    })
    created++
  }

  console.log(JSON.stringify({ repairedPlaceholder: placeholderTargetIndex >= 0 ? 1 : 0, created }, null, 2))
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
