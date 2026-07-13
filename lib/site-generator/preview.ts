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
