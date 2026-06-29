import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: auth.userId },
    include: { workspace: true },
    orderBy: { workspace: { name: 'asc' } },
  })

  const workspaces = memberships.map(m => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    segment: m.workspace.segment,
    isAgency: m.workspace.isAgency,
    role: m.role,
  }))

  return NextResponse.json({ workspaces })
}
