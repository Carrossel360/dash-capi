import type { GeneratedSite } from './types'

export const SITE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    files: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
    },
    summary: { type: 'string' },
  },
  required: ['files', 'summary'],
  additionalProperties: false,
} as const

export const SITE_SYSTEM_PROMPT =
  'Você é um desenvolvedor front-end sênior especializado em sites estáticos, escrevendo em português do Brasil. ' +
  'Gere um site completo, pronto pra publicar, a partir do briefing fornecido — sem framework, sem build step: ' +
  'HTML5 semântico e responsivo, CSS puro (sem dependência externa que exija internet em produção, exceto Google ' +
  'Fonts/ícones via <link> se fizer sentido) e JavaScript vanilla só onde agregar (menu mobile, formulário, ' +
  'animações leves). Sempre separe em arquivos distintos — nunca inline tudo num arquivo só: pelo menos ' +
  '"index.html", "style.css" e "script.js". Se o briefing pedir mais de uma página, gere arquivos .html ' +
  'adicionais (ex: "sobre.html", "contato.html") linkados entre si por <a href="..."> relativo. ' +
  'Se URLs de imagem forem fornecidas no briefing, use-as exatamente como estão em tags <img src="...">  — ' +
  'nunca invente ou troque a URL de uma imagem fornecida. Responda sempre em JSON válido no formato ' +
  '{ "files": [{ "path": string, "content": string }], "summary": string } — "files" é a lista completa de ' +
  'arquivos do site (sempre a versão final e completa, nunca um trecho parcial); "summary" é um resumo curto, ' +
  'em 1-2 frases, do que foi criado ou alterado nesta geração.'

export function buildInitialUserPrompt(input: {
  description: string
  characteristics?: string | null
  referenceImageUrls?: string[]
}): string {
  const parts = [`Descrição do site desejado:\n${input.description}`]
  if (input.characteristics) parts.push(`Características adicionais (estilo, cores, seções, tom):\n${input.characteristics}`)
  if (input.referenceImageUrls?.length) {
    parts.push(`Imagens fornecidas pelo cliente (use estas URLs exatamente como estão):\n${input.referenceImageUrls.join('\n')}`)
  }
  parts.push('Gere o site completo agora, seguindo o formato JSON pedido.')
  return parts.join('\n\n')
}

// N mensagens recentes (só texto, nunca os arquivos antigos) — mantém o histórico de
// chat barato mesmo em projetos grandes, mas ainda dá contexto do que já foi pedido.
export function buildIterationUserPrompt(input: {
  files: { path: string; content: string }[]
  recentMessages: { role: string; content: string }[]
  newInstruction: string
}): string {
  const history = input.recentMessages.map(m => `${m.role === 'user' ? 'Cliente' : 'Você'}: ${m.content}`).join('\n')
  return (
    `Arquivos atuais do site (JSON):\n${JSON.stringify(input.files)}\n\n` +
    (history ? `Histórico recente da conversa:\n${history}\n\n` : '') +
    `Nova instrução do cliente: ${input.newInstruction}\n\n` +
    'Aplique a alteração pedida e retorne a lista COMPLETA e atualizada de arquivos (reescreva por completo os ' +
    'arquivos afetados, não envie só o trecho alterado), seguindo o formato JSON pedido.'
  )
}

export function parseGeneratedSite(raw: string): GeneratedSite {
  const parsed = JSON.parse(raw) as Partial<GeneratedSite>
  if (
    !Array.isArray(parsed.files) ||
    !parsed.files.every(f => typeof f?.path === 'string' && typeof f?.content === 'string') ||
    typeof parsed.summary !== 'string'
  ) {
    throw new Error('Formato inesperado na resposta da IA')
  }
  return parsed as GeneratedSite
}
