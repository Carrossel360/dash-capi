import type { Metadata } from 'next'

// Sobrescreve o title/description genéricos do app (que mencionam CAPI, jargão interno) pro
// preview de link (WhatsApp/Telegram/etc.) quando esse link público é compartilhado.
export const metadata: Metadata = {
  title: 'Sistema Orbital | Carrossel 360',
  description: 'Checkup de serviços contratados',
}

export default function CheckupServicosLayout({ children }: { children: React.ReactNode }) {
  return children
}
