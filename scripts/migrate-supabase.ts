/**
 * Migração Supabase → Neon
 *
 * Uso:
 *   1. Preencha SUPABASE_DASH_URL e SUPABASE_CRM_URL abaixo
 *      (Supabase > Settings > Database > Connection string > URI, usando a senha direta)
 *   2. npx tsx scripts/migrate-supabase.ts
 *
 * O script é idempotente: usa upsert em todos os modelos.
 */

import { Client } from 'pg'
import { PrismaClient } from '@prisma/client'

// ─── Configure here ────────────────────────────────────────────────────────────
const SUPABASE_DASH_URL = process.env.SUPABASE_DASH_URL || ''
const SUPABASE_CRM_URL  = process.env.SUPABASE_CRM_URL  || ''
// ───────────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient()

const f = (v: unknown): number | null => v == null ? null : parseFloat(String(v))

async function connectSupabase(url: string, label: string) {
  if (!url) {
    console.error(`❌  ${label}: URL não configurada. Defina a env var correspondente.`)
    process.exit(1)
  }
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log(`✅  Conectado ao Supabase ${label}`)
  return client
}

// Map supabase client UUID → neon workspace id
const idMap = new Map<string, string>()

// ─── 1. Workspaces (from Dash clients) ────────────────────────────────────────
async function migrateWorkspaces(dash: Client) {
  console.log('\n📦  Migrando workspaces...')
  const { rows } = await dash.query(`
    SELECT c.id, c.name, c.currency, c.is_active,
           cs_t.is_active AS svc_trafego,
           cs_s.is_active AS svc_social,
           cs_gb.is_active AS svc_gbp,
           cdc_m.visible_metrics AS meta_metrics,
           cdc_g.visible_metrics AS google_metrics,
           cdc_f.funnel_metrics   AS funnel_metrics
    FROM clients c
    LEFT JOIN client_services cs_t  ON cs_t.client_id  = c.id AND cs_t.service_type  = 'trafego_pago'
    LEFT JOIN client_services cs_s  ON cs_s.client_id  = c.id AND cs_s.service_type  = 'social_media'
    LEFT JOIN client_services cs_gb ON cs_gb.client_id = c.id AND cs_gb.service_type = 'google_meu_negocio'
    LEFT JOIN client_dashboard_configs cdc_m ON cdc_m.client_id = c.id AND cdc_m.service_type = 'meta'
    LEFT JOIN client_dashboard_configs cdc_g ON cdc_g.client_id = c.id AND cdc_g.service_type = 'google'
    LEFT JOIN client_dashboard_configs cdc_f ON cdc_f.client_id = c.id AND cdc_f.service_type = 'funnel'
  `)

  for (const r of rows) {
    const slug = r.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    // Nota: svc* e *VisibleMetrics/funnelMetrics só são setados na criação.
    // Workspaces já existentes são geridos pela UI nova (clientes/[id] -> PATCH
    // /api/clients/[id]) e não devem ser revertidos por re-execuções deste script.
    const ws = await prisma.workspace.upsert({
      where: { slug },
      create: {
        id: r.id, // keep original UUID so relation keys match
        name: r.name,
        slug,
        currency: r.currency || 'BRL',
        svcTrafeqoPago:    !!r.svc_trafego,
        svcSocialMedia:    !!r.svc_social,
        svcGoogleBusiness: !!r.svc_gbp,
        metaVisibleMetrics:   Array.isArray(r.meta_metrics)   ? r.meta_metrics   : r.meta_metrics   ? Object.keys(r.meta_metrics)   : [],
        googleVisibleMetrics: Array.isArray(r.google_metrics) ? r.google_metrics : r.google_metrics ? Object.keys(r.google_metrics) : [],
        funnelMetrics:        Array.isArray(r.funnel_metrics)  ? r.funnel_metrics  : r.funnel_metrics  ? Object.keys(r.funnel_metrics)  : [],
      },
      update: {},
    })
    idMap.set(r.id, ws.id)
    console.log(`  ✓ ${r.name}  (${r.id})`)
  }
}

// ─── 2. Meta Ads (monthly) ────────────────────────────────────────────────────
async function migrateMetaAds(dash: Client) {
  console.log('\n📊  Migrando Meta Ads (mensal)...')
  const { rows } = await dash.query(`SELECT * FROM meta_ads_data`)
  for (const r of rows) {
    const workspaceId = idMap.get(r.client_id)
    if (!workspaceId) continue
    const period = r.period || r.created_at?.toISOString().slice(0, 7) || '2024-01'
    await prisma.metaAdsData.upsert({
      where: { workspaceId_period: { workspaceId, period } },
      create: {
        workspaceId, period,
        valorGasto: f(r.valor_gasto ?? r.spend),
        impressoes: f(r.impressoes ?? r.impressions),
        alcance: f(r.alcance ?? r.reach),
        frequencia: f(r.frequencia ?? r.frequency),
        cliques: f(r.cliques ?? r.clicks),
        ctr: f(r.ctr), cpc: f(r.cpc),
        resultados: f(r.resultados ?? r.results),
        custoResultado: f(r.custo_resultado ?? r.cost_per_result),
        roas: f(r.roas), observations: r.observations,
      },
      update: {
        valorGasto: f(r.valor_gasto ?? r.spend),
        impressoes: f(r.impressoes ?? r.impressions),
        alcance: f(r.alcance ?? r.reach),
        frequencia: f(r.frequencia ?? r.frequency),
        cliques: f(r.cliques ?? r.clicks),
        ctr: f(r.ctr), cpc: f(r.cpc),
        resultados: f(r.resultados ?? r.results),
        custoResultado: f(r.custo_resultado ?? r.cost_per_result),
        roas: f(r.roas), observations: r.observations,
      },
    })
  }
  console.log(`  ✓ ${rows.length} registros`)
}

// ─── 3. Meta Ads Daily ────────────────────────────────────────────────────────
async function migrateMetaAdsDaily(dash: Client) {
  console.log('\n📊  Migrando Meta Ads (diário)...')
  const { rows } = await dash.query(`SELECT * FROM meta_ads_daily_data ORDER BY date`)
  const data = rows.flatMap(r => {
    const workspaceId = idMap.get(r.client_id)
    if (!workspaceId) return []
    return [{ workspaceId, date: new Date(r.date), campaignName: r.campaign_name ?? null, campaignId: r.campaign_id ?? null,
      valorGasto: f(r.valor_gasto ?? r.spend), impressoes: f(r.impressoes ?? r.impressions),
      alcance: f(r.alcance ?? r.reach), cliques: f(r.cliques ?? r.clicks),
      ctr: f(r.ctr), cpc: f(r.cpc), resultados: f(r.resultados ?? r.results),
      custoResultado: f(r.custo_resultado ?? r.cost_per_result) }]
  })
  await prisma.metaAdsDailyData.createMany({ data, skipDuplicates: true })
  console.log(`  ✓ ${data.length} registros`)
}

// ─── 4. Google Ads (monthly) ──────────────────────────────────────────────────
async function migrateGoogleAds(dash: Client) {
  console.log('\n📊  Migrando Google Ads (mensal)...')
  const { rows } = await dash.query(`SELECT * FROM google_ads_data`)
  for (const r of rows) {
    const workspaceId = idMap.get(r.client_id)
    if (!workspaceId) continue
    const period = r.period || r.created_at?.toISOString().slice(0, 7) || '2024-01'
    await prisma.googleAdsData.upsert({
      where: { workspaceId_period: { workspaceId, period } },
      create: {
        workspaceId, period,
        valorGasto: f(r.valor_gasto), impressoes: f(r.impressoes),
        cliques: f(r.cliques), ctr: f(r.ctr), cpc: f(r.cpc),
        resultados: f(r.resultados), custoResultado: f(r.custo_resultado),
        leadesBc: f(r.leads_bc), observations: r.observations,
      },
      update: {
        valorGasto: f(r.valor_gasto), impressoes: f(r.impressoes),
        cliques: f(r.cliques), ctr: f(r.ctr), cpc: f(r.cpc),
        resultados: f(r.resultados), custoResultado: f(r.custo_resultado),
        leadesBc: f(r.leads_bc), observations: r.observations,
      },
    })
  }
  console.log(`  ✓ ${rows.length} registros`)
}

// ─── 5. Google Ads Daily ──────────────────────────────────────────────────────
async function migrateGoogleAdsDaily(dash: Client) {
  console.log('\n📊  Migrando Google Ads (diário)...')
  const { rows } = await dash.query(`SELECT * FROM google_ads_daily_data ORDER BY date`)
  const data = rows.flatMap(r => {
    const workspaceId = idMap.get(r.client_id)
    if (!workspaceId) return []
    return [{ workspaceId, date: new Date(r.date), campaignName: r.campaign_name ?? null, campaignId: r.campaign_id ?? null,
      valorGasto: f(r.valor_gasto), impressoes: f(r.impressoes), cliques: f(r.cliques),
      ctr: f(r.ctr), cpc: f(r.cpc), resultados: f(r.resultados),
      custoResultado: f(r.custo_resultado), leadesBc: f(r.leads_bc) }]
  })
  await prisma.googleAdsDailyData.createMany({ data, skipDuplicates: true })
  console.log(`  ✓ ${data.length} registros`)
}

// ─── 6. Google Ads Keywords ───────────────────────────────────────────────────
async function migrateGoogleKeywords(dash: Client) {
  console.log('\n🔑  Migrando Google Ads keywords...')
  const { rows } = await dash.query(`SELECT * FROM google_ads_keywords_monthly`)
  let count = 0
  for (const r of rows) {
    const workspaceId = idMap.get(r.client_id)
    if (!workspaceId) continue
    const period = r.month ? new Date(r.month).toISOString().slice(0, 7) : '2024-01'
    try {
      await prisma.googleAdsKeyword.upsert({
        where: {
          workspaceId_period_keyword_matchType_campaignName: {
            workspaceId, period,
            keyword: r.keyword || '',
            matchType: r.match_type || '',
            campaignName: r.campaign_name || '',
          },
        },
        create: {
          workspaceId, period,
          keyword: r.keyword, matchType: r.match_type,
          campaignName: r.campaign_name, adGroupName: r.ad_group_name,
          impressions: f(r.impressions) ?? 0, clicks: f(r.clicks) ?? 0,
          ctr: f(r.ctr) ?? 0, cost: f(r.cost) ?? 0,
          conversions: f(r.conversions) ?? 0, cpc: f(r.cpc) ?? 0,
        },
        update: {
          impressions: f(r.impressions) ?? 0, clicks: f(r.clicks) ?? 0,
          ctr: f(r.ctr) ?? 0, cost: f(r.cost) ?? 0,
          conversions: f(r.conversions) ?? 0, cpc: f(r.cpc) ?? 0,
        },
      })
      count++
    } catch {}
  }
  console.log(`  ✓ ${count} registros`)
}

// ─── 7. Google Business ───────────────────────────────────────────────────────
async function migrateGoogleBusiness(dash: Client) {
  console.log('\n🗺️   Migrando Google Business...')
  const { rows } = await dash.query(`SELECT * FROM google_meu_negocio_data`)
  for (const r of rows) {
    const workspaceId = idMap.get(r.client_id)
    if (!workspaceId) continue
    const period = r.period || r.created_at?.toISOString().slice(0, 7) || '2024-01'
    await prisma.googleBusinessData.upsert({
      where: { workspaceId_period: { workspaceId, period } },
      create: {
        workspaceId, period,
        profileViews: f(r.profile_views), phoneCalls: f(r.phone_calls),
        routeRequests: f(r.route_requests), websiteVisits: f(r.website_visits),
        chatMessages: f(r.chat_messages), whatsappClicks: f(r.whatsapp_clicks),
        googleSearchViews: f(r.google_search_views), googleMapsViews: f(r.google_maps_views),
        totalReviews: f(r.total_reviews), averageStars: f(r.average_stars),
        newReviewsThisMonth: f(r.new_reviews_this_month),
        reviewsWithoutComments: f(r.reviews_without_comments),
        likesPositiveReviews: f(r.likes_positive_reviews),
        likesNegativeReviews: f(r.likes_negative_reviews),
        totalCitations: f(r.total_citations), routeSimulations: f(r.route_simulations),
        citationsThisMonth: f(r.citations_this_month),
        keywords: r.keywords, profileRating: f(r.profile_rating),
        postsThisMonth: f(r.posts_this_month),
        mapPositionAvg: f(r.map_position_avg), searchPositionAvg: f(r.search_position_avg),
        competitorCount: f(r.competitor_count), observations: r.observations,
      },
      update: {
        profileViews: f(r.profile_views), phoneCalls: f(r.phone_calls),
        routeRequests: f(r.route_requests), websiteVisits: f(r.website_visits),
        chatMessages: f(r.chat_messages), whatsappClicks: f(r.whatsapp_clicks),
        googleSearchViews: f(r.google_search_views), googleMapsViews: f(r.google_maps_views),
        totalReviews: f(r.total_reviews), averageStars: f(r.average_stars),
        newReviewsThisMonth: f(r.new_reviews_this_month),
        reviewsWithoutComments: f(r.reviews_without_comments),
        likesPositiveReviews: f(r.likes_positive_reviews),
        likesNegativeReviews: f(r.likes_negative_reviews),
        totalCitations: f(r.total_citations), routeSimulations: f(r.route_simulations),
        citationsThisMonth: f(r.citations_this_month),
        keywords: r.keywords, profileRating: f(r.profile_rating),
        postsThisMonth: f(r.posts_this_month),
        mapPositionAvg: f(r.map_position_avg), searchPositionAvg: f(r.search_position_avg),
        competitorCount: f(r.competitor_count), observations: r.observations,
      },
    })
  }
  console.log(`  ✓ ${rows.length} registros`)
}

// ─── 8. Social Media ──────────────────────────────────────────────────────────
async function migrateSocialMedia(dash: Client) {
  console.log('\n📱  Migrando Social Media...')
  try {
    const { rows } = await dash.query(`SELECT * FROM social_media_data`)
    for (const r of rows) {
      const workspaceId = idMap.get(r.client_id)
      if (!workspaceId) continue
      const period = r.period || r.month || r.created_at?.toISOString().slice(0, 7) || '2024-01'
      const platform = r.platform || 'instagram'
      await prisma.socialMediaData.upsert({
        where: { workspaceId_period_platform: { workspaceId, period, platform } },
        create: {
          workspaceId, period, platform,
          followers: f(r.followers), followersGrowth: f(r.followers_growth ?? r.follower_growth),
          reach: f(r.reach), impressions: f(r.impressions),
          engagement: f(r.engagement), engagementRate: f(r.engagement_rate),
          posts: f(r.posts), stories: f(r.stories),
          saves: f(r.saves), shares: f(r.shares),
          comments: f(r.comments), likes: f(r.likes),
          profileVisits: f(r.profile_visits), websiteClicks: f(r.website_clicks),
          observations: r.observations,
        },
        update: {
          followers: f(r.followers), followersGrowth: f(r.followers_growth ?? r.follower_growth),
          reach: f(r.reach), impressions: f(r.impressions),
          engagement: f(r.engagement), engagementRate: f(r.engagement_rate),
          posts: f(r.posts), stories: f(r.stories),
          saves: f(r.saves), shares: f(r.shares),
          comments: f(r.comments), likes: f(r.likes),
          profileVisits: f(r.profile_visits), websiteClicks: f(r.website_clicks),
          observations: r.observations,
        },
      })
    }
    console.log(`  ✓ ${rows.length} registros`)
  } catch (e: any) {
    console.log(`  ⚠️  social_media_data: ${e.message}`)
  }
}

// ─── 9. Social Posts ──────────────────────────────────────────────────────────
async function migrateSocialPosts(dash: Client) {
  console.log('\n📸  Migrando Social Posts...')
  try {
    const { rows } = await dash.query(`SELECT * FROM social_posts ORDER BY published_at`)
    let count = 0
    for (const r of rows) {
      const workspaceId = idMap.get(r.client_id)
      if (!workspaceId) continue
      const postId = r.post_id || r.external_id || r.id
      const platform = r.platform || 'instagram'
      await prisma.socialPost.upsert({
        where: { workspaceId_platform_postId: { workspaceId, platform, postId: String(postId) } },
        create: {
          workspaceId, platform, postId: String(postId),
          type: r.type ?? r.post_type,
          publishedAt: r.published_at ? new Date(r.published_at) : null,
          caption: r.caption, mediaUrl: r.media_url ?? r.thumbnail_url,
          likes: f(r.likes), comments: f(r.comments),
          shares: f(r.shares), saves: f(r.saves),
          reach: f(r.reach), impressions: f(r.impressions),
          plays: f(r.plays ?? r.video_views),
        },
        update: {
          likes: f(r.likes), comments: f(r.comments),
          shares: f(r.shares), saves: f(r.saves),
          reach: f(r.reach), impressions: f(r.impressions),
          plays: f(r.plays ?? r.video_views),
        },
      })
      count++
    }
    console.log(`  ✓ ${count} registros`)
  } catch (e: any) {
    console.log(`  ⚠️  social_posts: ${e.message}`)
  }
}

// ─── 10. Build CRM → Neon id map ─────────────────────────────────────────────
// Explicit CRM UUID → Neon workspace ID (for clients with different names)
const EXPLICIT_MAP: Record<string, string> = {
  '83098577-7003-430b-9d10-1fa04d861b64': '38e9d4d4-56c7-427b-ad55-08f15c01be97', // Amanda Campos - Nutri → Amanda Campos
  '6b1eb460-a2a7-4452-979a-0a7d753f8e60': '723e59f7-1474-40de-98c8-95aa0125a746', // Âncora Insurance → Âncora
  '58fb61b6-94b3-45df-9d31-882837d27b7c': '74605ba6-11d0-4999-9bc2-4047c1cf2cfc', // Dr. Carlos Henrique Vianna → Dr. Carlos Vianna
  '73640493-4681-497e-8900-67cbac3c06e6': '5de6c5d5-de57-4a83-adbc-6df7fefae4e3', // Dr. Rafael Villela → Rafael Villela
  '15d21acb-96ca-4576-a019-ee11c33a5b6e': '5fbf6935-f2b5-4d72-a942-ed9a79077653', // JCN Remodeling → JCN
  '79957322-40a6-4537-93e6-9715d41fb028': '6244e80f-fb4f-4dc5-928e-9430503c448f', // JM National Pools → JM Pool
  'b9cab901-6da7-4fa4-8ed3-da25abed044c': 'b7900628-0aa1-48bc-9180-127274d4cbe4', // Urbano Painting → Urbano
  '41b432d7-e847-4429-a912-d9eed78c0b28': '298b48d4-6559-4682-a5a3-9b52c5d76966', // Waxing and Laser → Waxing
}

async function buildCrmIdMap(crm: Client) {
  console.log('\n🔗  Mapeando clientes CRM → workspaces Neon...')
  const { rows } = await crm.query(`SELECT id, name FROM clients`)
  const workspaces = await prisma.workspace.findMany({ select: { id: true, name: true, slug: true } })
  const toSlug = (n: string) => n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  let mapped = 0
  for (const r of rows) {
    // explicit mapping first
    if (EXPLICIT_MAP[r.id]) { idMap.set(r.id, EXPLICIT_MAP[r.id]); mapped++; continue }
    // name-based match
    const ws = workspaces.find(w => w.slug === toSlug(r.name) || toSlug(w.name) === toSlug(r.name))
    if (ws) { idMap.set(r.id, ws.id); mapped++; continue }
    // create workspace for CRM-only clients (CIOM, Advogados, etc.)
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

// Map: crmClientId → Map<crmColumnId, neonStageId>
const stageMap = new Map<string, Map<string, string>>()

const STAGE_COLORS = ['#6a11cb','#2575fc','#f59e0b','#10b981','#ec4899','#ef4444','#8b5cf6','#06b6d4']

// ─── 11. CRM - Pipeline stages (from pipeline_columns JSON) ──────────────────
async function migrateCrmPipelineColumns(crm: Client) {
  console.log('\n📋  Migrando pipeline stages (CRM)...')
  const { rows } = await crm.query(`SELECT id, pipeline_columns FROM clients WHERE pipeline_columns IS NOT NULL`)
  let total = 0

  for (const r of rows) {
    const workspaceId = idMap.get(r.id) ?? r.id
    if (!workspaceId) continue

    // Save raw JSON for reference
    try {
      await prisma.workspace.update({ where: { id: workspaceId }, data: { pipelineColumns: r.pipeline_columns } })
    } catch {}

    // Parse columns array
    const cols: { id: string; title: string; color?: string }[] = Array.isArray(r.pipeline_columns)
      ? r.pipeline_columns
      : (typeof r.pipeline_columns === 'string' ? JSON.parse(r.pipeline_columns) : [])

    if (!cols.length) continue

    // Use deterministic IDs so upsert is idempotent even with existing leads
    const colStageMap = new Map<string, string>()
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i]
      const color = col.color ?? STAGE_COLORS[i % STAGE_COLORS.length]
      // Stable ID: prevents duplicate stages on re-runs
      const stageId = `crm-${workspaceId.slice(-8)}-${col.id}`.slice(0, 30)
      // update: {} — estágios já existentes podem ter sido renomeados/reordenados
      // via PATCH /api/stages/[id] na UI nova; não reverter isso em re-execuções.
      await prisma.pipelineStage.upsert({
        where: { id: stageId },
        create: {
          id: stageId,
          workspaceId,
          name: col.title,
          color,
          order: i,
          triggerCapiEvent: 'none',
        },
        update: {},
      })
      colStageMap.set(col.id, stageId)
      total++
    }
    stageMap.set(r.id, colStageMap)
  }
  console.log(`  ✓ ${total} stages criados`)
}

// ─── 11. CRM - Products ───────────────────────────────────────────────────────
async function migrateCrmProducts(crm: Client) {
  console.log('\n🛍️   Migrando produtos (CRM)...')
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
          description: r.description,
          currency: r.currency || 'BRL',
          createdAt: r.created_at ? new Date(r.created_at) : undefined,
        },
        update: {
          name: r.name, price: Number(r.price) || 0,
          description: r.description, currency: r.currency || 'BRL',
        },
      })
      count++
    } catch (e: any) { console.log(`  ⚠️  produto ${r.id}: ${e.message}`) }
  }
  console.log(`  ✓ ${count} produtos`)
}

// ─── 12. CRM - Leads ──────────────────────────────────────────────────────────
async function migrateCrmLeads(crm: Client) {
  console.log('\n👤  Migrando leads (CRM)...')

  // Detect column name for stage/status in leads table
  const { rows: cols } = await crm.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'leads'
    ORDER BY ordinal_position
  `)
  const colNames = cols.map((c: { column_name: string }) => c.column_name)
  console.log('  Colunas leads:', colNames.join(', '))

  const stageCol  = colNames.find((c: string) => ['status','column_id','stage_id','status_id','pipeline_column_id','pipeline_stage_id'].includes(c)) ?? null
  const sourceCol = colNames.find((c: string) => ['source','origin','lead_source'].includes(c)) ?? null
  console.log(`  stage col: ${stageCol ?? '(none)'}  source col: ${sourceCol ?? '(none)'}`)

  const { rows } = await crm.query(`SELECT * FROM leads ORDER BY created_at`)

  // Default stage cache per workspace
  const defaultStageCache = new Map<string, string>()
  async function getDefaultStage(workspaceId: string) {
    if (defaultStageCache.has(workspaceId)) return defaultStageCache.get(workspaceId)!
    let stage = await prisma.pipelineStage.findFirst({ where: { workspaceId }, orderBy: { order: 'asc' } })
    if (!stage) {
      stage = await prisma.pipelineStage.create({
        data: { workspaceId, name: 'Novo', order: 0, color: '#6a11cb', triggerCapiEvent: 'none' },
      })
    }
    defaultStageCache.set(workspaceId, stage.id)
    return stage.id
  }

  let count = 0
  let stageHit = 0
  for (const r of rows) {
    const workspaceId = idMap.get(r.client_id) ?? r.client_id
    if (!workspaceId) continue
    try {
      // Resolve stage: prefer mapped stage from pipeline_columns, fallback to default
      let stageId: string
      if (stageCol && r[stageCol]) {
        const clientCols = stageMap.get(r.client_id)
        const mapped = clientCols?.get(String(r[stageCol]))
        if (mapped) { stageId = mapped; stageHit++ }
        else stageId = await getDefaultStage(workspaceId)
      } else {
        stageId = await getDefaultStage(workspaceId)
      }

      // Resolve source/origin
      const source = (sourceCol ? r[sourceCol] : null) ?? r.utm_source ?? r.utmSource ?? null

      // update: {} — leads já existentes podem ter sido movidos no Kanban
      // (PATCH /api/leads/[id]/stage) ou editados (PATCH /api/leads/[id]) na
      // UI nova; não reverter isso em re-execuções. Só leads novos são criados.
      await prisma.lead.upsert({
        where: { id: r.id },
        create: {
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
        update: {},
      })
      count++
    } catch (e: any) { console.log(`  ⚠️  lead ${r.id}: ${e.message}`) }
  }
  console.log(`  ✓ ${count} leads (${stageHit} com stage correto)`)
}

// ─── 13. CRM - Deals ──────────────────────────────────────────────────────────
async function migrateCrmDeals(crm: Client) {
  console.log('\n💰  Migrando deals (CRM)...')
  const { rows } = await crm.query(`SELECT * FROM deals`)
  let count = 0
  for (const r of rows) {
    // find workspaceId from lead
    let workspaceId: string | undefined
    try {
      const lead = await prisma.lead.findUnique({ where: { id: r.lead_id }, select: { workspaceId: true } })
      workspaceId = lead?.workspaceId
    } catch {}
    if (!workspaceId) continue
    try {
      await prisma.deal.upsert({
        where: { id: r.id },
        create: {
          id: r.id, workspaceId,
          leadId: r.lead_id, productId: r.product_id || null,
          value: Number(r.value) || 0,
          status: r.status,
          createdAt: r.created_at ? new Date(r.created_at) : undefined,
        },
        update: {
          value: Number(r.value) || 0,
          status: r.status,
        },
      })
      count++
    } catch (e: any) { console.log(`  ⚠️  deal ${r.id}: ${e.message}`) }
  }
  console.log(`  ✓ ${count} deals`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀  Iniciando migração Supabase → Neon\n')

  const dash = await connectSupabase(SUPABASE_DASH_URL, 'Dash')
  const crm  = await connectSupabase(SUPABASE_CRM_URL,  'CRM')

  try {
    // 1. Workspaces e mapeamento de IDs (deve vir primeiro)
    await migrateWorkspaces(dash)
    await buildCrmIdMap(crm)

    // 2. Métricas do Dash (dependem do idMap de workspaces)
    await migrateMetaAds(dash)
    await migrateMetaAdsDaily(dash)
    await migrateGoogleAds(dash)
    await migrateGoogleAdsDaily(dash)
    await migrateGoogleKeywords(dash)
    await migrateGoogleBusiness(dash)
    await migrateSocialMedia(dash)
    await migrateSocialPosts(dash)

    // 3. CRM (dependem do idMap de CRM e do stageMap)
    await migrateCrmPipelineColumns(crm)
    await migrateCrmProducts(crm)
    await migrateCrmLeads(crm)
    await migrateCrmDeals(crm)

    console.log('\n✅  Migração concluída!\n')
  } finally {
    await dash.end()
    await crm.end()
    await prisma.$disconnect()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
