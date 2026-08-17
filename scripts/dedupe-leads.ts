import { Prisma, PrismaClient } from '@prisma/client'
import { writeFileSync } from 'node:fs'
import { normalizeLeadEmail, normalizeLeadPhone } from '../lib/lead-identity'

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

type Candidate = Awaited<ReturnType<typeof loadLeads>>[number]

function loadLeads() {
  return prisma.lead.findMany({
    include: {
      workspace: { select: { name: true, currency: true } },
      stage: { select: { order: true } },
      deals: { select: { id: true, value: true } },
      _count: { select: { conversations: true, capiEvents: true } },
    },
  })
}

function score(lead: Candidate): number {
  return (lead.dealValue ? 1_000_000_000 : 0)
    + lead.stage.order * 1_000_000
    + lead.deals.length * 10_000
    + lead._count.conversations * 1_000
    + lead._count.capiEvents * 100
    - lead.createdAt.getTime() / 1e12
}

function usefulName(value: string): boolean {
  return !['', 'lead', 'customer', 'sem nome'].includes(value.trim().toLowerCase())
}

async function main() {
  const leads = await loadLeads()
  const parent = new Map(leads.map(lead => [lead.id, lead.id]))
  const identityOwner = new Map<string, string>()

  const find = (id: string): string => {
    const current = parent.get(id)!
    if (current === id) return id
    const root = find(current)
    parent.set(id, root)
    return root
  }
  const union = (a: string, b: string) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootB, rootA)
  }

  for (const lead of leads) {
    const phone = normalizeLeadPhone(lead.phone, lead.workspace.currency)
    const email = normalizeLeadEmail(lead.email)
    for (const identity of [phone && `p:${phone}`, email && `e:${email}`].filter(Boolean) as string[]) {
      const key = `${lead.workspaceId}:${identity}`
      const owner = identityOwner.get(key)
      if (owner) union(lead.id, owner)
      else identityOwner.set(key, lead.id)
    }
  }

  const components = new Map<string, Candidate[]>()
  for (const lead of leads) {
    const root = find(lead.id)
    components.set(root, [...(components.get(root) ?? []), lead])
  }
  const duplicateGroups = [...components.values()].filter(group => group.length > 1)
  const summary = new Map<string, { groups: number; removed: number }>()
  for (const group of duplicateGroups) {
    const item = summary.get(group[0]!.workspace.name) ?? { groups: 0, removed: 0 }
    item.groups++
    item.removed += group.length - 1
    summary.set(group[0]!.workspace.name, item)
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    totalLeads: leads.length,
    leadValueTotal: leads.reduce((sum, lead) => sum + (lead.dealValue ?? 0), 0),
    dealCount: leads.reduce((sum, lead) => sum + lead.deals.length, 0),
    dealValueTotal: leads.reduce((sum, lead) => sum + lead.deals.reduce((dealSum, deal) => dealSum + deal.value, 0), 0),
    duplicateGroups: duplicateGroups.length,
    leadsToMerge: duplicateGroups.reduce((sum, group) => sum + group.length - 1, 0),
    workspaces: [...summary.entries()].map(([workspace, counts]) => ({ workspace, ...counts })),
  }, null, 2))

  if (!apply) return

  const affectedIds = duplicateGroups.flatMap(group => group.map(lead => lead.id))
  const backup = await prisma.lead.findMany({
    where: { id: { in: affectedIds } },
    include: {
      deals: true,
      conversations: { select: { id: true } },
      capiEvents: { select: { id: true } },
    },
  })
  const backupPath = `/tmp/dash-capi-leads-dedupe-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  writeFileSync(backupPath, JSON.stringify(backup, null, 2), { flag: 'wx' })
  console.log(`Backup: ${backupPath}`)

  for (const group of duplicateGroups) {
    const ordered = [...group].sort((a, b) => score(b) - score(a))
    const canonical = ordered[0]!
    const duplicates = ordered.slice(1)
    const duplicateIds = duplicates.map(lead => lead.id)
    const stageLead = [...group].sort((a, b) => b.stage.order - a.stage.order)[0]!
    const names = group.map(lead => lead.name).filter(usefulName).sort((a, b) => b.length - a.length)
    const tags = [...new Set(group.flatMap(lead => lead.tags))]
    const totalDealValue = group.reduce((sum, lead) => sum + (lead.dealValue ?? 0), 0)
    const notes = [...new Set(group.map(lead => lead.notes?.trim()).filter(Boolean))].join('\n\n') || null
    const contacts = group.map(lead => ({ id: lead.id, phone: lead.phone, email: lead.email, name: lead.name }))
    const originalMetadata = canonical.metadata && typeof canonical.metadata === 'object' && !Array.isArray(canonical.metadata)
      ? canonical.metadata as Prisma.JsonObject
      : {}

    await prisma.$transaction(async tx => {
      await Promise.all([
        tx.deal.updateMany({ where: { leadId: { in: duplicateIds } }, data: { leadId: canonical.id } }),
        tx.conversation.updateMany({ where: { leadId: { in: duplicateIds } }, data: { leadId: canonical.id } }),
        tx.cAPIEvent.updateMany({ where: { leadId: { in: duplicateIds } }, data: { leadId: canonical.id } }),
      ])
      await tx.lead.deleteMany({ where: { id: { in: duplicateIds } } })
      await tx.lead.update({
        where: { id: canonical.id },
        data: {
          name: names[0] ?? canonical.name,
          email: canonical.email ?? group.find(lead => lead.email)?.email ?? null,
          phone: canonical.phone ?? group.find(lead => lead.phone)?.phone ?? null,
          normalizedEmail: normalizeLeadEmail(canonical.email ?? group.find(lead => lead.email)?.email),
          normalizedPhone: normalizeLeadPhone(canonical.phone ?? group.find(lead => lead.phone)?.phone, canonical.workspace.currency),
          clientType: canonical.clientType ?? group.find(lead => lead.clientType)?.clientType ?? null,
          source: canonical.source ?? group.find(lead => lead.source)?.source ?? null,
          utmSource: canonical.utmSource ?? group.find(lead => lead.utmSource)?.utmSource ?? null,
          utmMedium: canonical.utmMedium ?? group.find(lead => lead.utmMedium)?.utmMedium ?? null,
          utmCampaign: canonical.utmCampaign ?? group.find(lead => lead.utmCampaign)?.utmCampaign ?? null,
          pipelineStageId: stageLead.pipelineStageId,
          dealValue: totalDealValue || null,
          closedAt: group.map(lead => lead.closedAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null,
          tags,
          notes,
          createdAt: group.map(lead => lead.createdAt).sort((a, b) => a.getTime() - b.getTime())[0],
          metadata: { ...originalMetadata, deduplicatedContacts: contacts } as Prisma.InputJsonValue,
        },
      })
    })
  }

  // Depois de consolidar os grupos, preenche a identidade dos leads únicos. A partir daqui,
  // os índices compostos do banco também impedem duas criações concorrentes do mesmo contato.
  const remaining = await loadLeads()
  for (const lead of remaining) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        normalizedEmail: normalizeLeadEmail(lead.email),
        normalizedPhone: normalizeLeadPhone(lead.phone, lead.workspace.currency),
      },
    })
  }
}

main()
  .catch(error => { console.error(error); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
