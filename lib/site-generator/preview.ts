import type { SiteFile } from './types'

// Combina os arquivos gerados num único documento HTML autocontido, pro srcDoc do
// iframe de preview — sem precisar servir os arquivos separadamente. Se houver mais
// de uma página .html, a UI escolhe o entryPath e troca a página exibida.
export function buildPreviewDocument(files: SiteFile[], entryPath?: string): string {
  const entry = (entryPath && files.find(f => f.path === entryPath))
    ?? files.find(f => f.path === 'index.html')
    ?? files.find(f => f.path.endsWith('.html'))

  if (!entry) return '<html><body>Nenhum arquivo HTML encontrado.</body></html>'

  let html = entry.content

  const cssFiles = files.filter(f => f.path.endsWith('.css'))
  if (cssFiles.length) {
    const styleTag = cssFiles.map(f => `<style>${f.content}</style>`).join('\n')
    html = html.includes('</head>') ? html.replace('</head>', `${styleTag}</head>`) : styleTag + html
  }

  const jsFiles = files.filter(f => f.path.endsWith('.js'))
  if (jsFiles.length) {
    const scriptTag = jsFiles.map(f => `<script>${f.content}</script>`).join('\n')
    html = html.includes('</body>') ? html.replace('</body>', `${scriptTag}</body>`) : html + scriptTag
  }

  return html
}

export function listHtmlPages(files: SiteFile[]): string[] {
  return files.filter(f => f.path.endsWith('.html')).map(f => f.path)
}

// Miniatura dos cards de Site (Tarefas > Criação): mesmo documento do preview completo,
// mas força visível qualquer elemento escondido por padrões de "reveal ao rolar"
// (opacity:0 até um IntersectionObserver marcar como visível) — a miniatura roda sem JS
// (allow-same-origin sem allow-scripts, por segurança/performance numa grade com vários
// cards), então esse conteúdo ficaria em branco. Também esconde tudo depois do primeiro
// filho de <main> e o <footer>, pra cortar exatamente na seção de topo (hero) em vez de
// uma fatia arbitrária do documento inteiro, que costuma ser bem mais alto que ela.
export function buildThumbnailPreviewDocument(files: SiteFile[]): string {
  const html = buildPreviewDocument(files)
  const overrideCss = `<style>
    [class*="reveal"], [class*="fade-in"], [class*="fadein"], [class*="animate-"],
    [class*="aos-"], [data-aos], [class*="wow"] {
      opacity: 1 !important; transform: none !important; transition: none !important; animation: none !important;
    }
    main > :not(:first-child), footer, .footer { display: none !important; }
  </style>`
  return html.includes('</head>') ? html.replace('</head>', `${overrideCss}</head>`) : overrideCss + html
}
