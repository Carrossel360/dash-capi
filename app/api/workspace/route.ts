import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await prisma.workspace.findUnique({
    where: { id: auth.workspaceId },
    include: {
      stages: { orderBy: { order: 'asc' } },
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  return NextResponse.json(workspace)
}

export async function PATCH(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const {
    name, metaPixelId, metaAccessToken, metaAdAccountId, instagramAccountId,
    googleAdsCustomerId, googleAdsRefreshToken, telegramBotToken, telegramChatId,
  } = body

  const workspace = await prisma.workspace.update({
    where: { id: auth.workspaceId },
    data: {
      ...(name !== undefined && { name }),
      ...(metaPixelId !== undefined && { metaPixelId }),
      ...(metaAccessToken !== undefined && { metaAccessToken }),
      ...(metaAdAccountId !== undefined && { metaAdAccountId }),
      ...(instagramAccountId !== undefined && { instagramAccountId }),
      ...(googleAdsCustomerId !== undefined && { googleAdsCustomerId }),
      ...(googleAdsRefreshToken !== undefined && { googleAdsRefreshToken }),
      ...(telegramBotToken !== undefined && { telegramBotToken }),
      ...(telegramChatId !== undefined && { telegramChatId }),
    },
  })

  return NextResponse.json(workspace)
}
