// Curadoria de modelos por provedor — usada tanto em Relatórios com IA (Settings)
// quanto no Gerador de Sites. Não é uma lista fechada: a UI sempre oferece "Outro"
// com campo livre, já que a lista de modelos muda com frequência e o valor salvo é
// só uma string repassada direto pra API do provedor.
export const OPENAI_TEXT_MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o (legado)' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini (mais barato)' },
  { value: 'gpt-5.4', label: 'GPT-5.4' },
  { value: 'gpt-5.5', label: 'GPT-5.5' },
]

export const ANTHROPIC_TEXT_MODELS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (mais barato)' },
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 (padrão)' },
  { value: 'claude-opus-4-8', label: 'Claude Opus 4.8 (mais avançado)' },
]
