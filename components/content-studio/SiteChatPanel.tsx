'use client'
import { useState } from 'react'
import { Send, Loader2, Bot, User } from 'lucide-react'

export interface SiteMessage {
  id: string
  role: string
  content: string
  createdAt: string
}

export default function SiteChatPanel({ messages, onSend, sending }: {
  messages: SiteMessage[]
  onSend: (message: string) => Promise<void>
  sending: boolean
}) {
  const [text, setText] = useState('')

  async function handleSend() {
    if (!text.trim() || sending) return
    const message = text.trim()
    setText('')
    await onSend(message)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <p className="text-xs text-slate-600 text-center py-6">Peça ajustes aqui depois de ver o preview — ex: &quot;troca a cor do botão pra verde&quot;.</p>
        ) : (
          messages.map(m => (
            <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: m.role === 'user' ? 'rgba(37,117,252,0.15)' : 'rgba(106,17,203,0.15)' }}>
                {m.role === 'user' ? <User className="w-3 h-3" style={{ color: '#2575fc' }} /> : <Bot className="w-3 h-3" style={{ color: '#8b5cf6' }} />}
              </div>
              <div className="rounded-lg px-3 py-2 text-xs text-slate-200 max-w-[85%]" style={{ background: '#1a1230' }}>
                {m.content}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(106,17,203,0.15)' }}>
              <Bot className="w-3 h-3" style={{ color: '#8b5cf6' }} />
            </div>
            <div className="rounded-lg px-3 py-2 text-xs text-slate-500 flex items-center gap-2" style={{ background: '#1a1230' }}>
              <Loader2 className="w-3 h-3 animate-spin" /> Aplicando alteração...
            </div>
          </div>
        )}
      </div>
      <div className="p-3 border-t flex items-end gap-2" style={{ borderColor: '#1e1635' }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder="Peça um ajuste no site..."
          rows={2}
          disabled={sending}
          className="flex-1 px-3 py-2 text-xs bg-[#1a1230] border border-[#2d2550] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#6a11cb] transition-colors resize-none disabled:opacity-60"
        />
        <button
          onClick={handleSend}
          disabled={sending || !text.trim()}
          className="p-2.5 rounded-lg text-white transition-all disabled:opacity-40 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #6a11cb, #F5A314)' }}
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
