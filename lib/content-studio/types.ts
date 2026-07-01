export interface CanvasElement {
  id: string
  type: 'text' | 'image' | 'shape'
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  // text
  textContent?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: string
  color?: string
  textAlign?: 'left' | 'center' | 'right'
  // image
  imageUrl?: string
  imageFit?: 'cover' | 'contain'
  // shape
  shapeFill?: string
  borderRadius?: number
  opacity?: number
}

export interface Slide {
  id: string
  layout: string
  imageSuggestion?: string
  background: {
    type: 'color' | 'gradient' | 'image'
    value: string
    overlay?: string
  }
  elements: CanvasElement[]
}

export type CarouselFormat = 'square' | 'story'

export const FORMAT_DIMENSIONS: Record<CarouselFormat, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
}
