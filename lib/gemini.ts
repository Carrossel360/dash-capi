import { GoogleGenAI } from '@google/genai'
import { getAiApiKey } from '@/lib/ai-keys'
import type { GeneratedSlide } from '@/lib/openai'

async function getClient(): Promise<GoogleGenAI> {
  return new GoogleGenAI({ apiKey: await getAiApiKey('gemini') })
}

// Mesmo formato de saída de generateCarouselSlides (lib/openai.ts) — o Estúdio de Criação
// trata o provedor como intercambiável, o componente que monta os slides não sabe (nem
// precisa saber) qual IA gerou o texto.
export async function generateCarouselSlidesGemini(input: {
  topic: string
  slideCount: number
  tone?: string
  model?: string
}): Promise<GeneratedSlide[]> {
  const { topic, slideCount, tone, model } = input

  const response = await (await getClient()).models.generateContent({
    model: model || 'gemini-2.5-flash',
    contents:
      `Tópico: ${topic}\n` +
      `Quantidade de slides: ${slideCount}\n` +
      (tone ? `Tom de voz: ${tone}\n` : '') +
      `Gere exatamente ${slideCount} slides. Para cada um: "title" (frase de impacto, até 60 caracteres), ` +
      `"body" (texto de apoio, até 140 caracteres), e "imageSuggestion" (prompt curto em inglês descrevendo uma imagem/fundo que combine com o slide).`,
    config: {
      responseMimeType: 'application/json',
      systemInstruction:
        'Você é um estrategista de conteúdo para redes sociais especializado em carrosséis do Instagram. ' +
        'Gere textos curtos, diretos e persuasivos em português do Brasil. ' +
        'Sempre responda em JSON válido no formato { "slides": [{ "index": number, "title": string, "body": string, "imageSuggestion": string }] }. ' +
        'O primeiro slide é a capa (gancho forte), os do meio desenvolvem o tema, e o último é uma chamada para ação (CTA).',
    },
  })

  const raw = response.text
  if (!raw) throw new Error('Resposta vazia do Gemini')

  const parsed = JSON.parse(raw) as { slides: GeneratedSlide[] }
  if (!Array.isArray(parsed.slides)) throw new Error('Formato inesperado na resposta do Gemini')

  return parsed.slides
}

// Copy de post/criativo (legenda pronta pra publicar) — mesma ideia de generateCarouselSlidesGemini,
// mas sem estrutura de slides: só o texto final + hashtags sugeridas.
export async function generatePostCopyGemini(input: {
  topic: string
  platform: string
  tone?: string
  model?: string
}): Promise<{ copy: string; hashtags: string[] }> {
  const { topic, platform, tone, model } = input

  const response = await (await getClient()).models.generateContent({
    model: model || 'gemini-2.5-flash',
    contents:
      `Tópico/produto: ${topic}\n` +
      `Plataforma: ${platform}\n` +
      (tone ? `Tom de voz: ${tone}\n` : '') +
      'Gere uma legenda pronta pra publicar (copy) e uma lista de 5 a 10 hashtags relevantes.',
    config: {
      responseMimeType: 'application/json',
      systemInstruction:
        'Você é um copywriter especializado em redes sociais, escrevendo em português do Brasil. ' +
        'Gere copy persuasivo, natural, sem parecer robótico, com quebras de linha quando fizer sentido. ' +
        'Sempre responda em JSON válido no formato { "copy": string, "hashtags": string[] } — hashtags sem o "#".',
    },
  })

  const raw = response.text
  if (!raw) throw new Error('Resposta vazia do Gemini')

  const parsed = JSON.parse(raw) as { copy: string; hashtags: string[] }
  if (typeof parsed.copy !== 'string' || !Array.isArray(parsed.hashtags)) {
    throw new Error('Formato inesperado na resposta do Gemini')
  }
  return parsed
}
