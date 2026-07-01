import type { CanvasElement } from './types'

export type LayoutKey = 'bold' | 'split' | 'storyteller' | 'magazine' | 'minimalist'

export const LAYOUTS: { key: LayoutKey; label: string }[] = [
  { key: 'bold', label: 'Bold' },
  { key: 'split', label: 'Split' },
  { key: 'storyteller', label: 'Storyteller' },
  { key: 'magazine', label: 'Magazine' },
  { key: 'minimalist', label: 'Minimalist' },
]

function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
}

type Builder = (title: string, body: string, width: number, height: number) => CanvasElement[]

const bold: Builder = (title, body, width, height) => [
  {
    id: uid(), type: 'text', x: width * 0.08, y: height * 0.35, width: width * 0.84, height: height * 0.3,
    rotation: 0, zIndex: 2, textContent: title, fontFamily: 'Inter', fontSize: Math.round(width * 0.09),
    fontWeight: '800', color: '#ffffff', textAlign: 'left',
  },
  {
    id: uid(), type: 'text', x: width * 0.08, y: height * 0.68, width: width * 0.84, height: height * 0.18,
    rotation: 0, zIndex: 2, textContent: body, fontFamily: 'Inter', fontSize: Math.round(width * 0.032),
    fontWeight: '400', color: '#e2e2e2', textAlign: 'left',
  },
]

const split: Builder = (title, body, width, height) => [
  {
    id: uid(), type: 'shape', x: 0, y: 0, width, height: height * 0.5,
    rotation: 0, zIndex: 1, shapeFill: '#1e1635', opacity: 1,
  },
  {
    id: uid(), type: 'text', x: width * 0.08, y: height * 0.55, width: width * 0.84, height: height * 0.2,
    rotation: 0, zIndex: 2, textContent: title, fontFamily: 'Inter', fontSize: Math.round(width * 0.07),
    fontWeight: '700', color: '#ffffff', textAlign: 'left',
  },
  {
    id: uid(), type: 'text', x: width * 0.08, y: height * 0.78, width: width * 0.84, height: height * 0.15,
    rotation: 0, zIndex: 2, textContent: body, fontFamily: 'Inter', fontSize: Math.round(width * 0.03),
    fontWeight: '400', color: '#cbd5e1', textAlign: 'left',
  },
]

const storyteller: Builder = (title, body, width, height) => [
  {
    id: uid(), type: 'text', x: width * 0.1, y: height * 0.1, width: width * 0.8, height: height * 0.2,
    rotation: 0, zIndex: 2, textContent: title, fontFamily: 'Inter', fontSize: Math.round(width * 0.065),
    fontWeight: '700', color: '#ffffff', textAlign: 'center',
  },
  {
    id: uid(), type: 'text', x: width * 0.1, y: height * 0.42, width: width * 0.8, height: height * 0.4,
    rotation: 0, zIndex: 2, textContent: body, fontFamily: 'Inter', fontSize: Math.round(width * 0.038),
    fontWeight: '400', color: '#e2e2e2', textAlign: 'center',
  },
]

const magazine: Builder = (title, body, width, height) => [
  {
    id: uid(), type: 'text', x: width * 0.08, y: height * 0.08, width: width * 0.5, height: height * 0.06,
    rotation: 0, zIndex: 2, textContent: 'DESTAQUE', fontFamily: 'Inter', fontSize: Math.round(width * 0.028),
    fontWeight: '700', color: '#F5A314', textAlign: 'left',
  },
  {
    id: uid(), type: 'text', x: width * 0.08, y: height * 0.16, width: width * 0.84, height: height * 0.35,
    rotation: 0, zIndex: 2, textContent: title, fontFamily: 'Inter', fontSize: Math.round(width * 0.08),
    fontWeight: '800', color: '#ffffff', textAlign: 'left',
  },
  {
    id: uid(), type: 'text', x: width * 0.08, y: height * 0.75, width: width * 0.84, height: height * 0.18,
    rotation: 0, zIndex: 2, textContent: body, fontFamily: 'Inter', fontSize: Math.round(width * 0.03),
    fontWeight: '400', color: '#cbd5e1', textAlign: 'left',
  },
]

const minimalist: Builder = (title, body, width, height) => [
  {
    id: uid(), type: 'text', x: width * 0.15, y: height * 0.42, width: width * 0.7, height: height * 0.16,
    rotation: 0, zIndex: 2, textContent: title, fontFamily: 'Inter', fontSize: Math.round(width * 0.055),
    fontWeight: '600', color: '#111111', textAlign: 'center',
  },
  {
    id: uid(), type: 'text', x: width * 0.2, y: height * 0.58, width: width * 0.6, height: height * 0.12,
    rotation: 0, zIndex: 2, textContent: body, fontFamily: 'Inter', fontSize: Math.round(width * 0.028),
    fontWeight: '400', color: '#444444', textAlign: 'center',
  },
]

const BUILDERS: Record<LayoutKey, Builder> = { bold, split, storyteller, magazine, minimalist }

const DEFAULT_BACKGROUND: Record<LayoutKey, { type: 'color'; value: string }> = {
  bold: { type: 'color', value: '#080612' },
  split: { type: 'color', value: '#0f0b1e' },
  storyteller: { type: 'color', value: '#1a1030' },
  magazine: { type: 'color', value: '#080612' },
  minimalist: { type: 'color', value: '#f5f5f5' },
}

export function buildSlideElements(layout: LayoutKey, title: string, body: string, width: number, height: number): CanvasElement[] {
  const builder = BUILDERS[layout] ?? bold
  return builder(title, body, width, height)
}

export function defaultBackground(layout: LayoutKey) {
  return DEFAULT_BACKGROUND[layout] ?? DEFAULT_BACKGROUND.bold
}
