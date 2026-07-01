import OpenAI from 'openai'

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return client
}

export interface GeneratedSlide {
  index: number
  title: string
  body: string
  imageSuggestion: string
}

export async function generateCarouselSlides(input: {
  topic: string
  slideCount: number
  tone?: string
}): Promise<GeneratedSlide[]> {
  const { topic, slideCount, tone } = input

  const completion = await getClient().chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Você é um estrategista de conteúdo para redes sociais especializado em carrosséis do Instagram. ' +
          'Gere textos curtos, diretos e persuasivos em português do Brasil. ' +
          'Sempre responda em JSON válido no formato { "slides": [{ "index": number, "title": string, "body": string, "imageSuggestion": string }] }. ' +
          'O primeiro slide é a capa (gancho forte), os do meio desenvolvem o tema, e o último é uma chamada para ação (CTA).',
      },
      {
        role: 'user',
        content:
          `Tópico: ${topic}\n` +
          `Quantidade de slides: ${slideCount}\n` +
          (tone ? `Tom de voz: ${tone}\n` : '') +
          `Gere exatamente ${slideCount} slides. Para cada um: "title" (frase de impacto, até 60 caracteres), ` +
          `"body" (texto de apoio, até 140 caracteres), e "imageSuggestion" (prompt curto em inglês descrevendo uma imagem/fundo que combine com o slide).`,
      },
    ],
  })

  const raw = completion.choices[0]?.message?.content
  if (!raw) throw new Error('Resposta vazia da OpenAI')

  const parsed = JSON.parse(raw) as { slides: GeneratedSlide[] }
  if (!Array.isArray(parsed.slides)) throw new Error('Formato inesperado na resposta da OpenAI')

  return parsed.slides
}

export async function generateSlideImage(prompt: string, size: '1024x1024' | '1024x1792'): Promise<string> {
  const response = await getClient().images.generate({
    model: 'dall-e-3',
    prompt,
    size,
    response_format: 'b64_json',
    n: 1,
  })

  const b64 = response.data?.[0]?.b64_json
  if (!b64) throw new Error('Resposta vazia da geração de imagem')

  return `data:image/png;base64,${b64}`
}
