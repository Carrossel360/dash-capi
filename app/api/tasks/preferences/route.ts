import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { prisma } from '@/lib/db'

const EVENTS = ['assigned', 'mentioned', 'status_changed', 'completed', 'due_reminder']

export async function GET(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const saved = await prisma.taskNotificationPreference.findMany({ where: { workspaceId: auth.workspaceId, userId: auth.userId } })
  return NextResponse.json({
    preferences: EVENTS.map(eventType => saved.find(item => item.eventType === eventType) ?? { eventType, inApp: true, email: true, sound: true }),
  })
}
export async function PUT(req: NextRequest) {
  const auth = await getAuthPayload(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventType, inApp, email, sound } = await req.json()
  if (!EVENTS.includes(eventType)) return NextResponse.json({ error: 'Invalid event' }, { status: 400 })
  const preference = await prisma.taskNotificationPreference.upsert({
    where: { workspaceId_userId_eventType: { workspaceId: auth.workspaceId, userId: auth.userId, eventType } },
    create: { workspaceId: auth.workspaceId, userId: auth.userId, eventType, inApp: inApp ?? true, email: email ?? true, sound: sound ?? true },
    update: { ...(inApp !== undefined ? { inApp } : {}), ...(email !== undefined ? { email } : {}), ...(sound !== undefined ? { sound } : {}) },
  })
  return NextResponse.json({ preference })
}
