import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { sendTelegramAlert } from '@/lib/telegram'
import { fetchMetaAccountStatus, fetchMetaCampaignStatuses } from '@/lib/meta-ads'
import { fetchGoogleAdsStatuses, isGoogleAdsConfigured, type GoogleAdsMcc } from '@/lib/google-ads'
import { fetchUazapiConnectionState } from '@/lib/uazapi'

export interface MonitorWorkspace {
  id: string
  name: string
  svcMetaAds: boolean
  svcGoogleAds: boolean
  metaAdAccountId: string | null
  googleAdsCustomerId: string | null
  currency: string | null
  uazapiUrl: string | null
  uazapiInstanceName: string | null
  uazapiToken: string | null
}

// Compara o valor observado contra o último salvo em MonitorStatus. Retorna null na
// primeira vez que essa chave é vista (bootstrap sem alarme — evita alerta em massa no
// dia em que a feature entra no ar, pra toda campanha já pausada por decisão do cliente)
// ou quando não mudou; só retorna {from,to} numa transição real.
async function diffStatus(workspaceId: string, key: string, label: string, status: string): Promise<{ from: string; to: string } | null> {
  const prev = await prisma.monitorStatus.findUnique({ where: { workspaceId_key: { workspaceId, key } } })
  if (!prev) {
    await prisma.monitorStatus.create({ data: { workspaceId, key, label, status } })
    return null
  }
  if (prev.status === status) return null
  await prisma.monitorStatus.update({ where: { id: prev.id }, data: { status, label, changedAt: new Date() } })
  return { from: prev.status, to: status }
}

// Só cria/reenvia se não existir uma Notification "open" com a mesma dedupeKey — sem
// isso, todo diff de transição criaria um alerta novo mesmo pro mesmo problema contínuo.
async function openNotification(params: {
  workspaceId: string
  type: string
  severity: 'critical' | 'warning'
  title: string
  message: string
  metadata?: Record<string, unknown>
  dedupeKey: string
}) {
  const existing = await prisma.notification.findFirst({ where: { dedupeKey: params.dedupeKey, status: 'open' } })
  if (existing) return

  const notification = await prisma.notification.create({
    data: {
      workspaceId: params.workspaceId,
      type: params.type,
      severity: params.severity,
      title: params.title,
      message: params.message,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
      dedupeKey: params.dedupeKey,
    },
  })

  const sent = await sendTelegramAlert(`⚠️ <b>${params.title}</b>\n${params.message}`)
  if (sent) {
    await prisma.notification.update({ where: { id: notification.id }, data: { telegramSentAt: new Date() } })
  }
}

async function resolveNotification(dedupeKey: string) {
  await prisma.notification.updateMany({
    where: { dedupeKey, status: 'open' },
    data: { status: 'resolved', resolvedAt: new Date() },
  })
}

export async function checkMetaAdsHealth(workspace: MonitorWorkspace): Promise<void> {
  const accessToken = process.env.META_ADS_ACCESS_TOKEN
  if (!workspace.svcMetaAds || !workspace.metaAdAccountId || !accessToken) return

  const account = await fetchMetaAccountStatus(workspace.metaAdAccountId, accessToken)
  const accountStatusLabel = account.accountStatus === 1 ? 'active' : 'blocked'
  const accountDedupeKey = `meta_account:${workspace.id}`
  const accountDiff = await diffStatus(workspace.id, 'meta_account', 'Conta Meta Ads', accountStatusLabel)
  if (accountDiff) {
    if (accountDiff.to === 'blocked') {
      await openNotification({
        workspaceId: workspace.id,
        type: 'meta_account_status',
        severity: 'critical',
        title: 'Conta de anúncio Meta bloqueada',
        message: `A conta de anúncio Meta Ads de ${workspace.name} não está mais ativa (status ${account.accountStatus}${account.disableReason ? `, motivo ${account.disableReason}` : ''}).`,
        metadata: { accountStatus: account.accountStatus, disableReason: account.disableReason },
        dedupeKey: accountDedupeKey,
      })
    } else {
      await resolveNotification(accountDedupeKey)
    }
  }

  const campaigns = await fetchMetaCampaignStatuses(workspace.metaAdAccountId, accessToken)
  for (const campaign of campaigns) {
    const dedupeKey = `meta_campaign:${campaign.id}`
    const diff = await diffStatus(workspace.id, dedupeKey, campaign.name, campaign.effectiveStatus)
    if (!diff) continue

    if (campaign.effectiveStatus !== 'ACTIVE') {
      await openNotification({
        workspaceId: workspace.id,
        type: 'campaign_paused',
        severity: 'warning',
        title: 'Campanha Meta Ads parou de rodar',
        message: `A campanha "${campaign.name}" (${workspace.name}) mudou para ${campaign.effectiveStatus}.`,
        metadata: { campaignId: campaign.id, effectiveStatus: campaign.effectiveStatus },
        dedupeKey,
      })
    } else {
      await resolveNotification(dedupeKey)
    }
  }
}

export async function checkGoogleAdsHealth(workspace: MonitorWorkspace): Promise<void> {
  if (!workspace.svcGoogleAds || !workspace.googleAdsCustomerId) return
  const mcc: GoogleAdsMcc = workspace.currency === 'USD' ? 'US' : 'BR'
  if (!isGoogleAdsConfigured(mcc)) return

  const { customerStatus, campaigns } = await fetchGoogleAdsStatuses({ mcc, customerId: workspace.googleAdsCustomerId })

  const accountDedupeKey = `google_account:${workspace.id}`
  const accountDiff = await diffStatus(workspace.id, 'google_account', 'Conta Google Ads', customerStatus)
  if (accountDiff) {
    if (customerStatus !== 'ENABLED') {
      await openNotification({
        workspaceId: workspace.id,
        type: 'google_account_status',
        severity: 'critical',
        title: 'Conta Google Ads suspensa ou cancelada',
        message: `A conta Google Ads de ${workspace.name} mudou para ${customerStatus}.`,
        metadata: { customerStatus },
        dedupeKey: accountDedupeKey,
      })
    } else {
      await resolveNotification(accountDedupeKey)
    }
  }

  for (const campaign of campaigns) {
    const dedupeKey = `google_campaign:${campaign.id}`
    const diff = await diffStatus(workspace.id, dedupeKey, campaign.name, campaign.status)
    if (!diff) continue

    if (campaign.status !== 'ENABLED') {
      await openNotification({
        workspaceId: workspace.id,
        type: 'campaign_paused',
        severity: 'warning',
        title: 'Campanha Google Ads parou de rodar',
        message: `A campanha "${campaign.name}" (${workspace.name}) mudou para ${campaign.status}.`,
        metadata: { campaignId: campaign.id, status: campaign.status },
        dedupeKey,
      })
    } else {
      await resolveNotification(dedupeKey)
    }
  }
}

export async function checkWhatsappHealth(workspace: MonitorWorkspace, adminToken: string): Promise<void> {
  if (!workspace.uazapiUrl || !workspace.uazapiInstanceName) return
  const instanceToken = workspace.uazapiToken ?? workspace.uazapiInstanceName

  let connected = false
  try {
    const result = await fetchUazapiConnectionState(workspace.uazapiUrl, instanceToken, adminToken)
    connected = result.kind === 'connected'
  } catch {
    connected = false
  }

  const dedupeKey = `whatsapp:${workspace.id}`
  const diff = await diffStatus(workspace.id, 'whatsapp', 'WhatsApp', connected ? 'connected' : 'disconnected')
  if (!diff) return

  if (!connected) {
    await openNotification({
      workspaceId: workspace.id,
      type: 'whatsapp_disconnected',
      severity: 'critical',
      title: 'WhatsApp desconectado',
      message: `A instância de WhatsApp de ${workspace.name} caiu — novos leads não estão sendo capturados no CRM.`,
      dedupeKey,
    })
  } else {
    await resolveNotification(dedupeKey)
  }
}
