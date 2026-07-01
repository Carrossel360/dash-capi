'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCorners,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowLeft, Plus, Trash2, Save, Download, Sparkles, Loader2, Type, ImageIcon,
  GripVertical, AlignLeft, AlignCenter, AlignRight, Bold, Wand2,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { useAuthStore } from '@/lib/store/auth'
import type { Slide, CanvasElement, CarouselFormat } from '@/lib/content-studio/types'
import { FORMAT_DIMENSIONS } from '@/lib/content-studio/types'
import { buildSlideElements, defaultBackground } from '@/lib/content-studio/layouts'

interface CarouselDoc {
  id: string
  title: string
  format: CarouselFormat
  slides: Slide[]
}

function SortableSlideThumb({ slide, index, active, onClick, onDelete }: {
  slide: Slide; index: number; active: boolean; onClick: () => void; onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const bg = slide.background.type === 'image' ? undefined : slide.background.value
  return (
    <div ref={setNodeRef} onClick={onClick}
      className="relative rounded-lg overflow-hidden border cursor-pointer group flex-shrink-0"
      style={{ ...style, borderColor: active ? '#F5A314' : '#1e1635', borderWidth: active ? 2 : 1 }}
    >
      <div {...attributes} {...listeners} className="absolute top-1 left-1 z-10 text-slate-400/80 cursor-grab">
        <GripVertical className="w-3 h-3" />
      </div>
      <div className="w-20 aspect-square flex items-center justify-center text-[10px] font-semibold text-white/70"
        style={{ background: bg ?? '#1e1635', backgroundImage: slide.background.type === 'image' ? `url(${slide.background.value})` : undefined, backgroundSize: 'cover' }}
      >
        {index + 1}
      </div>
      <button onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="absolute top-1 right-1 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}

export default function CarouselEditorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { token } = useAuthStore()

  const [carousel, setCarousel] = useState<CarouselDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [exportingZip, setExportingZip] = useState(false)
  const [generatingImg, setGeneratingImg] = useState(false)
  const [imgPrompt, setImgPrompt] = useState('')
  const [brandKit, setBrandKit] = useState<{ primaryColor?: string | null; logoUrl?: string | null }>({})

  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<any>(null)
  const fabricModRef = useRef<any>(null)
  const activeIndexRef = useRef(0)
  useEffect(() => { activeIndexRef.current = activeIndex }, [activeIndex])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => {
    if (!token || !id) return
    fetch(`/api/content-studio/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.id) setCarousel(d); else toast.error(d.error || 'Erro ao carregar carrossel') })
      .finally(() => setLoading(false))

    fetch('/api/workspace', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(w => setBrandKit({ primaryColor: w?.primaryColor, logoUrl: w?.logoUrl }))
      .catch(() => {})
  }, [token, id])

  const renderSlideOnCanvas = useCallback(async (canvas: any, fabricMod: any, slide: Slide, dims: { width: number; height: number }) => {
    canvas.clear()
    canvas.backgroundImage = undefined

    if (slide.background.type === 'image') {
      canvas.backgroundColor = '#000000'
      try {
        const img = await fabricMod.FabricImage.fromURL(slide.background.value, { crossOrigin: 'anonymous' })
        img.set({
          left: 0, top: 0, originX: 'left', originY: 'top', selectable: false, evented: false,
          scaleX: dims.width / (img.width || dims.width),
          scaleY: dims.height / (img.height || dims.height),
        })
        canvas.backgroundImage = img
      } catch { /* keep solid background on load failure */ }
    } else {
      canvas.backgroundColor = slide.background.value
    }

    const sorted = [...slide.elements].sort((a, b) => a.zIndex - b.zIndex)
    for (const el of sorted) {
      if (el.type === 'text') {
        const obj = new fabricMod.Textbox(el.textContent || '', {
          left: el.x, top: el.y, width: el.width, fontSize: el.fontSize || 40,
          fontFamily: el.fontFamily || 'Inter', fontWeight: el.fontWeight || '400',
          fill: el.color || '#ffffff', textAlign: el.textAlign || 'left', angle: el.rotation || 0,
          opacity: el.opacity ?? 1, originX: 'left', originY: 'top',
        })
        obj.elementId = el.id
        canvas.add(obj)
      } else if (el.type === 'shape') {
        const obj = new fabricMod.Rect({
          left: el.x, top: el.y, width: el.width, height: el.height,
          fill: el.shapeFill || '#333333', rx: el.borderRadius || 0, ry: el.borderRadius || 0,
          angle: el.rotation || 0, opacity: el.opacity ?? 1, originX: 'left', originY: 'top',
        })
        obj.elementId = el.id
        canvas.add(obj)
      } else if (el.type === 'image' && el.imageUrl) {
        try {
          const img = await fabricMod.FabricImage.fromURL(el.imageUrl, { crossOrigin: 'anonymous' })
          img.set({ left: el.x, top: el.y, angle: el.rotation || 0, opacity: el.opacity ?? 1, originX: 'left', originY: 'top' })
          img.scaleToWidth(el.width)
          img.elementId = el.id
          canvas.add(img)
        } catch { /* ignore */ }
      }
    }
    canvas.requestRenderAll()
  }, [])

  function syncElementFromObject(obj: any) {
    if (!obj?.elementId) return
    setCarousel(prev => {
      if (!prev) return prev
      const idx = activeIndexRef.current
      const slides = [...prev.slides]
      const slide = { ...slides[idx] }
      slide.elements = slide.elements.map(el => {
        if (el.id !== obj.elementId) return el
        const updated: CanvasElement = {
          ...el,
          x: Math.round(obj.left), y: Math.round(obj.top),
          width: Math.round((obj.width || el.width) * (obj.scaleX || 1)),
          height: Math.round((obj.height || el.height) * (obj.scaleY || 1)),
          rotation: Math.round(obj.angle || 0),
        }
        if (el.type === 'text' && typeof obj.text === 'string') updated.textContent = obj.text
        return updated
      })
      slides[idx] = slide
      return { ...prev, slides }
    })
  }

  // Init fabric canvas once the carousel is loaded
  useEffect(() => {
    if (!carousel || !canvasElRef.current) return
    let disposed = false
    ;(async () => {
      const fabricMod = fabricModRef.current ?? await import('fabric')
      fabricModRef.current = fabricMod
      if (disposed) return

      const dims = FORMAT_DIMENSIONS[carousel.format]
      const displayWidth = carousel.format === 'story' ? 360 : 480
      const scale = displayWidth / dims.width
      const displayHeight = Math.round(dims.height * scale)

      const canvas = new fabricMod.Canvas(canvasElRef.current!, { width: displayWidth, height: displayHeight })
      canvas.setZoom(scale)
      fabricRef.current = canvas

      canvas.on('selection:created', (e: any) => setSelectedId(e.selected?.[0]?.elementId ?? null))
      canvas.on('selection:updated', (e: any) => setSelectedId(e.selected?.[0]?.elementId ?? null))
      canvas.on('selection:cleared', () => setSelectedId(null))
      canvas.on('object:modified', (e: any) => syncElementFromObject(e.target))
      canvas.on('text:changed', (e: any) => syncElementFromObject(e.target))

      await renderSlideOnCanvas(canvas, fabricMod, carousel.slides[activeIndexRef.current], dims)
    })()

    return () => { disposed = true; fabricRef.current?.dispose(); fabricRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carousel?.id])

  // Re-render when switching slides
  useEffect(() => {
    if (!carousel || !fabricRef.current || !fabricModRef.current) return
    renderSlideOnCanvas(fabricRef.current, fabricModRef.current, carousel.slides[activeIndex], FORMAT_DIMENSIONS[carousel.format])
    setSelectedId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex])

  function applySlideUpdate(updater: (slide: Slide) => Slide) {
    setCarousel(prev => {
      if (!prev) return prev
      const idx = activeIndexRef.current
      const slides = [...prev.slides]
      slides[idx] = updater(slides[idx])
      if (fabricRef.current && fabricModRef.current) {
        renderSlideOnCanvas(fabricRef.current, fabricModRef.current, slides[idx], FORMAT_DIMENSIONS[prev.format])
      }
      return { ...prev, slides }
    })
    setSelectedId(null)
  }

  function updateSelectedElement(patch: Partial<CanvasElement>) {
    if (!selectedId) return
    const canvas = fabricRef.current
    const obj = canvas?.getObjects().find((o: any) => o.elementId === selectedId)
    if (obj) {
      const fabricPatch: Record<string, unknown> = {}
      if (patch.color !== undefined) fabricPatch.fill = patch.color
      if (patch.shapeFill !== undefined) fabricPatch.fill = patch.shapeFill
      if (patch.fontSize !== undefined) fabricPatch.fontSize = patch.fontSize
      if (patch.fontWeight !== undefined) fabricPatch.fontWeight = patch.fontWeight
      if (patch.textAlign !== undefined) fabricPatch.textAlign = patch.textAlign
      obj.set(fabricPatch)
      canvas.requestRenderAll()
    }
    setCarousel(prev => {
      if (!prev) return prev
      const idx = activeIndexRef.current
      const slides = [...prev.slides]
      const slide = { ...slides[idx] }
      slide.elements = slide.elements.map(el => el.id === selectedId ? { ...el, ...patch } : el)
      slides[idx] = slide
      return { ...prev, slides }
    })
  }

  function handleDeleteElement() {
    if (!selectedId) return
    applySlideUpdate(slide => ({ ...slide, elements: slide.elements.filter(el => el.id !== selectedId) }))
  }

  function handleAddText() {
    if (!carousel) return
    const { width, height } = FORMAT_DIMENSIONS[carousel.format]
    const newEl: CanvasElement = {
      id: crypto.randomUUID(), type: 'text', x: width * 0.2, y: height * 0.45,
      width: width * 0.6, height: height * 0.1, rotation: 0, zIndex: 10,
      textContent: 'Novo texto', fontFamily: 'Inter', fontSize: Math.round(width * 0.04),
      fontWeight: '600', color: '#ffffff', textAlign: 'center',
    }
    applySlideUpdate(slide => ({ ...slide, elements: [...slide.elements, newEl] }))
  }

  function handleAddSlide() {
    if (!carousel) return
    const { width, height } = FORMAT_DIMENSIONS[carousel.format]
    const newSlide: Slide = {
      id: crypto.randomUUID(), layout: 'minimalist',
      background: defaultBackground('minimalist'),
      elements: buildSlideElements('minimalist', 'Novo título', 'Descrição do slide', width, height),
    }
    setCarousel(prev => prev ? { ...prev, slides: [...prev.slides, newSlide] } : prev)
    setActiveIndex(carousel.slides.length)
  }

  function handleDeleteSlide(slideIndex: number) {
    if (!carousel || carousel.slides.length <= 1) { toast.error('O carrossel precisa de ao menos 1 slide'); return }
    setCarousel(prev => {
      if (!prev) return prev
      const slides = prev.slides.filter((_, i) => i !== slideIndex)
      return { ...prev, slides }
    })
    setActiveIndex(i => Math.max(0, Math.min(i, carousel.slides.length - 2)))
  }

  function handleSlideDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !carousel) return
    const oldIndex = carousel.slides.findIndex(s => s.id === active.id)
    const newIndex = carousel.slides.findIndex(s => s.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    setCarousel(prev => prev ? { ...prev, slides: arrayMove(prev.slides, oldIndex, newIndex) } : prev)
    setActiveIndex(newIndex)
  }

  async function handleGenerateBgImage() {
    if (!carousel) return
    const activeSlide = carousel.slides[activeIndex]
    const prompt = imgPrompt.trim() || activeSlide.imageSuggestion || carousel.title
    setGeneratingImg(true)
    try {
      const res = await fetch('/api/content-studio/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt, format: carousel.format }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar imagem')
      applySlideUpdate(slide => ({ ...slide, background: { type: 'image', value: data.url } }))
      toast.success('Imagem gerada com IA!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar imagem')
    } finally {
      setGeneratingImg(false)
    }
  }

  function handleUploadBgImage(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      applySlideUpdate(slide => ({ ...slide, background: { type: 'image', value: reader.result as string } }))
    }
    reader.readAsDataURL(file)
  }

  function handleRemoveBgImage() {
    applySlideUpdate(slide => ({ ...slide, background: { type: 'color', value: '#080612' } }))
  }

  function handleApplyBrandKit() {
    if (!brandKit.primaryColor) { toast.error('Defina a cor da marca nas configurações do workspace'); return }
    setCarousel(prev => {
      if (!prev) return prev
      const slides = prev.slides.map(slide =>
        slide.background.type === 'color' ? { ...slide, background: { type: 'color' as const, value: brandKit.primaryColor! } } : slide
      )
      if (fabricRef.current && fabricModRef.current) {
        renderSlideOnCanvas(fabricRef.current, fabricModRef.current, slides[activeIndexRef.current], FORMAT_DIMENSIONS[prev.format])
      }
      return { ...prev, slides }
    })
    toast.success('Brand Kit aplicado')
  }

  async function handleSave() {
    if (!carousel) return
    setSaving(true)
    try {
      const res = await fetch(`/api/content-studio/${carousel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: carousel.title, slides: carousel.slides }),
      })
      if (!res.ok) throw new Error('Erro ao salvar')
      toast.success('Carrossel salvo')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  function handleExportCurrentPng() {
    const canvas = fabricRef.current
    if (!canvas || !carousel) return
    const multiplier = FORMAT_DIMENSIONS[carousel.format].width / canvas.getWidth()
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier })
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${carousel.title}-slide-${activeIndex + 1}.png`
    a.click()
  }

  async function handleExportZip() {
    if (!carousel || !fabricModRef.current) return
    setExportingZip(true)
    try {
      const fabricMod = fabricModRef.current
      const dims = FORMAT_DIMENSIONS[carousel.format]
      const zip = new JSZip()

      for (let i = 0; i < carousel.slides.length; i++) {
        const offCanvasEl = document.createElement('canvas')
        const staticCanvas = new fabricMod.StaticCanvas(offCanvasEl, { width: dims.width, height: dims.height })
        await renderSlideOnCanvas(staticCanvas, fabricMod, carousel.slides[i], dims)
        const dataUrl = staticCanvas.toDataURL({ format: 'png', multiplier: 1 })
        zip.file(`slide-${i + 1}.png`, dataUrl.split(',')[1], { base64: true })
        staticCanvas.dispose()
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      saveAs(blob, `${carousel.title}.zip`)
    } catch (err) {
      toast.error('Erro ao exportar ZIP')
      console.error(err)
    } finally {
      setExportingZip(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /></div>
  }
  if (!carousel) {
    return <div className="flex items-center justify-center h-full text-slate-500 text-sm">Carrossel não encontrado</div>
  }

  const activeSlide = carousel.slides[activeIndex]
  const selectedElement = activeSlide?.elements.find(el => el.id === selectedId) ?? null

  return (
    <div className="flex flex-col h-full">
      <Toaster position="top-right" />

      {/* Toolbar */}
      <header className="h-13 border-b border-[#1e1635] bg-[#0a0818] flex items-center justify-between px-4 flex-shrink-0 z-30" style={{ minHeight: 52 }}>
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => router.push('/content-studio')} className="text-slate-400 hover:text-white transition-colors flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <input
            value={carousel.title}
            onChange={e => setCarousel(prev => prev ? { ...prev, title: e.target.value } : prev)}
            className="text-sm font-semibold text-white bg-transparent focus:outline-none focus:bg-[#1a1230] rounded px-2 py-1 min-w-0 truncate"
          />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={handleApplyBrandKit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 border border-[#2d2550] hover:border-[#6a11cb] transition-all">
            <Wand2 className="w-3.5 h-3.5" /> Aplicar Brand Kit
          </button>
          <button onClick={handleExportCurrentPng}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 border border-[#2d2550] hover:border-[#6a11cb] transition-all">
            <Download className="w-3.5 h-3.5" /> PNG
          </button>
          <button onClick={handleExportZip} disabled={exportingZip}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 border border-[#2d2550] hover:border-[#6a11cb] transition-all disabled:opacity-60">
            {exportingZip ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} ZIP
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: slide list */}
        <aside className="w-32 border-r border-[#1e1635] bg-[#0a0818] overflow-y-auto p-2 flex flex-col gap-2">
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleSlideDragEnd}>
            <SortableContext items={carousel.slides.map(s => s.id)} strategy={verticalListSortingStrategy}>
              {carousel.slides.map((slide, i) => (
                <SortableSlideThumb key={slide.id} slide={slide} index={i} active={i === activeIndex}
                  onClick={() => setActiveIndex(i)} onDelete={() => handleDeleteSlide(i)} />
              ))}
            </SortableContext>
          </DndContext>
          <button onClick={handleAddSlide}
            className="w-20 aspect-square rounded-lg border border-dashed border-[#2d2550] flex items-center justify-center text-slate-500 hover:text-[#F5A314] hover:border-[#F5A314] transition-all">
            <Plus className="w-4 h-4" />
          </button>
        </aside>

        {/* Center: canvas */}
        <main className="flex-1 flex flex-col items-center justify-center bg-[#050308] overflow-auto p-6 gap-3">
          <canvas ref={canvasElRef} />
          <div className="flex items-center gap-2">
            <button onClick={handleAddText}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 border border-[#2d2550] hover:border-[#6a11cb] transition-all">
              <Type className="w-3.5 h-3.5" /> Texto
            </button>
            {selectedElement && (
              <button onClick={handleDeleteElement}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-400 border border-red-900/40 hover:border-red-500 transition-all">
                <Trash2 className="w-3.5 h-3.5" /> Excluir elemento
              </button>
            )}
          </div>
        </main>

        {/* Right: properties */}
        <aside className="w-64 border-l border-[#1e1635] bg-[#0a0818] overflow-y-auto p-4 flex flex-col gap-4">
          {selectedElement?.type === 'text' && (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold text-slate-400">Texto</p>
              <textarea
                value={selectedElement.textContent ?? ''}
                onChange={e => updateSelectedElement({ textContent: e.target.value })}
                rows={3}
                className="w-full px-2.5 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] resize-none"
              />
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">Tamanho da fonte</label>
                <input type="range" min={16} max={160} value={selectedElement.fontSize ?? 40}
                  onChange={e => updateSelectedElement({ fontSize: Number(e.target.value) })} className="w-full" />
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={selectedElement.color ?? '#ffffff'}
                  onChange={e => updateSelectedElement({ color: e.target.value })}
                  className="w-8 h-8 rounded-lg border border-[#2d2550] bg-transparent cursor-pointer" />
                <button onClick={() => updateSelectedElement({ fontWeight: selectedElement.fontWeight === '700' ? '400' : '700' })}
                  className="w-8 h-8 rounded-lg border flex items-center justify-center transition-all"
                  style={{ borderColor: selectedElement.fontWeight === '700' ? '#F5A314' : '#2d2550', color: selectedElement.fontWeight === '700' ? '#F5A314' : '#94a3b8' }}>
                  <Bold className="w-3.5 h-3.5" />
                </button>
                {(['left', 'center', 'right'] as const).map(align => {
                  const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight
                  return (
                    <button key={align} onClick={() => updateSelectedElement({ textAlign: align })}
                      className="w-8 h-8 rounded-lg border flex items-center justify-center transition-all"
                      style={{ borderColor: selectedElement.textAlign === align ? '#F5A314' : '#2d2550', color: selectedElement.textAlign === align ? '#F5A314' : '#94a3b8' }}>
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {selectedElement?.type === 'shape' && (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold text-slate-400">Forma</p>
              <input type="color" value={selectedElement.shapeFill ?? '#333333'}
                onChange={e => updateSelectedElement({ shapeFill: e.target.value })}
                className="w-8 h-8 rounded-lg border border-[#2d2550] bg-transparent cursor-pointer" />
            </div>
          )}

          {!selectedElement && activeSlide && (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold text-slate-400">Fundo do slide</p>
              {activeSlide.background.type === 'image' ? (
                <>
                  <div className="w-full aspect-square rounded-lg overflow-hidden border border-[#2d2550]" style={{ backgroundImage: `url(${activeSlide.background.value})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  <button onClick={handleRemoveBgImage}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors">Remover imagem de fundo</button>
                </>
              ) : (
                <input type="color" value={activeSlide.background.value}
                  onChange={e => applySlideUpdate(slide => ({ ...slide, background: { type: 'color', value: e.target.value } }))}
                  className="w-8 h-8 rounded-lg border border-[#2d2550] bg-transparent cursor-pointer" />
              )}

              <div className="border-t border-[#1e1635] pt-3 flex flex-col gap-2">
                <label className="text-[10px] text-slate-500 block">Gerar imagem de fundo com IA</label>
                <textarea
                  value={imgPrompt}
                  onChange={e => setImgPrompt(e.target.value)}
                  placeholder={activeSlide.imageSuggestion || 'Descreva a imagem desejada...'}
                  rows={2}
                  className="w-full px-2.5 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] resize-none"
                />
                <button onClick={handleGenerateBgImage} disabled={generatingImg}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}>
                  {generatingImg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Gerar com IA
                </button>
                <label className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 border border-[#2d2550] hover:border-[#6a11cb] transition-all cursor-pointer">
                  <ImageIcon className="w-3.5 h-3.5" /> Enviar imagem
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadBgImage(f) }} />
                </label>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
