/**
 * Reimportação recorrente de leads do CRM antigo (outro projeto/sistema próprio da
 * agência, onde o n8n ainda joga os leads de WhatsApp/formulários Meta) pro CRM deste
 * projeto (dash-capi).
 *
 * Idempotente: leads e estágios já importados não são sobrescritos (update: {}) —
 * preserva qualquer edição feita depois pela equipe no Kanban daqui. Só cria o que
 * é novo lá. Deals (valor/status) são re-sincronizados a cada rodada, já que o
 * status de fechamento tende a continuar sendo atualizado no sistema de origem.
 *
 * Uso:
 *   npx tsx scripts/reimport-crm-leads.ts
 *
 * Requer SUPABASE_CRM_URL no .env/.env.local (Supabase > Settings > Database >
 * Connection string > URI, senha direta). Não depende de SUPABASE_DASH_URL — essa
 * variável era só da migração histórica Neon-era (scripts/migrate-supabase.ts).
 */

import { Client } from 'pg'
import { PrismaClient } from '@prisma/client'

const SUPABASE_CRM_URL = process.env.SUPABASE_CRM_URL || ''

const prisma = new PrismaClient()

async function connectCrm() {
  if (!SUPABASE_CRM_URL) {
    console.error('❌  SUPABASE_CRM_URL não configurada.')
    process.exit(1)
  }
  const client = new Client({ connectionString: SUPABASE_CRM_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log('✅  Conectado ao CRM antigo')
  return client
}

const idMap = new Map<string, string>()

// Mapeamento explícito pra clientes cujo nome não bate por slug entre os dois sistemas.
const EXPLICIT_MAP: Record<string, string> = {
  '83098577-7003-430b-9d10-1fa04d861b64': '38e9d4d4-56c7-427b-ad55-08f15c01be97', // Amanda Campos - Nutri → Amanda Campos
  '6b1eb460-a2a7-4452-979a-0a7d753f8e60': '723e59f7-1474-40de-98c8-95aa0125a746', // Âncora Insurance → Âncora
  '58fb61b6-94b3-45df-9d31-882837d27b7c': '74605ba6-11d0-4999-9bc2-4047c1cf2cfc', // Dr. Carlos Henrique Vianna → Dr. Carlos Vianna
  '73640493-4681-497e-8900-67cbac3c06e6': '5de6c5d5-de57-4a83-adbc-6df7fefae4e3', // Dr. Rafael Villela → Rafael Villela
  '15d21acb-96ca-4576-a019-ee11c33a5b6e': '5fbf6935-f2b5-4d72-a942-ed9a79077653', // JCN Remodeling → JCN
  '79957322-40a6-4537-93e6-9715d41fb028': '6244e80f-fb4f-4dc5-928e-9430503c448f', // JM National Pools → JM Pool
  'b9cab901-6da7-4fa4-8ed3-da25abed044c': 'b7900628-0aa1-48bc-9180-127274d4cbe4', // Urbano Painting → Urbano
  '41b432d7-e847-4429-a912-d9eed78c0b28': '298b48d4-6559-4682-a5a3-9b52c5d76966', // Waxing and Laser → Waxing
  '09f6080c-32d4-4745-92c2-a281f84196df': '46983ce6-fd29-464e-86db-b7d28d2d552a', // CIOM → CIOM Odontologia
}

async function buildCrmIdMap(crm: Client) {
  console.log('\n🔗  Mapeando clientes CRM → workspaces...')
  const { rows } = await crm.query(`SELECT id, name FROM clients`)
  const workspaces = await prisma.workspace.findMany({ select: { id: true, name: true, slug: true } })
  const toSlug = (n: string) => n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  let mapped = 0
  for (const r of rows) {
    if (EXPLICIT_MAP[r.id]) { idMap.set(r.id, EXPLICIT_MAP[r.id]); mapped++; continue }
    const ws = workspaces.find(w => w.slug === toSlug(r.name) || toSlug(w.name) === toSlug(r.name))
    if (ws) { idMap.set(r.id, ws.id); mapped++; continue }
    const slug = toSlug(r.name) || r.id
    const newWs = await prisma.workspace.upsert({
      where: { slug },
      create: { id: r.id, name: r.name, slug },
      update: {},
    })
    idMap.set(r.id, newWs.id)
    mapped++
    console.log(`  + criado workspace novo (sem match): ${r.name}`)
  }
  console.log(`  ✓ ${mapped}/${rows.length} clientes mapeados`)
}

const stageMap = new Map<string, Map<string, string>>()
const STAGE_COLORS = ['#6a11cb', '#2575fc', '#f59e0b', '#10b981', '#ec4899', '#ef4444', '#8b5cf6', '#06b6d4']

async function migrateCrmPipelineColumns(crm: Client) {
  console.log('\n📋  Sincronizando pipeline stages...')
  const { rows } = await crm.query(`SELECT id, pipeline_columns FROM clients WHERE pipeline_columns IS NOT NULL`)
  let total = 0
  for (const r of rows) {
    const workspaceId = idMap.get(r.id) ?? r.id
    if (!workspaceId) continue
    try {
      await prisma.workspace.update({ where: { id: workspaceId }, data: { pipelineColumns: r.pipeline_columns } })
    } catch {}
    const cols: { id: string; title: string; color?: string }[] = Array.isArray(r.pipeline_columns)
      ? r.pipeline_columns
      : (typeof r.pipeline_columns === 'string' ? JSON.parse(r.pipeline_columns) : [])
    if (!cols.length) continue
    const colStageMap = new Map<string, string>()
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i]
      const color = col.color ?? STAGE_COLORS[i % STAGE_COLORS.length]
      const stageId = `crm-${workspaceId.slice(-8)}-${col.id}`.slice(0, 30)
      // update: {} — estágios já existentes podem ter sido renomeados/reordenados na UI
      // nova (PATCH /api/stages/[id]); não reverter isso em re-execuções.
      await prisma.pipelineStage.upsert({
        where: { id: stageId },
        create: { id: stageId, workspaceId, name: col.title, color, order: i, triggerCapiEvent: 'none' },
        update: {},
      })
      colStageMap.set(col.id, stageId)
      total++
    }
    stageMap.set(r.id, colStageMap)
  }
  console.log(`  ✓ ${total} stages verificados/criados`)
}

async function migrateCrmProducts(crm: Client) {
  console.log('\n🛍️   Sincronizando produtos...')
  const { rows } = await crm.query(`SELECT * FROM products`)
  let count = 0
  for (const r of rows) {
    const workspaceId = idMap.get(r.client_id) || r.client_id
    if (!workspaceId) continue
    try {
      await prisma.product.upsert({
        where: { id: r.id },
        create: {
          id: r.id, workspaceId,
          name: r.name, price: Number(r.price) || 0,
          description: r.description, currency: r.currency || 'BRL',
          createdAt: r.created_at ? new Date(r.created_at) : undefined,
        },
        update: { name: r.name, price: Number(r.price) || 0, description: r.description, currency: r.currency || 'BRL' },
      })
      count++
    } catch (e) { console.log(`  ⚠️  produto ${r.id}: ${e instanceof Error ? e.message : e}`) }
  }
  console.log(`  ✓ ${count} produtos`)
}

async function migrateCrmLeads(crm: Client) {
  console.log('\n👤  Importando leads novos...')
  const { rows: cols } = await crm.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'leads' ORDER BY ordinal_position
  `)
  const colNames = cols.map((c: { column_name: string }) => c.column_name)
  const stageCol = colNames.find((c: string) => ['status', 'column_id', 'stage_id', 'status_id', 'pipeline_column_id', 'pipeline_stage_id'].includes(c)) ?? null
  const sourceCol = colNames.find((c: string) => ['source', 'origin', 'lead_source'].includes(c)) ?? null
  console.log(`  stage col: ${stageCol ?? '(none)'}  source col: ${sourceCol ?? '(none)'}`)

  const { rows } = await crm.query(`SELECT * FROM leads ORDER BY created_at`)

  // Uma única consulta pra saber quais IDs já existem, em vez de um findUnique por lead —
  // essencial dado a latência alta do pool do Supabase (connection_limit=1): 3528 round-trips
  // sequenciais levaria dezenas de minutos, isso aqui leva 1 query.
  const existingIds = new Set((await prisma.lead.findMany({ select: { id: true } })).map(l => l.id))
  console.log(`  ${existingIds.size} leads já existentes carregados em memória`)

  const defaultStageCache = new Map<string, string>()
  async function getDefaultStage(workspaceId: string) {
    if (defaultStageCache.has(workspaceId)) return defaultStageCache.get(workspaceId)!
    let stage = await prisma.pipelineStage.findFirst({ where: { workspaceId }, orderBy: { order: 'asc' } })
    if (!stage) {
      stage = await prisma.pipelineStage.create({ data: { workspaceId, name: 'Novo', order: 0, color: '#6a11cb', triggerCapiEvent: 'none' } })
    }
    defaultStageCache.set(workspaceId, stage.id)
    return stage.id
  }

  let created = 0, skipped = 0, stageHit = 0, processed = 0
  for (const r of rows) {
    processed++
    if (processed % 250 === 0) console.log(`  ... ${processed}/${rows.length} avaliados (${created} criados até aqui)`)
    const workspaceId = idMap.get(r.client_id) ?? r.client_id
    if (!workspaceId) continue
    try {
      if (existingIds.has(r.id)) { skipped++; continue }

      let stageId: string
      if (stageCol && r[stageCol]) {
        const clientCols = stageMap.get(r.client_id)
        const mapped = clientCols?.get(String(r[stageCol]))
        if (mapped) { stageId = mapped; stageHit++ }
        else stageId = await getDefaultStage(workspaceId)
      } else {
        stageId = await getDefaultStage(workspaceId)
      }

      const source = (sourceCol ? r[sourceCol] : null) ?? r.utm_source ?? null

      await prisma.lead.create({
        data: {
          id: r.id, workspaceId,
          name: r.name || 'Lead',
          email: r.email ?? null,
          phone: r.phone ?? null,
          utmSource: r.utm_source ?? null,
          utmMedium: r.utm_medium ?? null,
          source,
          notes: r.notes ?? null,
          metadata: r.metadata ?? null,
          displayOrder: r.display_order ?? null,
          pipelineStageId: stageId,
          createdAt: r.created_at ? new Date(r.created_at) : undefined,
        },
      })
      created++
    } catch (e) { console.log(`  ⚠️  lead ${r.id}: ${e instanceof Error ? e.message : e}`) }
  }
  console.log(`  ✓ ${created} leads novos criados (${stageHit} com stage mapeada) | ${skipped} já existiam, pulados`)
}

async function migrateCrmDeals(crm: Client) {
  console.log('\n💰  Sincronizando deals (valor/status)...')
  const { rows } = await crm.query(`SELECT * FROM deals`)

  // leadId -> workspaceId pré-carregado (uma query) em vez de um findUnique por deal.
  const leadWorkspace = new Map(
    (await prisma.lead.findMany({ select: { id: true, workspaceId: true } })).map(l => [l.id, l.workspaceId])
  )

  let count = 0, processed = 0
  const touchedLeadIds = new Set<string>()
  for (const r of rows) {
    processed++
    if (processed % 200 === 0) console.log(`  ... ${processed}/${rows.length} avaliados`)
    const workspaceId = leadWorkspace.get(r.lead_id)
    if (!workspaceId) continue
    try {
      await prisma.deal.upsert({
        where: { id: r.id },
        create: {
          id: r.id, workspaceId, leadId: r.lead_id, productId: r.product_id || null,
          value: Number(r.value) || 0, status: r.status,
          createdAt: r.created_at ? new Date(r.created_at) : undefined,
        },
        update: { value: Number(r.value) || 0, status: r.status },
      })
      touchedLeadIds.add(r.lead_id)
      count++
    } catch (e) { console.log(`  ⚠️  deal ${r.id}: ${e instanceof Error ? e.message : e}`) }
  }
  console.log(`  ✓ ${count} deals sincronizados`)

  // Deal.value é só o registro da venda — quem a Pipeline e o Dashboard realmente somam pro
  // faturamento é Lead.dealValue, que esse script nunca atualizava (bug real: 176 leads em 4
  // clientes ficaram com faturamento subestimado/zerado até ser corrigido e recalculado aqui
  // em 30/07/2026). Recalcula só pros leads tocados nesta rodada, em lote (2 queries) em vez
  // de um findUnique por lead — essencial dado a latência do pool.
  console.log('\n💵  Recalculando Lead.dealValue a partir dos deals...')
  const leadIds = [...touchedLeadIds]
  const [allDeals, currentLeads] = await Promise.all([
    prisma.deal.findMany({ where: { leadId: { in: leadIds } }, select: { leadId: true, value: true, createdAt: true } }),
    prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, dealValue: true, closedAt: true } }),
  ])
  const leadMap = new Map(currentLeads.map(l => [l.id, l]))
  const dealsByLead = new Map<string, { value: number; createdAt: Date }[]>()
  for (const d of allDeals) {
    if (!dealsByLead.has(d.leadId)) dealsByLead.set(d.leadId, [])
    dealsByLead.get(d.leadId)!.push(d)
  }
  let recalculated = 0
  for (const leadId of leadIds) {
    const deals = dealsByLead.get(leadId) ?? []
    const sum = deals.reduce((s, d) => s + d.value, 0)
    const lead = leadMap.get(leadId)
    if (!lead) continue
    const needsClosedAt = sum > 0 && !lead.closedAt
    if (Math.abs(sum - (lead.dealValue ?? 0)) > 0.01 || needsClosedAt) {
      const latest = deals.reduce((max, d) => d.createdAt > max ? d.createdAt : max, deals[0]?.createdAt ?? new Date())
      await prisma.lead.update({
        where: { id: leadId },
        data: { dealValue: sum, ...(needsClosedAt ? { closedAt: latest } : {}) },
      })
      recalculated++
    }
  }
  console.log(`  ✓ ${recalculated} leads com dealValue recalculado`)
}

async function main() {
  console.log('🚀  Reimportação CRM antigo → dash-capi\n')
  const crm = await connectCrm()
  try {
    await buildCrmIdMap(crm)
    await migrateCrmPipelineColumns(crm)
    await migrateCrmProducts(crm)
    await migrateCrmLeads(crm)
    await migrateCrmDeals(crm)
    console.log('\n✅  Reimportação concluída!\n')
  } finally {
    await crm.end()
    await prisma.$disconnect()
  }
}

main()
