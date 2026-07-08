import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'
import crypto from 'crypto'

function hashPassword(p: string) {
  return crypto.createHash('sha256').update(p).digest('hex')
}

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Retorna todos os workspaces que o usuário tem acesso (exceto a própria agência)
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: auth.userId },
    include: {
      workspace: {
        include: {
          members: { include: { user: { select: { id: true, name: true, email: true } } } },
          _count: { select: { leads: true, capiEvents: true } },
        },
      },
    },
    orderBy: { workspace: { name: 'asc' } },
  })

  const clients = memberships
    .filter(m => !m.workspace.isAgency)
    .map(m => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      segment: m.workspace.segment,
      plan: m.workspace.plan,
      metaPixelId: m.workspace.metaPixelId,
      metaAccessToken: m.workspace.metaAccessToken ? '••••••••' : null,
      googleAdsCustomerId: m.workspace.googleAdsCustomerId,
      createdAt: m.workspace.createdAt,
      role: m.role,
      leadsCount: m.workspace._count.leads,
      eventsCount: m.workspace._count.capiEvents,
      members: m.workspace.members.map(mb => ({
        id: mb.id, role: mb.role,
        user: mb.user,
      })),
    }))

  return NextResponse.json({ clients })
}

export async function POST(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    name, segment, plan, loginEmail, loginPassword,
    currency, svcMetaAds, svcGoogleAds, svcSocialMedia, svcGoogleBusiness, svcGoogleLocal,
  } = await req.json()
  if (!name || !loginEmail || !loginPassword) {
    return NextResponse.json({ error: 'name, loginEmail e loginPassword são obrigatórios' }, { status: 400 })
  }

  const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now()

  const workspace = await prisma.workspace.create({
    data: {
      name, slug, segment, plan: plan ?? 'starter',
      currency: currency ?? 'BRL',
      svcMetaAds: svcMetaAds ?? false,
      svcGoogleAds: svcGoogleAds ?? false,
      svcSocialMedia: svcSocialMedia ?? false,
      svcGoogleBusiness: svcGoogleBusiness ?? false,
      svcGoogleLocal: svcGoogleLocal ?? false,
    },
  })

  // Cria usuário login do cliente
  const clientUser = await prisma.user.upsert({
    where: { email: loginEmail },
    update: { name, passwordHash: hashPassword(loginPassword) },
    create: { email: loginEmail, name, passwordHash: hashPassword(loginPassword) },
  })

  // Adiciona cliente como viewer do próprio workspace
  await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: clientUser.id, role: 'viewer' },
  })

  // Adiciona o admin (agência) como admin do workspace do cliente
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: auth.userId } },
    update: { role: 'admin' },
    create: { workspaceId: workspace.id, userId: auth.userId, role: 'admin' },
  })

  // Membros com acesso "Agência" (acesso total) ganham acesso automático a clientes novos também
  const agencyMembers = await prisma.workspaceMember.findMany({
    where: { workspace: { isAgency: true }, userId: { not: auth.userId } },
  })
  for (const am of agencyMembers) {
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: am.userId } },
      update: { role: am.role },
      create: { workspaceId: workspace.id, userId: am.userId, role: am.role },
    })
  }

  // Cria estágios padrão do pipeline
  const stages = [
    { name: 'Novo Lead', color: '#6a11cb', order: 0, triggerCapiEvent: 'none' as const },
    { name: 'Em Contato', color: '#2575fc', order: 1, triggerCapiEvent: 'lead' as const },
    { name: 'Proposta', color: '#f59e0b', order: 2, triggerCapiEvent: 'none' as const },
    { name: 'Venda Realizada', color: '#10b981', order: 3, triggerCapiEvent: 'purchase' as const },
    { name: 'Perdido', color: '#ef4444', order: 4, triggerCapiEvent: 'none' as const },
  ]
  for (const s of stages) {
    await prisma.pipelineStage.create({ data: { workspaceId: workspace.id, ...s } })
  }

  return NextResponse.json({ workspace, loginEmail }, { status: 201 })
}
