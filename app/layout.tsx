import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sistema Orbital | Carrossel 360',
  description: 'Dashboard de rastreamento e CAPI para agências',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Apply saved theme before first paint to avoid flash — login e o wizard público de
            checkup de serviços ficam sempre no tema escuro (padrão da marca); a opção de tema
            claro só existe dentro do dashboard autenticado. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{if(location.pathname.startsWith('/login')||location.pathname.startsWith('/checkup-servicos')||location.pathname.startsWith('/esqueci-senha')||location.pathname.startsWith('/redefinir-senha'))return;var t=localStorage.getItem('carrossel360-theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}})();` }} />
      </head>
      <body className="mesh-bg min-h-screen">{children}</body>
    </html>
  )
}
