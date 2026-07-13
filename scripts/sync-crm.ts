/**
 * Sync CRM Supabase (legado, ainda em uso diário) → Neon — execução manual.
 * A mesma lógica roda automaticamente 1x/dia via app/api/cron/sync-crm (lib/crm-sync.ts).
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

import { syncCrmFromSupabase } from '../lib/crm-sync'

async function main() {
  console.log('🚀  Iniciando sync CRM Supabase → Neon\n')
  const result = await syncCrmFromSupabase(process.env.SUPABASE_CRM_URL || '')
  console.log(`  ✓ ${result.clientsMapped}/${result.clientsTotal} clientes mapeados`)
  console.log(`  ✓ ${result.stagesSynced} stages sincronizados`)
  console.log(`  ✓ ${result.productsSynced} produtos`)
  console.log(`  ✓ ${result.leadsCreated} leads criados, ${result.leadsUpdated} atualizados`)
  console.log(`  ✓ ${result.dealsCreated} deals criados, ${result.dealsUpdated} atualizados`)
  console.log('\n✅  Sync concluído!\n')
}

main().catch(e => { console.error(e); process.exit(1) })
