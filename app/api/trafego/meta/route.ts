import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { buildMetaTrafficSnapshot } from '@/lib/trafego-aggregate'

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthPayload(req)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const period = req.nextUrl.searchParams.get('period') ?? 'all'
    const from = req.nextUrl.searchParams.get('from')
    const to = req.nextUrl.searchParams.get('to')

    const snapshot = await buildMetaTrafficSnapshot(auth.workspaceId, period, from, to)
    return NextResponse.json(snapshot)
  } catch (err) {
    console.error('[/api/trafego/meta]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
