/**
 * Sync CRM Supabase (legado, ainda em uso diário) → Neon
 *
 * Diferente de migrate-supabase.ts (que só cria leads/deals novos e nunca
 * sobrescreve — pensado pra quando o CRM novo já é a fonte viva), este script
 * sempre atualiza etapa/status/valor de leads e deals já existentes, porque o
 * Supabase é a fonte de verdade atual (confirmado com o usuário).
 *
 * Uso: npx tsx scripts/sync-crm.ts
 */

import fs from 'fs'
for (const file of ['.env', '.env.local']) {
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

import { Client } from 'pg'
import { PrismaClient } from '@prisma/client'

const SUPABASE_CRM_URL = process.env.SUPABASE_CRM_URL || ''

const prisma = new PrismaClient()

const idMap = new Map<string, string>()
const stageMap = new Map<string, Map<string, string>>()

const STAGE_COLORS = ['#6a11cb', '#2575fc', '#f59e0b', '#10b981', '#ec4899', '#ef4444', '#8b5cf6', '#06b6d4']

// Mesmo mapeamento explícito do migrate-supabase.ts, pros clientes com nomes diferentes no CRM
const EXPLICIT_MAP: Record<string, string> = {
  '83098577-7003-430b-9d10-1fa04d861b64': '38e9d4d4-56c7-427b-ad55-08f15c01be97', // Amanda Campos - Nutri → Amanda Campos
  '6b1eb460-a2a7-4452-979a-0a7d753f8e60': '723e59f7-1474-40de-98c8-95aa0125a746', // Âncora Insurance → Âncora
  '58fb61b6-94b3-45df-9d31-882837d27b7c': '74605ba6-11d0-4999-9bc2-4047c1cf2cfc', // Dr. Carlos Henrique Vianna → Dr. Carlos Vianna
  '73640493-4681-497e-8900-67cbac3c06e6': '5de6c5d5-de57-4a83-adbc-6df7fefae4e3', // Dr. Rafael Villela → Rafael Villela
  '15d21acb-96ca-4576-a019-ee11c33a5b6e': '5fbf6935-f2b5-4d72-a942-ed9a79077653', // JCN Remodeling → JCN
  '79957322-40a6-4537-93e6-9715d41fb028': '6244e80f-fb4f-4dc5-928e-9430503c448f', // JM National Pools → JM Pool
  'b9cab901-6da7-4fa4-8ed3-da25abed044c': 'b7900628-0aa1-48bc-9180-127274d4cbe4', // Urbano Painting → Urbano
  '41b432d7-e847-4429-a912-d9eed78c0b28': '298b48d4-6559-4682-a5a3-9b52c5d76966', // Waxing and Laser → Waxing
  '09f6080c-32d4-4745-92c2-a281f84196df': '46983ce6-fd29-464e-86db-b7d28d2d552a', // CIOM → CIOM Odontologia (mesclados nesta sessão; sem isso recriaria o workspace duplicado já removido)
}

async function connectSupabase(url: string) {
  if (!url) {
    console.error('❌  SUPABASE_CRM_URL não configurada.')
    process.exit(1)
  }
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log('✅  Conectado ao Supabase CRM')
  return client
}

async function buildIdMap(crm: Client) {
  console.log('\n🔗  Mapeando clientes CRM → workspaces Neon...')
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
    console.log(`  + criado workspace CRM-only: ${r.name}`)
  }
  console.log(`  ✓ ${mapped}/${rows.length} clientes mapeados`)
}

async function syncPipelineStages(crm: Client) {
  console.log('\n📋  Sincronizando estágios do pipeline...')
  const { rows } = await crm.query(`SELECT id, pipeline_columns FROM clients WHERE pipeline_columns IS NOT NULL`)
  let total = 0
  for (const r of rows) {
    const workspaceId = idMap.get(r.id) ?? r.id
    if (!workspaceId) continue
    try { await prisma.workspace.update({ where: { id: workspaceId }, data: { pipelineColumns: r.pipeline_columns } }) } catch {}

    const cols: { id: string; title: string; color?: string }[] = Array.isArray(r.pipeline_columns)
      ? r.pipeline_columns
      : (typeof r.pipeline_columns === 'string' ? JSON.parse(r.pipeline_columns) : [])
    if (!cols.length) continue

    const colStageMap = new Map<string, string>()
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i]!
      const color = col.color ?? STAGE_COLORS[i % STAGE_COLORS.length]
      const stageId = `crm-${workspaceId.slice(-8)}-${col.id}`.slice(0, 30)
      await prisma.pipelineStage.upsert({
        where: { id: stageId },
        create: { id: stageId, workspaceId, name: col.title, color, order: i, triggerCapiEvent: 'none' },
        update: { name: col.title, color, order: i },
      })
      colStageMap.set(col.id, stageId)
      total++
    }
    stageMap.set(r.id, colStageMap)
  }
  console.log(`  ✓ ${total} stages sincronizados`)
}

async function syncProducts(crm: Client) {
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
          id: r.id, workspaceId, name: r.name, price: Number(r.price) || 0,
          description: r.description, currency: r.currency || 'BRL',
          createdAt: r.created_at ? new Date(r.created_at) : undefined,
        },
        update: { name: r.name, price: Number(r.price) || 0, description: r.description, currency: r.currency || 'BRL' },
      })
      count++
    } catch (e: any) { console.log(`  ⚠️  produto ${r.id}: ${e.message}`) }
  }
  console.log(`  ✓ ${count} produtos`)
}

async function syncLeads(crm: Client) {
  console.log('\n👤  Sincronizando leads...')

  const { rows: cols } = await crm.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'leads' ORDER BY ordinal_position
  `)
  const colNames = cols.map((c: { column_name: string }) => c.column_name)
  const stageCol  = colNames.find((c: string) => ['status', 'column_id', 'stage_id', 'status_id', 'pipeline_column_id', 'pipeline_stage_id'].includes(c)) ?? null
  const sourceCol = colNames.find((c: string) => ['source', 'origin', 'lead_source'].includes(c)) ?? null
  console.log(`  stage col: ${stageCol ?? '(none)'}  source col: ${sourceCol ?? '(none)'}`)

  const { rows } = await crm.query(`SELECT * FROM leads ORDER BY created_at`)

  // Faturamento na Visão Geral soma Lead.dealValue — a tabela deals é separada
  // (1:N, um lead pode ter vários deals ao longo do tempo), então precisa ser
  // agregada aqui e gravada no lead, não só sincronizada isoladamente em Deal.
  const { rows: dealSums } = await crm.query(`SELECT lead_id, SUM(value) as total FROM deals GROUP BY lead_id`)
  const dealValueByLead = new Map<string, number>(dealSums.map((d: any) => [d.lead_id, Number(d.total) || 0]))

  const defaultStageCache = new Map<string, string>()
  async function getDefaultStage(workspaceId: string) {
    if (defaultStageCache.has(workspaceId)) return defaultStageCache.get(workspaceId)!
    let stage = await prisma.pipelineStage.findFirst({ where: { workspaceId }, orderBy: { order: 'asc' } })
    if (!stage) stage = await prisma.pipelineStage.create({ data: { workspaceId, name: 'Novo', order: 0, color: '#6a11cb', triggerCapiEvent: 'none' } })
    defaultStageCache.set(workspaceId, stage.id)
    return stage.id
  }

  let created = 0, updated = 0
  for (const r of rows) {
    const workspaceId = idMap.get(r.client_id) ?? r.client_id
    if (!workspaceId) continue
    try {
      let stageId: string
      if (stageCol && r[stageCol]) {
        const clientCols = stageMap.get(r.client_id)
        const mapped = clientCols?.get(String(r[stageCol]))
        stageId = mapped ?? await getDefaultStage(workspaceId)
      } else {
        stageId = await getDefaultStage(workspaceId)
      }

      const source = (sourceCol ? r[sourceCol] : null) ?? r.utm_source ?? null

      const shared = {
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
        dealValue: dealValueByLead.get(r.id) ?? null,
      }

      const existing = await prisma.lead.findUnique({ where: { id: r.id }, select: { id: true } })
      await prisma.lead.upsert({
        where: { id: r.id },
        create: { id: r.id, workspaceId, ...shared, createdAt: r.created_at ? new Date(r.created_at) : undefined },
        update: shared,
      })
      if (existing) updated++; else created++
    } catch (e: any) { console.log(`  ⚠️  lead ${r.id}: ${e.message}`) }
  }
  console.log(`  ✓ ${created} leads criados, ${updated} atualizados`)
}

async function syncDeals(crm: Client) {
  console.log('\n💰  Sincronizando deals...')
  const { rows } = await crm.query(`SELECT * FROM deals`)
  let created = 0, updated = 0
  for (const r of rows) {
    let workspaceId: string | undefined
    try {
      const lead = await prisma.lead.findUnique({ where: { id: r.lead_id }, select: { workspaceId: true } })
      workspaceId = lead?.workspaceId
    } catch {}
    if (!workspaceId) continue
    try {
      const existing = await prisma.deal.findUnique({ where: { id: r.id }, select: { id: true } })
      await prisma.deal.upsert({
        where: { id: r.id },
        create: {
          id: r.id, workspaceId, leadId: r.lead_id, productId: r.product_id || null,
          value: Number(r.value) || 0, status: r.status,
          createdAt: r.created_at ? new Date(r.created_at) : undefined,
        },
        update: { value: Number(r.value) || 0, status: r.status },
      })
      if (existing) updated++; else created++
    } catch (e: any) { console.log(`  ⚠️  deal ${r.id}: ${e.message}`) }
  }
  console.log(`  ✓ ${created} deals criados, ${updated} atualizados`)
}

async function main() {
  console.log('🚀  Iniciando sync CRM Supabase → Neon\n')
  const crm = await connectSupabase(SUPABASE_CRM_URL)
  try {
    await buildIdMap(crm)
    await syncPipelineStages(crm)
    await syncProducts(crm)
    await syncLeads(crm)
    await syncDeals(crm)
    console.log('\n✅  Sync concluído!\n')
  } finally {
    await crm.end()
    await prisma.$disconnect()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
