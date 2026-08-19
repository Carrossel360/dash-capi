import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const spaceId = searchParams.get('spaceId')
  const folderId = searchParams.get('folderId')
  const projectId = searchParams.get('projectId')

  const fields = await prisma.customField.findMany({
    where: {
      workspaceId: auth.workspaceId,
      OR: [
        { spaceId: null, folderId: null, projectId: null },
        ...(spaceId ? [{ spaceId, folderId: null, projectId: null }] : []),
        ...(folderId ? [{ folderId, projectId: null }] : []),
        ...(projectId ? [{ projectId }] : []),
      ],
    },
    orderBy: { position: 'asc' },
  })
  return NextResponse.json({ fields })
}

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { spaceId, folderId, projectId, name, type, options, required } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const count = await prisma.customField.count({
    where: {
      workspaceId: auth.workspaceId,
      spaceId: spaceId ?? null,
      folderId: folderId ?? null,
      projectId: projectId ?? null,
    },
  })
  const field = await prisma.customField.create({
    data: {
      workspaceId: auth.workspaceId,
      spaceId: spaceId ?? null,
      folderId: folderId ?? null,
      projectId: projectId ?? null,
      name: name.trim(),
      type: type ?? 'text',
      options: options ?? null,
      required: required ?? false,
      position: count,
    },
  })
  return NextResponse.json({ field }, { status: 201 })
}
