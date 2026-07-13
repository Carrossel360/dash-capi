import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { generateSite } from '@/lib/site-generator/generate'
import { SITE_SYSTEM_PROMPT, buildInitialUserPrompt } from '@/lib/site-generator/prompts'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const project = await prisma.siteProject.findFirst({
    where: { id: params.id, workspaceId: auth.workspaceId },
  })
  if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })

  await prisma.siteProject.update({ where: { id: project.id }, data: { status: 'generating' } })

  try {
    const userPrompt = buildInitialUserPrompt({
      description: project.description,
      characteristics: project.characteristics,
      referenceImageUrls: (project.referenceImageUrls as string[] | null) ?? undefined,
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
      prisma.siteMessage.create({
        data: { siteProjectId: project.id, role: 'user', content: project.description },
      }),
    ])
    await prisma.siteMessage.create({
      data: { siteProjectId: project.id, role: 'assistant', content: site.summary },
    })

    return NextResponse.json(updated)
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Erro ao gerar site'
    await prisma.siteProject.update({ where: { id: project.id }, data: { status: 'error', errorMessage } })
    console.error('[/api/site-generator/[id]/generate]', err)
    return NextResponse.json({ error: errorMessage }, { status: 502 })
  }
}
