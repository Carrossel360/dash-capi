import { prisma } from '@/lib/db'
import { sendMail } from '@/lib/mailer'

const EVENT_LABELS: Record<string, string> = {
  assigned: 'Tarefa atribuída',
  mentioned: 'Você foi mencionado',
  status_changed: 'Status da tarefa alterado',
  completed: 'Tarefa concluída',
  due_reminder: 'Lembrete de tarefa',
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]!)
}

export async function notifyTaskUser(input: {
  workspaceId: string
  userId: string
  taskId: string
  taskTitle: string
  eventType: string
  message: string
  actorName?: string
  dedupeKey?: string
}) {
  const delivery = { inAppCreated: false, emailSent: false, skipped: false }
  const preference = await prisma.taskNotificationPreference.findUnique({
    where: {
      workspaceId_userId_eventType: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        eventType: input.eventType,
      },
    },
  })
  const inApp = preference?.inApp ?? true
  const emailEnabled = preference?.email ?? true
  const sound = preference?.sound ?? true
  const link = `/tarefas?taskId=${encodeURIComponent(input.taskId)}`
  let notificationId: string | null = null

  if (input.dedupeKey) {
    const existing = await prisma.notification.findFirst({ where: { dedupeKey: input.dedupeKey, recipientUserId: input.userId } })
    if (existing) return { ...delivery, skipped: true }
  }

  if (inApp) {
    try {
      const notification = await prisma.notification.create({
        data: {
          workspaceId: input.workspaceId,
          recipientUserId: input.userId,
          type: `task_${input.eventType}`,
          severity: 'info',
          title: EVENT_LABELS[input.eventType] ?? 'Atualização de tarefa',
          message: input.message,
          link,
          dedupeKey: input.dedupeKey ?? `task:${input.taskId}:${input.eventType}:${input.userId}:${Date.now()}`,
          metadata: { taskId: input.taskId, eventType: input.eventType, sound },
        },
        select: { id: true },
      })
      notificationId = notification.id
      delivery.inAppCreated = true
    } catch (error) {
      console.error('[task-notification]', input.eventType, input.userId, error)
    }
  }

  if (!emailEnabled) return delivery
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true, name: true } })
  if (!user?.email) return delivery

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.carrossel360.com'
    await sendMail({
      to: user.email,
      subject: `${EVENT_LABELS[input.eventType] ?? 'Tarefa'}: ${input.taskTitle}`,
      html: `
        <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5">
          <h2 style="margin-bottom:8px">${escapeHtml(EVENT_LABELS[input.eventType] ?? 'Atualização de tarefa')}</h2>
          <p>${escapeHtml(input.message)}</p>
          <p><strong>${escapeHtml(input.taskTitle)}</strong></p>
          <a href="${appUrl}${link}" style="display:inline-block;padding:10px 16px;background:#6a11cb;color:white;text-decoration:none;border-radius:6px">Abrir tarefa</a>
        </div>`,
    })
    if (notificationId) {
      await prisma.notification.update({ where: { id: notificationId }, data: { emailSentAt: new Date() } })
    }
    delivery.emailSent = true
  } catch (error) {
    console.error('[task-email]', input.eventType, input.userId, error)
  }
  return delivery
}
