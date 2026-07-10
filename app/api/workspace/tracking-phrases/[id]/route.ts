import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  await prisma.trackingPhrase.deleteMany({
    where: { id: params.id, workspaceId: auth.workspaceId },
  })
  return NextResponse.json({ ok: true })
}
