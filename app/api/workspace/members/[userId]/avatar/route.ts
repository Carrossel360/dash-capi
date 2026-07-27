import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { uploadMedia } from '@/lib/storage'

// Foto de perfil de um membro da equipe — aparece no avatar do canto superior direito
// (TopBar) de quem estiver logado com essa conta.
export async function PUT(req: NextRequest, { params }: { params: { userId: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isSelf = params.userId === auth.userId
  if (!isSelf && !['admin', 'manager'].includes(auth.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: auth.workspaceId, userId: params.userId } },
  })
  if (!membership) return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 })

  const { dataUrl } = await req.json()
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return NextResponse.json({ error: 'Imagem inválida' }, { status: 400 })
  }

  const url = await uploadMedia(dataUrl, auth.workspaceId)
  await prisma.user.update({ where: { id: params.userId }, data: { avatarUrl: url } })

  return NextResponse.json({ avatarUrl: url })
}
