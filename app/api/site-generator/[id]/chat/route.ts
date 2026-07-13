import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { generateSite } from '@/lib/site-generator/generate'
import { SITE_SYSTEM_PROMPT, buildIterationUserPrompt } from '@/lib/site-generator/prompts'
import type { SiteFile } from '@/lib/site-generator/types'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message } = await req.json()
  if (!message) return NextResponse.json({ error: 'message é obrigatório' }, { status: 400 })

  const project = await prisma.siteProject.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
  })
  if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })

  const files = project.files as SiteFile[] | null
  if (!files?.length) {
    return NextResponse.json({ error: 'Gere o site pelo menos uma vez antes de pedir ajustes' }, { status: 400 })
  }

  await prisma.siteProject.update({ where: { id: project.id }, data: { status: 'generating' } })

  try {
    const recentMessages = await prisma.siteMessage.findMany({
      where: { siteProjectId: project.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    const userPrompt = buildIterationUserPrompt({
      files,
      recentMessages: recentMessages.reverse(),
      newInstruction: message,
    })

    const site = await generateSite({
      systemPrompt: SITE_SYSTEM_PROMPT,
      userPrompt,
      aiProvider: project.aiProvider,
      aiModel: project.aiModel,
    })

    const [updated] = await Promise.all([
      prisma.siteProject.update({
        where: { id: project.id },
        data: { status: 'ready', files: site.files as unknown as Prisma.InputJsonValue, errorMessage: null },
      }),
      prisma.siteMessage.create({ data: { siteProjectId: project.id, role: 'user', content: message } }),
    ])
    const assistantMessage = await prisma.siteMessage.create({
      data: { siteProjectId: project.id, role: 'assistant', content: site.summary },
    })

    return NextResponse.json({ project: updated, assistantMessage })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Erro ao aplicar alteração'
    await prisma.siteProject.update({ where: { id: project.id }, data: { status: 'error', errorMessage } })
    console.error('[/api/site-generator/[id]/chat]', err)
    return NextResponse.json({ error: errorMessage }, { status: 502 })
  }
}
