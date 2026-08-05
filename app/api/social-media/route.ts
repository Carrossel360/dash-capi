import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { buildSocialMediaSnapshot } from '@/lib/trafego-aggregate'

// Agregação extraída pra lib/trafego-aggregate.ts (buildSocialMediaSnapshot) — reutilizada
// também por lib/ai-reports.ts pra montar o snapshot do relatório de IA de Social Media,
// mesmo padrão já usado por buildMetaTrafficSnapshot/buildGoogleTrafficSnapshot.
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthPayload(req)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const period = req.nextUrl.searchParams.get('period') ?? '30d'
    const from = req.nextUrl.searchParams.get('from')
    const to = req.nextUrl.searchParams.get('to')

    const snapshot = await buildSocialMediaSnapshot(auth.workspaceId, period, from, to)
    return NextResponse.json(snapshot)
  } catch (err) {
    console.error('[/api/social-media]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
