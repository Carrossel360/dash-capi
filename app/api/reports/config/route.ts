import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { REPORT_SERVICE } from '@/lib/ai-reports'

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const config = await prisma.reportConfig.findUnique({
    where: { workspaceId_service: { workspaceId: auth.workspaceId, service: REPORT_SERVICE } },
  })

  return NextResponse.json({
    config: config ?? {
      workspaceId: auth.workspaceId,
      service: REPORT_SERVICE,
      aiProvider: 'openai',
      aiModel: null,
      customPrompt: null,
      frequencyDays: 30,
      enabled: true,
      lastGeneratedAt: null,
    },
  })
}

export async function PATCH(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(auth.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { aiProvider, aiModel, customPrompt, frequencyDays, enabled } = await req.json()
  if (aiProvider && !['openai', 'anthropic'].includes(aiProvider)) {
    return NextResponse.json({ error: 'aiProvider inválido' }, { status: 400 })
  }

  const config = await prisma.reportConfig.upsert({
    where: { workspaceId_service: { workspaceId: auth.workspaceId, service: REPORT_SERVICE } },
    create: {
      workspaceId: auth.workspaceId,
      service: REPORT_SERVICE,
      aiProvider: aiProvider ?? 'openai',
      aiModel: aiModel ?? null,
      customPrompt: customPrompt ?? null,
      frequencyDays: frequencyDays ?? 30,
      enabled: enabled ?? true,
    },
    update: {
      ...(aiProvider !== undefined ? { aiProvider } : {}),
      ...(aiModel !== undefined ? { aiModel } : {}),
      ...(customPrompt !== undefined ? { customPrompt } : {}),
      ...(frequencyDays !== undefined ? { frequencyDays } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
    },
  })

  return NextResponse.json({ config })
}
