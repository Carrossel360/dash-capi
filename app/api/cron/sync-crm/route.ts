import { NextRequest, NextResponse } from 'next/server'
import { syncCrmFromSupabase } from '@/lib/crm-sync'

// Disparado 1x/dia pelo cron-job.org enquanto o CRM Supabase legado ainda é a fonte
// de verdade (mesmo padrão de app/api/cron/capi). Requer SUPABASE_CRM_URL nas env vars.
export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get('authorization')
  if (process.env.CRON_SECRET && cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncCrmFromSupabase(process.env.SUPABASE_CRM_URL ?? '')
    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/cron/sync-crm]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao sincronizar CRM' },
      { status: 500 }
    )
  }
}
