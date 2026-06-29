'use client'
import { useCallback, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  Handle, Position, NodeProps, Connection,
  BackgroundVariant, MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ArrowLeft, Save, Play, BarChart2, Zap, MessageSquare, Phone, Mail, Clock, GitBranch, Tag, Target, X, ChevronRight } from 'lucide-react'
import { useRouter, useParams } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'

// ─── Node configs ──────────────────────────────────────────────────────────────
const NODE_TYPES_CONFIG = {
  trigger:   { label: 'GATILHO',   color: '#F5A314', icon: Zap,         bg: 'rgba(245,163,20,0.12)' },
  whatsapp:  { label: 'WHATSAPP',  color: '#25d366', icon: MessageSquare, bg: 'rgba(37,211,102,0.12)' },
  sms:       { label: 'SMS',       color: '#2575fc', icon: Phone,        bg: 'rgba(37,117,252,0.12)' },
  email:     { label: 'EMAIL',     color: '#8b5cf6', icon: Mail,         bg: 'rgba(139,92,246,0.12)' },
  delay:     { label: 'AGUARDAR', color: '#f59e0b', icon: Clock,        bg: 'rgba(245,158,11,0.12)' },
  condition: { label: 'CONDIÇÃO',  color: '#ec4899', icon: GitBranch,    bg: 'rgba(236,72,153,0.12)' },
  tag:       { label: 'ADICIONAR TAG', color: '#06b6d4', icon: Tag,     bg: 'rgba(6,182,212,0.12)' },
  goal:      { label: 'META',      color: '#10b981', icon: Target,      bg: 'rgba(16,185,129,0.12)' },
}

// ─── Custom Node ───────────────────────────────────────────────────────────────
function FlowNode({ data, selected, type }: NodeProps & { type: string }) {
  const cfg = NODE_TYPES_CONFIG[type as keyof typeof NODE_TYPES_CONFIG] ?? NODE_TYPES_CONFIG.trigger
  const Icon = cfg.icon
  const isCondition = type === 'condition'

  return (
    <div
      className="relative rounded-xl overflow-hidden min-w-[200px] max-w-[240px] cursor-pointer transition-all"
      style={{
        background: '#0f0b1e',
        border: `1.5px solid ${selected ? cfg.color : `${cfg.color}40`}`,
        boxShadow: selected ? `0 0 20px ${cfg.color}40, 0 4px 20px rgba(0,0,0,0.5)` : '0 4px 16px rgba(0,0,0,0.4)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: cfg.bg }}>
        <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: cfg.color }} />
        <span className="text-[10px] font-bold tracking-widest" style={{ color: cfg.color }}>{cfg.label}</span>
      </div>

      {/* Content */}
      <div className="px-3 py-2.5">
        {type === 'trigger' && (
          <>
            <p className="text-xs font-semibold text-white">{data.triggerType as string || 'Novo Lead adicionado'}</p>
            <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
              Gatilho ativo
            </p>
          </>
        )}
        {(type === 'whatsapp' || type === 'sms') && (
          <>
            <p className="text-xs text-slate-300 line-clamp-2">{data.message as string || 'Mensagem aqui...'}</p>
            {data.buttonText && (
              <div className="mt-2 px-3 py-1 rounded-full border text-[10px] text-center font-medium" style={{ borderColor: cfg.color, color: cfg.color }}>
                {data.buttonText as string}
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <span className="text-[10px] text-slate-500">API Oficial Meta</span>
              {Boolean(data.template) && <span className="text-[10px] text-emerald-400">· Template aprovado</span>}
            </div>
          </>
        )}
        {type === 'email' && (
          <>
            <p className="text-xs font-medium text-white flex items-center gap-1">
              {data.subject as string || 'Assunto do email'}
              {data.emoji ? <span>{String(data.emoji)}</span> : null}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{data.preview as string || 'Preview do email...'}</p>
            <div className="flex gap-2 mt-2">
              <span className="text-[10px] text-slate-500">via Resend</span>
              {data.template ? <span className="text-[10px] text-[#8b5cf6]">· {String(data.template)}</span> : null}
            </div>
          </>
        )}
        {type === 'delay' && (
          <p className="text-sm font-bold text-white">{data.amount as string || '1'} {data.unit as string || 'hora'}</p>
        )}
        {type === 'condition' && (
          <>
            <p className="text-xs text-slate-300 font-medium">{data.condition as string || 'Condição'}</p>
            <div className="flex gap-2 mt-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-400 font-medium">Sim ↓</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-400/15 text-red-400 font-medium">Não ↓</span>
            </div>
          </>
        )}
        {type === 'tag' && (
          <div className="flex flex-wrap gap-1">
            {((data.tags as string[]) || ['Tag 1']).map((t: string) => (
              <span key={t} className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${cfg.color}18`, color: cfg.color }}>
                + {t}
              </span>
            ))}
          </div>
        )}
        {type === 'goal' && (
          <p className="text-xs font-semibold text-emerald-400">{data.goal as string || 'Meta atingida'}</p>
        )}
      </div>

      {/* Handles */}
      {type !== 'trigger' && (
        <Handle type="target" position={Position.Top} style={{ background: cfg.color, width: 10, height: 10, border: '2px solid #0f0b1e' }} />
      )}
      {type !== 'goal' && !isCondition && (
        <Handle type="source" position={Position.Bottom} style={{ background: cfg.color, width: 10, height: 10, border: '2px solid #0f0b1e' }} />
      )}
      {isCondition && (
        <>
          <Handle id="yes" type="source" position={Position.Bottom} style={{ left: '30%', background: '#10b981', width: 10, height: 10, border: '2px solid #0f0b1e' }} />
          <Handle id="no" type="source" position={Position.Bottom} style={{ left: '70%', background: '#ef4444', width: 10, height: 10, border: '2px solid #0f0b1e' }} />
        </>
      )}
    </div>
  )
}

const nodeTypes = Object.fromEntries(
  Object.keys(NODE_TYPES_CONFIG).map(k => [k, (props: NodeProps) => <FlowNode {...props} type={k} />])
)

// ─── Default nodes ─────────────────────────────────────────────────────────────
type FlowNodeData = Record<string, unknown>
const defaultNodes: { id: string; type: string; position: { x: number; y: number }; data: FlowNodeData }[] = [
  { id: 'n1', type: 'trigger',   position: { x: 300, y: 40 },  data: { triggerType: 'Novo Lead adicionado' } },
  { id: 'n2', type: 'whatsapp',  position: { x: 270, y: 200 }, data: { message: 'Olá {{nome}}! 👋 Obrigado pelo seu interesse. Preparamos algo especial para você. Posso te ajudar?', buttonText: 'Sim, quero saber!', template: true } },
  { id: 'n3', type: 'delay',     position: { x: 300, y: 420 }, data: { amount: '1', unit: 'hora' } },
  { id: 'n4', type: 'condition', position: { x: 270, y: 570 }, data: { condition: 'Respondeu a mensagem' } },
  { id: 'n5', type: 'whatsapp',  position: { x: 60,  y: 740 }, data: { message: 'Que ótimo! 🚀 Vou te conectar com um de nossos especialistas agora. Qual o melhor horário para você?', template: true } },
  { id: 'n6', type: 'email',     position: { x: 480, y: 740 }, data: { subject: 'Ainda posso te ajudar!', emoji: '💬', preview: 'Olá {{nome}}, notei que você ainda não respondeu...', template: 'Transacional' } },
  { id: 'n7', type: 'tag',       position: { x: 60,  y: 960 }, data: { tags: ['Lead Quente', 'Respondeu WA'] } },
  { id: 'n8', type: 'goal',      position: { x: 60, y: 1100 }, data: { goal: '🎯 Lead qualificado' } },
]

const animatedEdge = (id: string, source: string, target: string, sourceHandle?: string, label?: string) => ({
  id, source, target, sourceHandle,
  label,
  labelStyle: { fill: '#94a3b8', fontSize: 10, fontWeight: 600 },
  labelBgStyle: { fill: '#0f0b1e', stroke: '#1e1635' },
  labelBgPadding: [4, 6] as [number, number],
  animated: true,
  style: { stroke: sourceHandle === 'yes' ? '#10b981' : sourceHandle === 'no' ? '#ef4444' : '#6a11cb', strokeWidth: 2, opacity: 0.8 },
  markerEnd: { type: MarkerType.ArrowClosed, color: sourceHandle === 'yes' ? '#10b981' : sourceHandle === 'no' ? '#ef4444' : '#6a11cb' },
})

const defaultEdges = [
  animatedEdge('e1', 'n1', 'n2'),
  animatedEdge('e2', 'n2', 'n3'),
  animatedEdge('e3', 'n3', 'n4'),
  animatedEdge('e4', 'n4', 'n5', 'yes', 'Sim'),
  animatedEdge('e5', 'n4', 'n6', 'no', 'Não'),
  animatedEdge('e6', 'n5', 'n7'),
  animatedEdge('e7', 'n7', 'n8'),
]

// ─── Properties panel ──────────────────────────────────────────────────────────
function PropertiesPanel({ node, onClose }: { node: { id: string; type: string; data: Record<string, unknown> }; onClose: () => void }) {
  const cfg = NODE_TYPES_CONFIG[node.type as keyof typeof NODE_TYPES_CONFIG]
  const Icon = cfg.icon
  return (
    <div className="w-80 flex-shrink-0 border-l border-[#1e1635] bg-[#0a0818] flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1635]" style={{ borderTopColor: cfg.color }}>
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" style={{ color: cfg.color }} />
          <div>
            <p className="text-sm font-semibold text-white">{cfg.label.charAt(0) + cfg.label.slice(1).toLowerCase()}</p>
            <p className="text-[10px] text-slate-500">{
              node.type === 'whatsapp' ? 'Enviar mensagem WhatsApp' :
              node.type === 'email' ? 'Enviar email via Resend' :
              node.type === 'delay' ? 'Aguardar tempo definido' :
              node.type === 'condition' ? 'Verificar condição' :
              node.type === 'tag' ? 'Adicionar tag ao lead' :
              node.type === 'trigger' ? 'Gatilho do fluxo' : 'Meta do fluxo'
            }</p>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
      </div>

      <div className="p-4 space-y-4 text-xs">
        {node.type === 'whatsapp' && (
          <>
            <div className="space-y-1.5">
              <label className="text-slate-400 font-medium">Mensagem</label>
              <textarea defaultValue={node.data.message as string} rows={4} className="w-full bg-[#1e1635] border border-[#2d2550] rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-[#25d366] resize-none text-xs" />
              <p className="text-slate-600">Use {'{{nome}}'}, {'{{telefone}}'} para personalizar</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-400 font-medium">Botão de resposta rápida (opcional)</label>
              <input defaultValue={node.data.buttonText as string} className="w-full bg-[#1e1635] border border-[#2d2550] rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-[#25d366]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-400 font-medium">Tipo de mensagem</label>
              <select defaultValue="hsm" className="w-full bg-[#1e1635] border border-[#2d2550] rounded-lg px-3 py-2 text-slate-300 focus:outline-none">
                <option value="hsm">Template aprovado (HSM)</option>
                <option value="session">Sessão aberta (24h)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-400 font-medium">Nota interna (opcional)</label>
              <input placeholder="Observação..." className="w-full bg-[#1e1635] border border-[#2d2550] rounded-lg px-3 py-2 text-slate-600 focus:outline-none focus:border-[#25d366]" />
            </div>
          </>
        )}
        {node.type === 'email' && (
          <>
            <div className="space-y-1.5">
              <label className="text-slate-400 font-medium">Assunto</label>
              <input defaultValue={`${node.data.subject} ${node.data.emoji}`} className="w-full bg-[#1e1635] border border-[#2d2550] rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-[#8b5cf6]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-400 font-medium">Preview text</label>
              <input defaultValue={node.data.preview as string} className="w-full bg-[#1e1635] border border-[#2d2550] rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-[#8b5cf6]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-400 font-medium">Template</label>
              <select defaultValue="transacional" className="w-full bg-[#1e1635] border border-[#2d2550] rounded-lg px-3 py-2 text-slate-300 focus:outline-none">
                <option>Transacional</option>
                <option>Nutri&ccedil;&atilde;o</option>
                <option>Promo&ccedil;&atilde;o</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-400 font-medium">De (remetente)</label>
              <input defaultValue="contato@empresa.com.br" className="w-full bg-[#1e1635] border border-[#2d2550] rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-[#8b5cf6]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-400 font-medium">Nota interna (opcional)</label>
              <input placeholder="Observação..." className="w-full bg-[#1e1635] border border-[#2d2550] rounded-lg px-3 py-2 text-slate-600 focus:outline-none" />
            </div>
          </>
        )}
        {node.type === 'delay' && (
          <div className="flex gap-2">
            <div className="flex-1 space-y-1.5">
              <label className="text-slate-400 font-medium">Quantidade</label>
              <input type="number" defaultValue={node.data.amount as string} className="w-full bg-[#1e1635] border border-[#2d2550] rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-[#f59e0b]" />
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-slate-400 font-medium">Unidade</label>
              <select defaultValue={node.data.unit as string} className="w-full bg-[#1e1635] border border-[#2d2550] rounded-lg px-3 py-2 text-slate-300 focus:outline-none">
                <option value="hora">hora(s)</option>
                <option value="dia">dia(s)</option>
                <option value="semana">semana(s)</option>
              </select>
            </div>
          </div>
        )}
        {node.type === 'condition' && (
          <>
            <div className="space-y-1.5">
              <label className="text-slate-400 font-medium">Condição</label>
              <select defaultValue="replied" className="w-full bg-[#1e1635] border border-[#2d2550] rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-[#ec4899]">
                <option value="replied">Respondeu a mensagem</option>
                <option value="clicked">Clicou no botão</option>
                <option value="tag">Tem a tag</option>
                <option value="stage">Está no estágio</option>
              </select>
            </div>
          </>
        )}
        {node.type === 'trigger' && (
          <div className="space-y-1.5">
            <label className="text-slate-400 font-medium">Gatilho</label>
            <select className="w-full bg-[#1e1635] border border-[#2d2550] rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-[#F5A314]">
              <option>Novo Lead adicionado</option>
              <option>Lead movido de estágio</option>
              <option>Tag adicionada</option>
              <option>Evento CAPI disparado</option>
            </select>
          </div>
        )}
        {node.type === 'tag' && (
          <div className="space-y-1.5">
            <label className="text-slate-400 font-medium">Tags a adicionar</label>
            <input defaultValue={(node.data.tags as string[])?.join(', ')} className="w-full bg-[#1e1635] border border-[#2d2550] rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-[#06b6d4]" placeholder="Tag 1, Tag 2..." />
          </div>
        )}
        {node.type === 'goal' && (
          <div className="space-y-1.5">
            <label className="text-slate-400 font-medium">Descrição da meta</label>
            <input defaultValue={node.data.goal as string} className="w-full bg-[#1e1635] border border-[#2d2550] rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-[#10b981]" />
          </div>
        )}
      </div>

      <div className="mt-auto p-4 border-t border-[#1e1635]">
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Bloco configurado
        </div>
      </div>
    </div>
  )
}

// ─── Sidebar blocks ─────────────────────────────────────────────────────────────
const sidebarBlocks = [
  { type: 'trigger', label: 'Gatilho' },
  { type: 'whatsapp', label: 'WhatsApp' },
  { type: 'sms', label: 'SMS' },
  { type: 'email', label: 'Email' },
  { type: 'delay', label: 'Aguardar' },
  { type: 'condition', label: 'Condição' },
  { type: 'tag', label: 'Tag' },
  { type: 'goal', label: 'Meta' },
]

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function FlowEditorPage() {
  const router = useRouter()
  const params = useParams()
  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(defaultEdges)
  const [selectedNode, setSelectedNode] = useState<{ id: string; type: string; data: Record<string, unknown> } | null>(null)
  const [tab, setTab] = useState<'editor' | 'metricas'>('editor')

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges(eds => addEdge({
        ...connection,
        animated: true,
        style: { stroke: '#6a11cb', strokeWidth: 2, opacity: 0.8 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6a11cb' },
      }, eds))
    },
    [setEdges]
  )

  function handleNodeClick(_: React.MouseEvent, node: { id: string; type?: string; data: Record<string, unknown> }) {
    if (!node.type) return
    setSelectedNode({ id: node.id, type: node.type, data: node.data })
  }

  function addBlock(type: string) {
    const newNode = {
      id: `n${Date.now()}`,
      type,
      position: { x: 250 + Math.random() * 100, y: 200 + Math.random() * 200 },
      data: type === 'whatsapp' ? { message: 'Nova mensagem...', template: true } :
            type === 'email' ? { subject: 'Assunto', preview: 'Preview...', template: 'Transacional' } :
            type === 'delay' ? { amount: '1', unit: 'hora' } :
            type === 'condition' ? { condition: 'Respondeu a mensagem' } :
            type === 'tag' ? { tags: ['Nova tag'] } :
            type === 'goal' ? { goal: 'Meta atingida' } :
            type === 'trigger' ? { triggerType: 'Novo Lead adicionado' } :
            { message: 'Mensagem SMS...' },
    }
    setNodes(ns => [...ns, newNode])
  }

  const campaignName = params.id === '1' ? 'Nutrição de leads — Boas-vindas' :
                       params.id === '2' ? 'Follow-up — Proposta enviada' :
                       'Nova Campanha'

  return (
    <div className="flex flex-col h-screen bg-[#080612]">
      <Toaster position="top-right" toastOptions={{ style: { background: '#0f0b1e', color: '#e2e8f0', border: '1px solid #2d2550', borderRadius: '10px', fontSize: '13px' } }} />

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e1635] bg-[#0a0818] flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/campanhas')} className="w-8 h-8 rounded-lg bg-[#1e1635] flex items-center justify-center text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white">{campaignName}</p>
              <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-dot" />
            </div>
            <p className="text-[10px] text-slate-500">{nodes.length} blocos · {edges.length} conexões</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(['editor', 'metricas'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${tab === t ? 'gradient-brand text-white' : 'bg-[#1e1635] text-slate-400 hover:text-white'}`}
            >
              {t === 'editor' ? <><ChevronRight className="w-3 h-3" />Editor</> : <><BarChart2 className="w-3 h-3" />Métricas</>}
            </button>
          ))}
          <button onClick={() => toast.success('Fluxo salvo!')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1e1635] border border-[#2d2550] text-slate-300 text-xs font-medium hover:text-white transition-colors">
            <Save className="w-3.5 h-3.5" />
            Salvar
          </button>
          <button onClick={() => toast.success('Campanha ativada!')} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg gradient-brand text-white text-xs font-semibold hover:opacity-90 transition-opacity">
            <Play className="w-3.5 h-3.5" />
            Ativar campanha
          </button>
        </div>
      </div>

      {tab === 'metricas' ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Contatos no fluxo', value: '1.284', color: '#8b5cf6' },
              { label: 'Taxa de abertura', value: '68%', color: '#10b981' },
              { label: 'Conversões', value: '143', color: '#F5A314' },
              { label: 'Descadastramentos', value: '12', color: '#ef4444' },
            ].map(({ label, value, color }) => (
              <div key={label} className="glass rounded-xl p-4">
                <p className="text-xl font-bold text-white">{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
                <div className="w-full h-1 bg-[#1e1635] rounded-full mt-2 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: '60%', background: color }} />
                </div>
              </div>
            ))}
          </div>
          <div className="glass rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1e1635]"><p className="text-sm font-semibold text-white">Performance por bloco</p></div>
            <table className="w-full text-xs">
              <thead><tr className="border-b border-[#1e1635]">{['Nó','Tipo','Enviados','Taxa de sucesso'].map(h => <th key={h} className="px-4 py-3 text-left text-slate-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody>
                {[
                  ['Gatilho', 'Trigger', '1.284', '100%'], ['Boas-vindas WA', 'WhatsApp', '1.284', '97%'],
                  ['Aguardar 1h', 'Delay', '1.245', '100%'], ['Respondeu?', 'Condição', '1.198', '—'],
                  ['WA especialista', 'WhatsApp', '842', '94%'], ['Email follow-up', 'Email', '356', '88%'],
                ].map(([nome, tipo, enviados, taxa]) => (
                  <tr key={nome} className="border-b border-[#1e1635]/50 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-white font-medium">{nome}</td>
                    <td className="px-4 py-3 text-slate-400">{tipo}</td>
                    <td className="px-4 py-3 text-slate-300">{enviados}</td>
                    <td className="px-4 py-3 text-emerald-400 font-medium">{taxa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar */}
          <div className="w-36 flex-shrink-0 border-r border-[#1e1635] bg-[#0a0818] flex flex-col py-3 px-2 z-10">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2 px-1">BLOCOS</p>
            <p className="text-[10px] text-slate-600 mb-3 px-1">Arraste ou clique</p>
            <div className="space-y-1.5 flex-1">
              {sidebarBlocks.map(({ type, label }) => {
                const cfg = NODE_TYPES_CONFIG[type as keyof typeof NODE_TYPES_CONFIG]
                const Icon = cfg.icon
                return (
                  <button key={type} onClick={() => addBlock(type)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all hover:scale-[1.02] text-left"
                    style={{ background: cfg.bg, borderColor: `${cfg.color}30` }}
                  >
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: cfg.color }} />
                    <span className="text-xs font-medium text-white">{label}</span>
                  </button>
                )
              })}
            </div>
            <div className="border-t border-[#1e1635] pt-3 mt-3 space-y-2 px-1">
              {[['Zoom in', '+'], ['Zoom out', '−'], ['Fit', '⊞'], ['Lock', '🔒']].map(([label, icon]) => (
                <button key={label} className="w-full flex items-center gap-2 text-xs text-slate-600 hover:text-slate-400 transition-colors">
                  <span className="w-5 h-5 rounded bg-[#1e1635] flex items-center justify-center text-[10px]">{icon}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 relative" style={{ background: '#080612' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={handleNodeClick}
              onPaneClick={() => setSelectedNode(null)}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              defaultViewport={{ x: 0, y: 0, zoom: 0.85 }}
              style={{ background: '#080612' }}
            >
              <Background color="#1e1635" gap={24} variant={BackgroundVariant.Dots} size={1} />
              <Controls style={{ background: '#0f0b1e', border: '1px solid #1e1635', borderRadius: '8px' }} />
              <MiniMap
                style={{ background: '#0f0b1e', border: '1px solid #1e1635', borderRadius: '8px' }}
                nodeColor={n => {
                  const cfg = NODE_TYPES_CONFIG[n.type as keyof typeof NODE_TYPES_CONFIG]
                  return cfg?.color ?? '#6a11cb'
                }}
              />
            </ReactFlow>
          </div>

          {/* Right panel */}
          {selectedNode && (
            <PropertiesPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
          )}
        </div>
      )}
    </div>
  )
}
