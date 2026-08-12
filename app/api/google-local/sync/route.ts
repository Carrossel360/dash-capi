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
  if (!workspace.localServicesAccountId) {
    return NextResponse.json(
      { error: 'Conta de Local Services Ads não configurada para este cliente.' },
      { status: 400 }
    )
  }

  const result = await syncWorkspaceLocalServices(workspace)
  if (result === 'skip') {
    return NextResponse.json(
      { error: 'Sincronização pulada: credenciais do Google Ads não configuradas para este MCC.' },
      { status: 400 }
    )
  }
  if (typeof result === 'object' && 'error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ result })
}
