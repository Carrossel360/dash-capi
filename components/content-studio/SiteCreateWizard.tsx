'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Globe, Loader2, X, ChevronLeft, ChevronRight, Upload, Trash2, Wand2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/store/auth'
import { OPENAI_TEXT_MODELS, ANTHROPIC_TEXT_MODELS } from '@/lib/ai-models'

interface UploadedImage {
  name: string
  url: string
  uploading: boolean
}

export default function SiteCreateWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token } = useAuthStore()
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [generating, setGenerating] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [characteristics, setCharacteristics] = useState('')
  const [images, setImages] = useState<UploadedImage[]>([])

  const [aiProvider, setAiProvider] = useState('openai')
  const [aiModel, setAiModel] = useState('')
  const [aiModelCustom, setAiModelCustom] = useState(false)

  function reset() {
    setStep(1); setTitle(''); setDescription(''); setCharacteristics(''); setImages([])
    setAiProvider('openai'); setAiModel(''); setAiModelCustom(false)
  }

  function handleClose() {
    if (generating) return
    reset()
    onClose()
  }

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList?.length) return
    const files = Array.from(fileList)
    const placeholders: UploadedImage[] = files.map(f => ({ name: f.name, url: '', uploading: true }))
    setImages(prev => [...prev, ...placeholders])

    for (const file of files) {
      try {
        const base64DataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        const res = await fetch('/api/site-generator/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ base64DataUrl, mimeType: file.type }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Erro ao enviar imagem')
        setImages(prev => prev.map(img => img.name === file.name && img.uploading ? { name: file.name, url: data.url, uploading: false } : img))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Erro ao enviar ${file.name}`)
        setImages(prev => prev.filter(img => !(img.name === file.name && img.uploading)))
      }
    }
  }

  function removeImage(url: string) {
    setImages(prev => prev.filter(img => img.url !== url))
  }

  async function handleGenerate() {
    if (!title.trim() || !description.trim()) { toast.error('Título e descrição são obrigatórios'); return }
    setGenerating(true)
    try {
      const createRes = await fetch('/api/site-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title,
          description,
          characteristics: characteristics || undefined,
          referenceImageUrls: images.filter(img => !img.uploading).map(img => img.url),
          aiProvider,
          aiModel: aiModel || undefined,
        }),
      })
      const project = await createRes.json()
      if (!createRes.ok) throw new Error(project.error || 'Erro ao criar projeto')

      const genRes = await fetch(`/api/site-generator/${project.id}/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const genData = await genRes.json()
      if (!genRes.ok) throw new Error(genData.error || 'Erro ao gerar site')

      router.push(`/content-studio/sites/${project.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar site')
    } finally {
      setGenerating(false)
    }
  }

  if (!open) return null

  const currentModels = aiProvider === 'openai' ? OPENAI_TEXT_MODELS : ANTHROPIC_TEXT_MODELS
  const hasUploading = images.some(img => img.uploading)

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative rounded-2xl p-6 w-full max-w-lg shadow-2xl z-10"
        style={{ background: '#0d0a1f', border: '1px solid rgba(106,17,203,0.3)' }}
      >
        <button onClick={handleClose} className="absolute top-3 right-3 text-slate-500 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
        <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
          <Globe className="w-4 h-4" style={{ color: '#F5A314' }} />
          Novo Site com IA
        </h3>
        <p className="text-xs text-slate-500 mb-4">Passo {step} de 3</p>

        {step === 1 && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Título do projeto</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ex: Site institucional Clínica Bela Pele"
                className="w-full px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Descreva em detalhes o site que você quer</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Ex: Landing page para uma clínica de estética, com seção hero, serviços oferecidos, depoimentos e rodapé com WhatsApp..."
                rows={6}
                className="w-full px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] transition-colors resize-none"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Imagens de referência (opcional)</label>
              <label className="flex items-center justify-center gap-2 w-full py-3 rounded-lg border border-dashed border-[#2d2550] text-xs text-slate-400 hover:border-[#6a11cb] hover:text-white transition-colors cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                Selecionar imagens
                <input type="file" accept="image/*" multiple className="hidden" onChange={e => handleFilesSelected(e.target.files)} />
              </label>
              {images.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {images.map(img => (
                    <div key={img.name} className="relative rounded-lg overflow-hidden aspect-square" style={{ background: '#1a1230' }}>
                      {img.uploading ? (
                        <div className="w-full h-full flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-slate-500" /></div>
                      ) : (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                          <button onClick={() => removeImage(img.url)}
                            className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/60 text-white hover:bg-red-500/80 transition-colors">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Características adicionais (opcional)</label>
              <textarea
                value={characteristics}
                onChange={e => setCharacteristics(e.target.value)}
                placeholder="Ex: cores rosa e branco, estilo clean e moderno, incluir botão de agendamento"
                rows={4}
                className="w-full px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] transition-colors resize-none"
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Provedor de IA</label>
              <select
                value={aiProvider}
                onChange={e => { setAiProvider(e.target.value); setAiModel(''); setAiModelCustom(false) }}
                className="w-full px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-colors"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Claude (Anthropic)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Modelo (opcional)</label>
              <select
                value={aiModelCustom ? 'custom' : aiModel}
                onChange={e => {
                  if (e.target.value === 'custom') { setAiModelCustom(true); setAiModel('') }
                  else { setAiModelCustom(false); setAiModel(e.target.value) }
                }}
                className="w-full px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white focus:outline-none focus:border-[#6a11cb] transition-colors"
              >
                <option value="">Padrão do provedor</option>
                {currentModels.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                <option value="custom">Outro (digitar manualmente)</option>
              </select>
              {aiModelCustom && (
                <input
                  type="text" value={aiModel} onChange={e => setAiModel(e.target.value)}
                  placeholder="ex: gpt-5.6-terra"
                  className="w-full mt-2 px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] transition-colors"
                />
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-5">
          <button
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1 || generating}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-colors disabled:opacity-0"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Voltar
          </button>

          {step < 3 ? (
            <button
              onClick={() => {
                if (step === 1 && (!title.trim() || !description.trim())) { toast.error('Preencha título e descrição'); return }
                setStep(s => Math.min(3, s + 1))
              }}
              className="flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}
            >
              Próximo <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={generating || hasUploading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              {generating ? 'Gerando site...' : 'Gerar site com IA'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
