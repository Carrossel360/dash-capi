import { prisma } from '@/lib/db'

// Só a agência tem bot/chat configurados (findFirst where isAgency:true) — mesmo
// padrão já usado por uazapiAdminToken. Falha no Telegram nunca deve derrubar quem
// chamou (cron de monitoramento) — por isso sempre retorna boolean, nunca lança.
export async function sendTelegramAlert(text: string): Promise<boolean> {
  try {
    const agency = await prisma.workspace.findFirst({
      where: { isAgency: true },
      select: { telegramBotToken: true, telegramChatId: true },
    })
    if (!agency?.telegramBotToken || !agency?.telegramChatId) return false

    const res = await fetch(`https://api.telegram.org/bot${agency.telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: agency.telegramChatId, text, parse_mode: 'HTML' }),
    })
    return res.ok
  } catch (err) {
    console.error('[sendTelegramAlert]', err)
    return false
  }
}
