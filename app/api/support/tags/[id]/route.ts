import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.supportTag.deleteMany({
    where: { id: params.id, workspaceId: auth.workspaceId },
  })
  return new NextResponse(null, { status: 204 })
}
