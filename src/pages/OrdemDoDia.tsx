import { useState, useEffect, useRef } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import {
  ClipboardList, Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Calendar, Archive, ArchiveRestore,
  Download, FileText, FileDown, FileImage,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ToastContainer } from '@/components/ui/toast'
import { InlineMarkdownField } from '@/components/shared/MarkdownEditor'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/useToast'
import { loadOrdemDoDias, saveOrdemDoDia, deleteOrdemDoDia } from '@/lib/storage'
import { cn, formatDate } from '@/lib/utils'
import type { OrdemDoDia, Pauta, Ata } from '@/types'

// ─── Demo data ────────────────────────────────────────────────────────────

const DEMO_ORDENS: OrdemDoDia[] = [
  {
    id: 'demo-1',
    title: 'Reunião ordinária — maio',
    meeting_date: '2026-05-15',
    pautas: [
      { id: 'p1', title: 'Apresentação dos andamentos', order: 0 },
      { id: 'p2', title: 'Discussão da leitura do mês', order: 1 },
      { id: 'p3', title: 'Próximos passos', order: 2 },
    ],
    ata: { content: '', updated_at: '' },
    archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

// ─── Export utilities ─────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function exportFilename(item: OrdemDoDia, ext: string): string {
  const date = item.meeting_date ?? item.created_at.split('T')[0]
  const slug = item.title
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '').slice(0, 40)
  return `ordem-do-dia-${date}-${slug}.${ext}`
}

function exportToMarkdown(item: OrdemDoDia) {
  const dateStr = item.meeting_date ? `\n**Data:** ${formatDate(item.meeting_date)}` : ''
  const pautas = item.pautas.map((p, i) => `${i + 1}. ${p.title}`).join('\n')
  const ata = item.ata.content.trim() ? `\n---\n\n## Ata da Reunião\n\n${item.ata.content}` : ''
  const md = `# ${item.title}${dateStr}\n\n## Pauta\n\n${pautas}${ata}\n`
  downloadBlob(new Blob([md], { type: 'text/markdown; charset=utf-8' }), exportFilename(item, 'md'))
}

function exportToPdf(item: OrdemDoDia) {
  import('jspdf').then(({ jsPDF }) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const ml = 20, mr = 20
    const pw = doc.internal.pageSize.getWidth()
    const mw = pw - ml - mr
    let y = 0

    // Amber header
    doc.setFillColor(217, 119, 6)
    doc.rect(0, 0, pw, 14, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal')
    doc.text('coLAB · coLAB/UFF · Ordem do Dia', ml, 9)
    y = 26

    doc.setTextColor(120, 53, 15); doc.setFontSize(20); doc.setFont('helvetica', 'bold')
    const titleLines = doc.splitTextToSize(item.title, mw) as string[]
    doc.text(titleLines, ml, y); y += titleLines.length * 8 + 2

    if (item.meeting_date) {
      doc.setFontSize(10); doc.setFont('helvetica', 'normal')
      doc.setTextColor(217, 119, 6)
      doc.text(formatDate(item.meeting_date), ml, y); y += 7
    }

    y += 4; doc.setDrawColor(253, 230, 138); doc.setLineWidth(0.5)
    doc.line(ml, y, pw - mr, y); y += 8

    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(180, 83, 9)
    doc.text('PAUTA', ml, y); y += 6
    for (const [i, p] of item.pautas.entries()) {
      doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(31, 41, 55)
      const lines = doc.splitTextToSize(`${i + 1}.   ${p.title}`, mw) as string[]
      doc.text(lines, ml, y); y += lines.length * 5.5 + 2
    }

    if (item.ata.content.trim()) {
      y += 6; doc.setDrawColor(253, 230, 138); doc.line(ml, y, pw - mr, y); y += 8
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(180, 83, 9)
      doc.text('ATA DA REUNIÃO', ml, y); y += 6
      const plain = item.ata.content
        .replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(55, 65, 81)
      const ataLines = doc.splitTextToSize(plain, mw) as string[]
      doc.text(ataLines, ml, y)
    }

    doc.save(exportFilename(item, 'pdf'))
  }).catch(() => alert('Erro ao gerar PDF.'))
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []; let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word }
    else line = test
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

async function generatePngBlob(item: OrdemDoDia): Promise<Blob> {
  return new Promise(resolve => {
    const S = 1600
    const canvas = document.createElement('canvas')
    canvas.width = S; canvas.height = S
    const ctx = canvas.getContext('2d')!
    const pad = 72, r = 36

    const bg = ctx.createLinearGradient(0, 0, 0, S)
    bg.addColorStop(0, '#fffbeb'); bg.addColorStop(1, '#fde68a')
    ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S)

    ctx.shadowColor = 'rgba(217,119,6,0.18)'; ctx.shadowBlur = 64; ctx.shadowOffsetY = 16
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.roundRect(pad, pad, S - pad * 2, S - pad * 2, r); ctx.fill()
    ctx.shadowColor = 'transparent'

    const cx = pad, cy = pad, cw = S - pad * 2, ch = S - pad * 2

    ctx.fillStyle = '#d97706'
    ctx.beginPath(); ctx.roundRect(cx, cy, cw, 18, [r, r, 0, 0]); ctx.fill()

    let y = cy + 74

    ctx.fillStyle = '#d97706'; ctx.font = 'bold 24px system-ui,sans-serif'
    ctx.fillText('coLAB · coLAB/UFF', cx + 56, y); y += 52

    ctx.fillStyle = '#78350f'; ctx.font = 'bold 56px system-ui,sans-serif'
    const titleLines = wrapText(ctx, item.title, cw - 112)
    for (const line of titleLines.slice(0, 3)) { ctx.fillText(line, cx + 56, y); y += 68 }
    y += 8

    if (item.meeting_date) {
      ctx.fillStyle = '#d97706'; ctx.font = '32px system-ui,sans-serif'
      ctx.fillText(formatDate(item.meeting_date), cx + 56, y); y += 56
    }

    y += 16; ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(cx + 56, y); ctx.lineTo(cx + cw - 56, y); ctx.stroke(); y += 36

    ctx.fillStyle = '#b45309'; ctx.font = 'bold 24px system-ui,sans-serif'
    ctx.fillText('PAUTA', cx + 56, y); y += 42

    const maxItemY = cy + ch - 80
    for (const [i, p] of item.pautas.entries()) {
      if (y > maxItemY) {
        ctx.fillStyle = '#9ca3af'; ctx.font = '28px system-ui,sans-serif'
        ctx.fillText(`… mais ${item.pautas.length - i} item(ns)`, cx + 56, y); break
      }
      ctx.fillStyle = '#d97706'; ctx.font = 'bold 32px system-ui,sans-serif'
      ctx.fillText(`${i + 1}.`, cx + 56, y)
      ctx.fillStyle = '#1f2937'; ctx.font = '32px system-ui,sans-serif'
      const lines = wrapText(ctx, p.title, cw - 172)
      for (const [li, ln] of lines.entries()) ctx.fillText(ln, cx + 108, y + li * 40)
      y += lines.length * 40 + 18
    }

    const fh = 64
    ctx.fillStyle = '#d97706'
    ctx.beginPath(); ctx.roundRect(cx, cy + ch - fh, cw, fh, [0, 0, r, r]); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.font = '24px system-ui,sans-serif'
    ctx.fillText('Ordem do Dia · coLAB', cx + 52, cy + ch - fh + 40)

    canvas.toBlob(blob => resolve(blob!), 'image/png')
  })
}

async function exportToPng(item: OrdemDoDia) {
  const blob = await generatePngBlob(item)
  downloadBlob(blob, exportFilename(item, 'png'))
}

// ─── AtaSection ───────────────────────────────────────────────────────────

function AtaSection({ ata, onChange }: { ata: Ata; onChange: (a: Ata) => void }) {
  const [open, setOpen] = useState(false)
  const hasContent = ata.content.trim().length > 0

  return (
    <div className="border-t border-amber-100 dark:border-amber-900/30 mt-3 pt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs font-medium text-amber-600 hover:text-amber-800 transition-colors w-full text-left"
      >
        {open ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />}
        <span>Ata da Reunião</span>
        {hasContent && !open && (
          <span className="ml-auto text-xs text-gray-400 font-normal truncate max-w-xs">
            {ata.content.slice(0, 80).replace(/#+\s*/g, '').replace(/\n/g, ' ')}…
          </span>
        )}
        {!hasContent && !open && <span className="ml-2 text-xs text-gray-300 font-normal italic">vazia</span>}
      </button>
      {open && (
        <div className="mt-2">
          <InlineMarkdownField
            value={ata.content}
            onChange={(content: string) => onChange({ content, updated_at: new Date().toISOString() })}
            placeholder="Escreva a ata da reunião…"
            className="min-h-[4rem] text-sm"
          />
        </div>
      )}
    </div>
  )
}

// ─── PautaRow ─────────────────────────────────────────────────────────────

function PautaRow({
  pauta, index, autoFocus, provided, isDragging, onChange, onDelete, onBlur, onEnter,
}: {
  pauta: Pauta; index: number; autoFocus: boolean
  provided: { innerRef: (el: HTMLElement | null) => void; draggableProps: React.HTMLAttributes<HTMLElement>; dragHandleProps: React.HTMLAttributes<HTMLElement> | null }
  isDragging: boolean; onChange: (id: string, title: string) => void
  onDelete: (id: string) => void; onBlur: () => void; onEnter: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) inputRef.current?.focus() }, [autoFocus])

  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      className={cn('group flex items-center gap-2 py-1.5 px-2 rounded-md', isDragging && 'bg-amber-50 shadow-md')}
    >
      <div {...provided.dragHandleProps} className="opacity-0 group-hover:opacity-40 cursor-grab flex-shrink-0">
        <GripVertical className="w-3.5 h-3.5 text-gray-400" />
      </div>
      <span className="text-xs font-mono text-amber-400 w-5 text-right flex-shrink-0 select-none">{index + 1}.</span>
      <input
        ref={inputRef}
        className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 outline-none focus:bg-amber-50 dark:focus:bg-amber-950/20 rounded px-1 min-w-0"
        value={pauta.title}
        onChange={(e) => onChange(pauta.id, e.target.value)}
        onBlur={onBlur}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); inputRef.current?.blur(); onEnter() } }}
        placeholder="Pauta…"
      />
      <button onClick={() => onDelete(pauta.id)} className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all flex-shrink-0">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── OrdemDoDiaCard ───────────────────────────────────────────────────────

function OrdemDoDiaCard({ item, isSaving, onSave, onDelete, onArchive }: {
  item: OrdemDoDia; isSaving: boolean
  onSave: (o: OrdemDoDia) => void; onDelete: (id: string) => void; onArchive: (id: string) => void
}) {
  const [current, setCurrent] = useState<OrdemDoDia>(item)
  const [titleDraft, setTitleDraft] = useState(item.title)
  const [newPautaId, setNewPautaId] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exportOpen) return
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [exportOpen])

  function save(updated: OrdemDoDia) { setCurrent(updated); onSave(updated) }

  function handleTitleBlur() {
    const title = titleDraft.trim() || 'Sem título'
    setTitleDraft(title)
    if (title !== current.title) save({ ...current, title })
  }

  function handlePautaChange(id: string, title: string) {
    setCurrent(prev => ({ ...prev, pautas: prev.pautas.map(p => p.id === id ? { ...p, title } : p) }))
  }

  function saveCurrentPautas() {
    setCurrent(prev => {
      const filtered = prev.pautas.filter(p => p.title.trim() !== '')
      const reordered = filtered.map((p, i) => ({ ...p, order: i }))
      const updated = { ...prev, pautas: reordered }
      onSave(updated)
      return updated
    })
    setNewPautaId(null)
  }

  function handleDeletePauta(id: string) {
    const filtered = current.pautas.filter(p => p.id !== id)
    const reordered = filtered.map((p, i) => ({ ...p, order: i }))
    save({ ...current, pautas: reordered })
  }

  function handleAddPauta() {
    const id = crypto.randomUUID()
    const newPauta: Pauta = { id, title: '', order: current.pautas.length }
    setCurrent(prev => ({ ...prev, pautas: [...prev.pautas, newPauta] }))
    setNewPautaId(id)
  }

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return
    const arr = Array.from(current.pautas)
    const [moved] = arr.splice(result.source.index, 1)
    arr.splice(result.destination.index, 0, moved)
    save({ ...current, pautas: arr.map((p, i) => ({ ...p, order: i })) })
  }

  return (
    <div className="group/card bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
        <div className="flex-1 min-w-0">
          <input
            className="w-full text-base font-semibold text-gray-900 dark:text-white bg-transparent border-b border-transparent hover:border-amber-200 focus:border-amber-400 outline-none pb-0.5 transition-colors"
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={handleTitleBlur}
          />
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Calendar className="w-3 h-3 flex-shrink-0" />
              <input
                type="date"
                value={current.meeting_date ?? ''}
                onChange={e => save({ ...current, meeting_date: e.target.value || undefined })}
                className="text-xs text-gray-500 dark:text-gray-400 bg-transparent border-none outline-none cursor-pointer"
              />
            </div>
            <Badge variant="secondary" className="text-xs font-mono bg-amber-50 text-amber-500 border-amber-100 border dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900">
              criado {formatDate(current.created_at.split('T')[0])}
            </Badge>
            {isSaving && <span className="text-xs text-gray-300 animate-pulse">salvando…</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
          <div ref={exportRef} className="relative">
            <button
              onClick={() => setExportOpen(o => !o)}
              className="opacity-0 group-hover/card:opacity-60 hover:!opacity-100 p-1.5 rounded hover:bg-amber-50 text-gray-300 hover:text-amber-500 transition-all"
              title="Exportar"
            >
              <Download className="w-4 h-4" />
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 py-1.5 min-w-[160px]">
                <button onClick={() => { exportToMarkdown(current); setExportOpen(false) }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <FileText className="w-3.5 h-3.5 text-gray-400" /> Markdown
                </button>
                <button onClick={() => { exportToPdf(current); setExportOpen(false) }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <FileDown className="w-3.5 h-3.5 text-gray-400" /> PDF
                </button>
                <button onClick={() => { exportToPng(current); setExportOpen(false) }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <FileImage className="w-3.5 h-3.5 text-gray-400" /> PNG (card)
                </button>

              </div>
            )}
          </div>
          <button onClick={() => onArchive(item.id)} className="opacity-0 group-hover/card:opacity-60 hover:!opacity-100 p-1.5 rounded hover:bg-amber-50 text-gray-300 hover:text-amber-500 transition-all" title="Arquivar">
            <Archive className="w-4 h-4" />
          </button>
          <button onClick={() => onDelete(item.id)} className="opacity-0 group-hover/card:opacity-60 hover:!opacity-100 p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all" title="Excluir">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-2 pb-1">
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId={`pautas-${item.id}`}>
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                {current.pautas.map((pauta, index) => (
                  <Draggable key={pauta.id} draggableId={pauta.id} index={index}>
                    {(prov, snap) => (
                      <PautaRow
                        pauta={pauta} index={index} autoFocus={pauta.id === newPautaId}
                        provided={prov} isDragging={snap.isDragging}
                        onChange={handlePautaChange} onDelete={handleDeletePauta}
                        onBlur={saveCurrentPautas} onEnter={handleAddPauta}
                      />
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
        {current.pautas.length === 0 && (
          <p className="text-xs text-gray-300 italic px-2 py-1.5 select-none">Nenhuma pauta ainda.</p>
        )}
        <button onClick={handleAddPauta} className="flex items-center gap-1.5 mt-1 text-xs text-amber-500 hover:text-amber-700 px-2 py-1 rounded-md hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Adicionar pauta
        </button>
      </div>

      <div className="px-4 pb-4">
        <AtaSection ata={current.ata} onChange={ata => save({ ...current, ata })} />
      </div>
    </div>
  )
}

// ─── ArchivedSection ──────────────────────────────────────────────────────

function ArchivedSection({ items, onUnarchive, onDelete }: {
  items: OrdemDoDia[]; onUnarchive: (id: string) => void; onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null

  return (
    <div className="border-t border-gray-100 dark:border-gray-700 mt-4 pt-4">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors mb-3">
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        <Archive className="w-4 h-4" />
        Arquivadas ({items.length})
      </button>
      {open && (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="group/arc flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-500 truncate">{item.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {item.meeting_date && <span className="text-xs text-gray-400">{formatDate(item.meeting_date)}</span>}
                  <span className="text-xs text-gray-300">{item.pautas.length} pauta{item.pautas.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => onUnarchive(item.id)} className="opacity-0 group-hover/arc:opacity-70 hover:!opacity-100 p-1.5 rounded hover:bg-white text-gray-300 hover:text-amber-500 transition-all" title="Desarquivar">
                  <ArchiveRestore className="w-4 h-4" />
                </button>
                <button onClick={() => onDelete(item.id)} className="opacity-0 group-hover/arc:opacity-60 hover:!opacity-100 p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all" title="Excluir">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export function OrdemDoDiaPage() {
  const [items, setItems] = useState<OrdemDoDia[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const { toasts, toast, dismiss } = useToast()
  const { isDemoMode } = useAuth()
  const pendingSaves = useRef<Map<string, Promise<void>>>(new Map())

  useEffect(() => {
    if (isDemoMode) { setItems(DEMO_ORDENS); setLoading(false); return }
    loadOrdemDoDias()
      .then(setItems)
      .catch(() => toast({ title: 'Erro ao carregar ordens do dia', variant: 'destructive' }))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMode])

  async function persistSave(item: OrdemDoDia) {
    const inFlight = pendingSaves.current.get(item.id)
    if (inFlight) await inFlight.catch(() => {})
    const promise = saveOrdemDoDia(item)
      .catch(() => { toast({ title: 'Erro ao salvar', variant: 'destructive' }) })
      .finally(() => {
        if (pendingSaves.current.get(item.id) === promise) pendingSaves.current.delete(item.id)
        setSaving(prev => { const s = new Set(prev); s.delete(item.id); return s })
      })
    pendingSaves.current.set(item.id, promise)
  }

  function handleCreate() {
    const now = new Date().toISOString()
    const newItem: OrdemDoDia = {
      id: crypto.randomUUID(), title: 'Nova Ordem do Dia',
      pautas: [], ata: { content: '', updated_at: now },
      archived: false, created_at: now, updated_at: now,
    }
    setItems(prev => [newItem, ...prev])
    if (!isDemoMode) { setSaving(prev => new Set(prev).add(newItem.id)); persistSave(newItem) }
  }

  function handleSave(updated: OrdemDoDia) {
    setItems(prev => prev.map(x => x.id === updated.id ? updated : x))
    if (isDemoMode) return
    setSaving(prev => new Set(prev).add(updated.id))
    persistSave(updated)
  }

  function handleArchive(id: string) {
    const item = items.find(x => x.id === id)
    if (item) handleSave({ ...item, archived: true })
  }

  function handleUnarchive(id: string) {
    const item = items.find(x => x.id === id)
    if (item) handleSave({ ...item, archived: false })
  }

  async function handleDelete(id: string) {
    setItems(prev => prev.filter(x => x.id !== id))
    if (!isDemoMode) {
      try { await deleteOrdemDoDia(id) }
      catch { toast({ title: 'Erro ao excluir', variant: 'destructive' }) }
    }
  }

  const activeItems = items.filter(x => !x.archived)
  const archivedItems = items.filter(x => x.archived)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 z-10 bg-gray-50 dark:bg-gray-950">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Ordem do Dia</h1>
          {!loading && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{activeItems.length} {activeItems.length === 1 ? 'reunião' : 'reuniões'}</p>}
        </div>
        <Button onClick={handleCreate} className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white" size="sm">
          <Plus className="w-4 h-4" /> Nova Ordem do Dia
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Carregando…</div>
        ) : activeItems.length === 0 && archivedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
              <ClipboardList className="w-6 h-6 text-amber-400" />
            </div>
            <p className="text-sm text-gray-500">Nenhuma Ordem do Dia ainda.</p>
            <Button onClick={handleCreate} variant="outline" size="sm" className="gap-1.5 border-amber-200 text-amber-600 hover:bg-amber-50">
              <Plus className="w-4 h-4" /> Criar primeira Ordem do Dia
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {activeItems.map(item => (
              <OrdemDoDiaCard
                key={item.id} item={item} isSaving={saving.has(item.id)}
                onSave={handleSave} onDelete={id => setDeleteTarget(id)} onArchive={handleArchive}
              />
            ))}
            <ArchivedSection items={archivedItems} onUnarchive={handleUnarchive} onDelete={id => setDeleteTarget(id)} />
          </div>
        )}
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir Ordem do Dia?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-400">Esta ação é irreversível. A ata e todas as pautas serão removidas.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => { if (deleteTarget) handleDelete(deleteTarget); setDeleteTarget(null) }}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
