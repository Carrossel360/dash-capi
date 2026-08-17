import { readFileSync, writeFileSync } from 'node:fs'
import { Prisma, PrismaClient } from '@prisma/client'
import { normalizeImportedPhone, parseImportedDate, parseImportText } from '../lib/lead-import-parser'
import { normalizeLeadEmail, normalizeLeadPhone } from '../lib/lead-identity'

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')
const workspaceId = '6244e80f-fb4f-4dc5-928e-9430503c448f'
const csvPath = '/Users/fabianocxmartins/Downloads/leads-inbox 13.08 - leads-inbox.csv'

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

async function main() {
  const rows = parseImportText(readFileSync(csvPath, 'utf8'))
  const [workspace, stages, leads] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { currency: true } }),
    prisma.pipelineStage.findMany({ where: { workspaceId }, orderBy: { order: 'asc' } }),
    prisma.lead.findMany({
      where: { workspaceId },
      include: { deals: true },
      orderBy: [{ dealValue: 'desc' }, { createdAt: 'asc' }],
    }),
  ])

  const stageByName = new Map(stages.map(stage => [normalizeText(stage.name), stage]))
  const statusAliases: Record<string, string> = {
    novo: 'novo lead',
    'sem conversao': 'visita realizada sem conversao',
    perdido: 'contato perdido',
  }
  const usedLeadIds = new Set<string>()

  function findMatch(row: typeof rows[number]) {
    const phone = row.phone ? normalizeImportedPhone(row.phone, workspace.currency) : null
    const phoneKey = normalizeLeadPhone(phone, workspace.currency)
    const emailKey = normalizeLeadEmail(row.email)

    const identityMatch = leads.find(lead => !usedLeadIds.has(lead.id) && (
      (phoneKey && normalizeLeadPhone(lead.phone, workspace.currency) === phoneKey)
      || (emailKey && normalizeLeadEmail(lead.email) === emailKey)
    ))
    if (identityMatch) return identityMatch

    const keyMatch = leads.find(lead => !usedLeadIds.has(lead.id)
      && lead.metadata && typeof lead.metadata === 'object' && !Array.isArray(lead.metadata)
      && (lead.metadata as Record<string, unknown>).importKey === row.importKey)
    if (keyMatch) return keyMatch

    // Sete cards vieram da migração antiga sem os dados completos. O vínculo abaixo é
    // deliberadamente restrito ao JM e a telefone final/nome conhecidos nesta planilha.
    const legacyGls = leads.filter(lead => !usedLeadIds.has(lead.id) && normalizeText(lead.source ?? '') === 'gls')
    const suffixMatch = legacyGls.find(lead => {
      const oldDigits = lead.phone?.replace(/\D/g, '') ?? ''
      return oldDigits.length === 4 && Boolean(phoneKey?.endsWith(oldDigits))
    })
    if (suffixMatch) return suffixMatch

    const rowName = normalizeText(row.name)
    if (rowName !== 'sem nome') {
      const nameMatch = legacyGls.find(lead => {
        const oldName = normalizeText(lead.name)
        return oldName === rowName
          || (oldName === 'brian' && rowName.startsWith('brian '))
          || (oldName === 'potria' && rowName.startsWith('portia '))
      })
      if (nameMatch) return nameMatch
    }
    return null
  }

  const plan = rows.map(row => {
    const match = findMatch(row)
    if (match) usedLeadIds.add(match.id)
    const normalizedStatus = normalizeText(row.status ?? '')
    const stage = stageByName.get(normalizedStatus)
      ?? stageByName.get(statusAliases[normalizedStatus] ?? '')
    if (!stage) throw new Error(`Status sem estágio correspondente: ${row.status}`)
    return { row, match, stage }
  })

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    rows: rows.length,
    create: plan.filter(item => !item.match).length,
    update: plan.filter(item => item.match).length,
    byStage: Object.entries(plan.reduce((result: Record<string, number>, item) => {
      result[item.stage.name] = (result[item.stage.name] ?? 0) + 1
      return result
    }, {})),
    sales: plan.filter(item => item.row.dealValue).map(item => ({ name: item.row.name, value: item.row.dealValue })),
    matches: plan.filter(item => item.match).map(item => ({ sheet: item.row.name, crm: item.match!.name, id: item.match!.id })),
  }, null, 2))

  if (!apply) return

  const backupPath = `/tmp/jm-local-services-before-import-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  writeFileSync(backupPath, JSON.stringify(leads, null, 2), { flag: 'wx' })
  console.log(`Backup: ${backupPath}`)

  for (const { row, match, stage } of plan) {
    const phone = row.phone ? normalizeImportedPhone(row.phone, workspace.currency) : null
    const identity = {
      normalizedPhone: normalizeLeadPhone(phone, workspace.currency),
      normalizedEmail: normalizeLeadEmail(row.email),
    }
    const createdAt = parseImportedDate(row.receivedAt)
    const metadata = {
      ...(match?.metadata && typeof match.metadata === 'object' && !Array.isArray(match.metadata)
        ? match.metadata as Prisma.JsonObject
        : {}),
      ...(row.metadata ?? {}),
      importKey: row.importKey,
    } as Prisma.InputJsonValue

    if (match) {
      const importedName = normalizeText(row.name) === 'sem nome' && normalizeText(match.name) !== 'sem nome'
        ? match.name
        : row.name
      await prisma.$transaction(async tx => {
        await tx.lead.update({
          where: { id: match.id },
          data: {
            name: importedName,
            phone,
            email: row.email || null,
            ...identity,
            source: row.source ?? 'GLS',
            utmMedium: row.utmMedium ?? 'Google Local Services',
            notes: row.notes ?? null,
            metadata,
            pipelineStageId: stage.id,
            dealValue: row.dealValue ?? null,
            closedAt: row.dealValue ? createdAt ?? match.closedAt ?? new Date() : null,
            ...(createdAt && { createdAt }),
          },
        })
        if (row.dealValue) {
          if (match.deals[0]) {
            await tx.deal.update({ where: { id: match.deals[0].id }, data: { value: row.dealValue } })
          } else {
            await tx.deal.create({ data: { workspaceId, leadId: match.id, value: row.dealValue } })
          }
        }
      })
      continue
    }

    await prisma.$transaction(async tx => {
      const lead = await tx.lead.create({
        data: {
          workspaceId,
          name: row.name,
          phone,
          email: row.email || null,
          ...identity,
          source: row.source ?? 'GLS',
          utmMedium: row.utmMedium ?? 'Google Local Services',
          notes: row.notes ?? null,
          metadata,
          pipelineStageId: stage.id,
          dealValue: row.dealValue ?? null,
          closedAt: row.dealValue ? createdAt ?? new Date() : null,
          ...(createdAt && { createdAt }),
        },
        select: { id: true },
      })
      if (row.dealValue) {
        await tx.deal.create({ data: { workspaceId, leadId: lead.id, value: row.dealValue } })
      }
    })
  }
}

main()
  .catch(error => { console.error(error); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
