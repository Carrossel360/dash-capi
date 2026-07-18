import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { syncWorkspaceLocalServices } from '@/lib/ads-sync'

// Botão "Atualizar agora" em Google Local — sincroniza só o workspace do usuário logado.
export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await prisma.workspace.findUnique({ where: { id: auth.workspaceId } })
  if (!workspace) return NextResponse.json({ error: 'Workspace não encontrado' }, { status: 404 })

  const result = await syncWorkspaceLocalServices(workspace)
  return NextResponse.json({ result })
}
