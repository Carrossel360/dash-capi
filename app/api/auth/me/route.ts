import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, name: true, email: true },
  })

  const workspace = await prisma.workspace.findUnique({
    where: { id: auth.workspaceId },
    select: { id: true, name: true, slug: true, plan: true },
  })

  return NextResponse.json({ user, workspace, role: auth.role })
}
