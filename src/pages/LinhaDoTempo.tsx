import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Plus, Settings2, Download, Pencil, Trash2, Clock,
  ChevronDown, X, Check, FileSpreadsheet, FileText, Image, FileDown,
  Calendar, Tag,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { loadTimeline, saveTimeline, generateId } from '@/lib/storage'
import type { TimelineEvent, TimelineCategory, TimelineData } from '@/types'
import { cn } from '@/lib/utils'

// ─── Color palette ────────────────────────────────────────────────────────

const PALETTE: Record<string, { label: string; bg: string; text: string; dot: string; dark_bg: string; dark_text: string }> = {
  indigo:  { label: 'Índigo',   bg: '#eef2ff', text: '#3730a3', dot: '#6366f1', dark_bg: '#1e1b4b', dark_text: '#a5b4fc' },
  violet:  { label: 'Violeta',  bg: '#f5f3ff', text: '#5b21b6', dot: '#8b5cf6', dark_bg: '#2e1065', dark_text: '#c4b5fd' },
  pink:    { label: 'Rosa',     bg: '#fdf2f8', text: '#9d174d', dot: '#ec4899', dark_bg: '#500724', dark_text: '#f9a8d4' },
  rose:    { label: 'Carmim',   bg: '#fff1f2', text: '#be123c', dot: '#f43f5e', dark_bg: '#4c0519', dark_text: '#fda4af' },
  orange:  { label: 'Laranja',  bg: '#fff7ed', text: '#c2410c', dot: '#f97316', dark_bg: '#431407', dark_text: '#fdba74' },
  amber:   { label: 'Âmbar',   bg: '#fffbeb', text: '#b45309', dot: '#f59e0b', dark_bg: '#451a03', dark_text: '#fcd34d' },
  green:   { label: 'Verde',    bg: '#f0fdf4', text: '#15803d', dot: '#22c55e', dark_bg: '#052e16', dark_text: '#86efac' },
  teal:    { label: 'Teal',     bg: '#f0fdfa', text: '#0f766e', dot: '#14b8a6', dark_bg: '#042f2e', dark_text: '#99f6e4' },
  sky:     { label: 'Azul',     bg: '#f0f9ff', text: '#0369a1', dot: '#0ea5e9', dark_bg: '#082f49', dark_text: '#7dd3fc' },
  cyan:    { label: 'Ciano',    bg: '#ecfeff', text: '#0e7490', dot: '#06b6d4', dark_bg: '#083344', dark_text: '#67e8f9' },
  red:     { label: 'Vermelho', bg: '#fef2f2', text: '#b91c1c', dot: '#ef4444', dark_bg: '#450a0a', dark_text: '#fca5a5' },
  slate:   { label: 'Cinza',    bg: '#f8fafc', text: '#334155', dot: '#64748b', dark_bg: '#0f172a', dark_text: '#94a3b8' },
}

function CategoryPill({ cat, isDark }: { cat: TimelineCategory; isDark?: boolean }) {
  const c = PALETTE[cat.color] ?? PALETTE.slate
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: isDark ? c.dark_bg : c.bg, color: isDark ? c.dark_text : c.text }}
    >
      {cat.name}
    </span>
  )
}

// ─── Date helpers ─────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function formatDate(e: TimelineEvent): string {
  if (!e.month) return String(e.year)
  const m = MONTHS[e.month - 1]
  if (!e.day) return `${m} ${e.year}`
  return `${e.day} ${m} ${e.year}`
}

function sortEvents(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year
    const am = a.month ?? 0, bm = b.month ?? 0
    if (am !== bm) return am - bm
    return (a.day ?? 0) - (b.day ?? 0)
  })
}

// ─── useThemeDetect ───────────────────────────────────────────────────────

function useDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

// ─── Event card ───────────────────────────────────────────────────────────

function EventCard({
  event, categories, side, isDark, onEdit, onDelete,
}: {
  event: TimelineEvent
  categories: TimelineCategory[]
  side: 'left' | 'right'
  isDark: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const cats = event.category_ids.map(id => categories.find(c => c.id === id)).filter(Boolean) as TimelineCategory[]
  const dotColor = cats[0] ? (PALETTE[cats[0].color]?.dot ?? '#6366f1') : '#6366f1'

  return (
    <div className={cn(
      'relative group max-w-[340px] w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow p-4',
      side === 'left' ? 'ml-auto' : 'mr-auto',
    )}>
      {/* Arrow toward spine */}
      <div className={cn(
        'absolute top-4 w-0 h-0',
        side === 'left'
          ? 'right-0 translate-x-full border-t-[7px] border-b-[7px] border-l-[8px] border-transparent border-l-gray-100 dark:border-l-gray-700'
          : 'left-0 -translate-x-full border-t-[7px] border-b-[7px] border-r-[8px] border-transparent border-r-gray-100 dark:border-r-gray-700',
      )} />

      {/* Date badge */}
      <div className="flex items-center gap-1.5 mb-2">
        <span
          className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ background: dotColor + '22', color: dotColor }}
        >
          <Calendar className="w-3 h-3" />
          {formatDate(event)}
        </span>
      </div>

      {/* Title */}
      <p className="font-semibold text-gray-900 dark:text-white text-sm leading-snug mb-1.5">
        {event.title}
      </p>

      {/* Description */}
      {event.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-2.5">
          {event.description}
        </p>
      )}

      {/* Categories */}
      {cats.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {cats.map(cat => <CategoryPill key={cat.id} cat={cat} isDark={isDark} />)}
        </div>
      )}

      {/* Actions */}
      <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
        <button
          onClick={onEdit}
          className="p-1 rounded-lg bg-white dark:bg-gray-700 border border-gray-100 dark:border-gray-600 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 dark:hover:text-indigo-400 transition-colors shadow-sm"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={onDelete}
          className="p-1 rounded-lg bg-white dark:bg-gray-700 border border-gray-100 dark:border-gray-600 text-gray-400 hover:text-red-500 hover:border-red-200 dark:hover:text-red-400 transition-colors shadow-sm"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// ─── Category Manager Dialog ───────────────────────────────────────────────

function CategoryManagerDialog({
  categories, onSave, onClose,
}: {
  categories: TimelineCategory[]
  onSave: (cats: TimelineCategory[]) => void
  onClose: () => void
}) {
  const [cats, setCats] = useState<TimelineCategory[]>(JSON.parse(JSON.stringify(categories)))
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('indigo')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('indigo')

  function addCat() {
    if (!newName.trim()) return
    setCats(prev => [...prev, { id: generateId(), name: newName.trim(), color: newColor }])
    setNewName('')
    setNewColor('indigo')
  }

  function startEdit(c: TimelineCategory) {
    setEditId(c.id)
    setEditName(c.name)
    setEditColor(c.color)
  }

  function commitEdit() {
    if (!editName.trim() || !editId) return
    setCats(prev => prev.map(c => c.id === editId ? { ...c, name: editName.trim(), color: editColor } : c))
    setEditId(null)
  }

  function deleteCat(id: string) {
    setCats(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Categorias</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {cats.map(cat => (
            <div key={cat.id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              {editId === cat.id ? (
                <>
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && commitEdit()}
                    className="flex-1 text-sm border border-indigo-300 dark:border-indigo-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none"
                    autoFocus
                  />
                  <ColorPicker value={editColor} onChange={setEditColor} />
                  <button onClick={commitEdit} className="p-1.5 rounded-lg text-white bg-indigo-600 hover:bg-indigo-700">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <CategoryPill cat={cat} />
                  <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{cat.name}</span>
                  <button onClick={() => startEdit(cat)} className="p-1.5 rounded text-gray-400 hover:text-indigo-600">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteCat(cat.id)} className="p-1.5 rounded text-gray-400 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
          {cats.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Nenhuma categoria ainda.</p>
          )}
        </div>

        {/* Add new */}
        <div className="p-5 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Nova categoria</p>
          <div className="flex items-center gap-2">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCat()}
              placeholder="Nome da categoria"
              className="flex-1 text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
            />
            <ColorPicker value={newColor} onChange={setNewColor} />
            <button
              onClick={addCat}
              disabled={!newName.trim()}
              className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5 pb-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            Cancelar
          </button>
          <button
            onClick={() => { onSave(cats); onClose() }}
            className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-medium"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Color picker ─────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  const dot = PALETTE[value]?.dot ?? '#6366f1'
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-600 flex items-center justify-center hover:border-indigo-400 transition-colors"
      >
        <span className="w-4 h-4 rounded-full" style={{ background: dot }} />
      </button>
      {open && (
        <div className="absolute z-50 top-10 left-0 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl p-2 grid grid-cols-6 gap-1 w-44">
          {Object.entries(PALETTE).map(([key, c]) => (
            <button
              key={key}
              title={c.label}
              onClick={() => { onChange(key); setOpen(false) }}
              className={cn('w-6 h-6 rounded-full transition-transform hover:scale-110', value === key && 'ring-2 ring-offset-1 ring-indigo-500')}
              style={{ background: c.dot }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Event Form Dialog ─────────────────────────────────────────────────────

function EventFormDialog({
  event, categories, onSave, onClose,
}: {
  event: Partial<TimelineEvent> | null
  categories: TimelineCategory[]
  onSave: (e: TimelineEvent) => void
  onClose: () => void
}) {
  const isEdit = !!event?.id
  const [title, setTitle] = useState(event?.title ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [year, setYear] = useState(String(event?.year ?? new Date().getFullYear()))
  const [month, setMonth] = useState(String(event?.month ?? ''))
  const [day, setDay] = useState(String(event?.day ?? ''))
  const [selectedCats, setSelectedCats] = useState<string[]>(event?.category_ids ?? [])

  const yearNum = parseInt(year)
  const valid = title.trim() && !isNaN(yearNum) && yearNum >= 1000 && yearNum <= 2200

  function toggleCat(id: string) {
    setSelectedCats(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function submit() {
    if (!valid) return
    const now = new Date().toISOString()
    onSave({
      id: event?.id ?? generateId(),
      title: title.trim(),
      description: description.trim() || undefined,
      year: yearNum,
      month: month ? parseInt(month) : undefined,
      day: day ? parseInt(day) : undefined,
      category_ids: selectedCats,
      created_at: event?.created_at ?? now,
      updated_at: now,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold text-gray-900 dark:text-white">
              {isEdit ? 'Editar evento' : 'Novo evento'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Título *</label>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Descreva o evento"
              className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-xl px-3.5 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
            />
          </div>

          {/* Date row */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Data</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <input
                  type="number"
                  value={year}
                  onChange={e => setYear(e.target.value)}
                  placeholder="Ano *"
                  min={1000} max={2200}
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-xl px-3.5 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
                />
              </div>
              <div className="w-28">
                <select
                  value={month}
                  onChange={e => { setMonth(e.target.value); if (!e.target.value) setDay('') }}
                  className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-xl px-2.5 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
                >
                  <option value="">Mês</option>
                  {['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              {month && (
                <div className="w-20">
                  <input
                    type="number"
                    value={day}
                    onChange={e => setDay(e.target.value)}
                    placeholder="Dia"
                    min={1} max={31}
                    className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-xl px-2.5 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Descrição</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Detalhes sobre o evento (opcional)"
              rows={3}
              className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-xl px-3.5 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 resize-none"
            />
          </div>

          {/* Categories */}
          {categories.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Categorias</label>
              <div className="flex flex-wrap gap-1.5">
                {categories.map(cat => {
                  const sel = selectedCats.includes(cat.id)
                  const c = PALETTE[cat.color] ?? PALETTE.slate
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggleCat(cat.id)}
                      className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-all border-2', sel ? 'border-transparent' : 'border-transparent opacity-50 hover:opacity-75')}
                      style={sel ? { background: c.bg, color: c.text, borderColor: c.dot } : { background: c.bg, color: c.text }}
                    >
                      {sel && <Check className="w-3 h-3 inline mr-0.5 -mt-0.5" />}
                      {cat.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!valid}
            className="px-4 py-2 text-sm rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isEdit ? 'Salvar alterações' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────

export function LinhaDoTempoPage() {
  const isDark = useDark()
  const [data, setData] = useState<TimelineData>({ events: [], categories: [] })
  const [loading, setLoading] = useState(true)
  const [eventDialog, setEventDialog] = useState<Partial<TimelineEvent> | null | false>(false)
  const [catDialog, setCatDialog] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadTimeline().then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [exportOpen])

  const persist = useCallback((next: TimelineData) => {
    setData(next)
    saveTimeline(next).catch(console.error)
  }, [])

  function handleSaveEvent(ev: TimelineEvent) {
    const exists = data.events.some(e => e.id === ev.id)
    persist({
      ...data,
      events: exists ? data.events.map(e => e.id === ev.id ? ev : e) : [ev, ...data.events],
    })
  }

  function handleDeleteEvent(id: string) {
    persist({ ...data, events: data.events.filter(e => e.id !== id) })
  }

  function handleSaveCategories(cats: TimelineCategory[]) {
    persist({ ...data, categories: cats })
  }

  // ─── Exports ──────────────────────────────────────────────────────────

  const sorted = sortEvents(data.events)

  async function exportPNG() {
    setExportOpen(false)
    if (!timelineRef.current) return
    const canvas = await html2canvas(timelineRef.current, {
      useCORS: true,
      backgroundColor: isDark ? '#111827' : '#f9fafb',
      scale: 2,
    })
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = 'linha-do-tempo.png'
    a.click()
  }

  function exportExcel() {
    setExportOpen(false)
    const rows = sorted.map(e => ({
      Título: e.title,
      Descrição: e.description ?? '',
      Ano: e.year,
      Mês: e.month ?? '',
      Dia: e.day ?? '',
      Categorias: e.category_ids.map(id => data.categories.find(c => c.id === id)?.name ?? '').filter(Boolean).join(', '),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 40 }, { wch: 60 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 30 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Linha do Tempo')
    XLSX.writeFile(wb, 'linha-do-tempo.xlsx')
  }

  function exportPDF() {
    setExportOpen(false)
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const primary: [number, number, number] = [79, 70, 229]
    doc.setFillColor(...primary)
    doc.rect(0, 0, 210, 28, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('Linha do Tempo', 14, 12)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`Exportado em ${new Date().toLocaleDateString('pt-BR')} · ${sorted.length} evento(s)`, 14, 20)

    let y = 36
    let currentYear = 0

    for (const ev of sorted) {
      if (ev.year !== currentYear) {
        currentYear = ev.year
        if (y > 270) { doc.addPage(); y = 15 }
        doc.setFillColor(...primary)
        doc.setDrawColor(...primary)
        doc.roundedRect(14, y, 30, 6, 2, 2, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.text(String(currentYear), 20, y + 4.2)
        y += 11
      }

      if (y > 270) { doc.addPage(); y = 15 }
      doc.setFillColor(243, 244, 246)
      doc.roundedRect(14, y, 182, ev.description ? 16 : 10, 2, 2, 'F')
      doc.setTextColor(17, 24, 39)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text(ev.title.length > 70 ? ev.title.slice(0, 70) + '…' : ev.title, 19, y + 6)
      if (ev.description) {
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(107, 114, 128)
        doc.setFontSize(7.5)
        const desc = ev.description.length > 100 ? ev.description.slice(0, 100) + '…' : ev.description
        doc.text(desc, 19, y + 12)
      }
      const cats = ev.category_ids.map(id => data.categories.find(c => c.id === id)?.name).filter(Boolean).join(', ')
      if (cats) {
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(...primary)
        doc.setFontSize(7)
        doc.text(cats, 19, y + (ev.description ? 18 : 12))
      }
      y += (ev.description ? 20 : 14)
    }

    doc.save('linha-do-tempo.pdf')
  }

  function exportMarkdown() {
    setExportOpen(false)
    let md = '# Linha do Tempo\n\n'
    let currentYear = 0
    for (const ev of sorted) {
      if (ev.year !== currentYear) {
        currentYear = ev.year
        md += `## ${currentYear}\n\n`
      }
      md += `### ${ev.title}\n\n`
      md += `**Data:** ${formatDate(ev)}\n\n`
      if (ev.description) md += `${ev.description}\n\n`
      const cats = ev.category_ids.map(id => data.categories.find(c => c.id === id)?.name).filter(Boolean)
      if (cats.length) md += `**Categorias:** ${cats.join(', ')}\n\n`
      md += '---\n\n'
    }
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'linha-do-tempo.md'; a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Timeline render ───────────────────────────────────────────────────

  type RenderItem =
    | { type: 'year'; year: number }
    | { type: 'event'; event: TimelineEvent; side: 'left' | 'right' }

  const renderItems: RenderItem[] = []
  let lastYear = 0
  let sideIdx = 0

  for (const ev of sorted) {
    if (ev.year !== lastYear) {
      renderItems.push({ type: 'year', year: ev.year })
      lastYear = ev.year
    }
    renderItems.push({ type: 'event', event: ev, side: sideIdx % 2 === 0 ? 'left' : 'right' })
    sideIdx++
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
              <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 dark:text-white text-base leading-none">Linha do Tempo</h1>
              <p className="text-xs text-gray-400 mt-0.5">{sorted.length} evento{sorted.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCatDialog(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Categorias</span>
            </button>

            {/* Export dropdown */}
            <div className="relative" ref={exportRef}>
              <button
                onClick={() => setExportOpen(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Exportar</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {exportOpen && (
                <div className="absolute right-0 top-10 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-lg py-1 w-44 z-50">
                  {[
                    { icon: Image, label: 'PNG (imagem)', action: exportPNG },
                    { icon: FileSpreadsheet, label: 'Excel', action: exportExcel },
                    { icon: FileText, label: 'PDF', action: exportPDF },
                    { icon: FileDown, label: 'Markdown', action: exportMarkdown },
                  ].map(({ icon: Icon, label, action }) => (
                    <button
                      key={label}
                      onClick={action}
                      className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <Icon className="w-4 h-4 text-gray-400" />
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setEventDialog({})}
              className="flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-medium transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Novo evento</span>
            </button>
          </div>
        </div>
      </div>

      {/* Timeline body */}
      <div className="max-w-4xl mx-auto px-4 py-10" ref={timelineRef}>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-3">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">Carregando…</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
              <Clock className="w-8 h-8 text-indigo-400" />
            </div>
            <div>
              <p className="font-semibold text-gray-700 dark:text-gray-200 text-lg">Nenhum evento ainda</p>
              <p className="text-sm text-gray-400 mt-1">Adicione o primeiro evento para construir a linha do tempo.</p>
            </div>
            <button
              onClick={() => setEventDialog({})}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Adicionar evento
            </button>
          </div>
        ) : (
          <div className="relative">
            {/* Spine — centered on desktop, left on mobile */}
            <div className="absolute left-4 lg:left-1/2 inset-y-0 w-0.5 bg-indigo-100 dark:bg-indigo-900/60 lg:-translate-x-px" />

            {renderItems.map((item, idx) => {
              if (item.type === 'year') {
                return (
                  <div key={`y-${item.year}-${idx}`} className="relative flex lg:justify-center justify-start pl-0 lg:pl-0 mb-4 mt-6 first:mt-0">
                    <div className="ml-0 lg:ml-0 flex items-center gap-2 pl-8 lg:pl-0">
                      <span className="relative z-10 bg-indigo-600 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-sm">
                        {item.year}
                      </span>
                    </div>
                  </div>
                )
              }

              const { event, side } = item
              const dotColor = (() => {
                const firstCat = event.category_ids[0]
                if (firstCat) {
                  const cat = data.categories.find(c => c.id === firstCat)
                  if (cat) return PALETTE[cat.color]?.dot ?? '#6366f1'
                }
                return '#6366f1'
              })()

              return (
                <div key={event.id} className="relative mb-6">
                  {/* Spine dot */}
                  <div
                    className="absolute left-4 lg:left-1/2 lg:-translate-x-1/2 -translate-x-1/2 z-10 w-3.5 h-3.5 rounded-full ring-4 ring-white dark:ring-gray-950 shadow-sm mt-4"
                    style={{ background: dotColor }}
                  />

                  {/* Mobile: card on right of spine */}
                  <div className="lg:hidden pl-12 pr-2">
                    <EventCard
                      event={event}
                      categories={data.categories}
                      side="right"
                      isDark={isDark}
                      onEdit={() => setEventDialog(event)}
                      onDelete={() => handleDeleteEvent(event.id)}
                    />
                  </div>

                  {/* Desktop: alternating */}
                  <div className="hidden lg:grid lg:grid-cols-2 lg:gap-x-10 items-start">
                    <div className={cn('flex', side === 'left' ? 'justify-end pr-5' : 'justify-end pr-5 invisible')}>
                      {side === 'left' && (
                        <EventCard
                          event={event}
                          categories={data.categories}
                          side="left"
                          isDark={isDark}
                          onEdit={() => setEventDialog(event)}
                          onDelete={() => handleDeleteEvent(event.id)}
                        />
                      )}
                    </div>
                    <div className={cn('flex pl-5', side === 'right' ? 'justify-start' : 'justify-start invisible')}>
                      {side === 'right' && (
                        <EventCard
                          event={event}
                          categories={data.categories}
                          side="right"
                          isDark={isDark}
                          onEdit={() => setEventDialog(event)}
                          onDelete={() => handleDeleteEvent(event.id)}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Dialogs */}
      {catDialog && (
        <CategoryManagerDialog
          categories={data.categories}
          onSave={handleSaveCategories}
          onClose={() => setCatDialog(false)}
        />
      )}
      {eventDialog !== false && (
        <EventFormDialog
          event={eventDialog}
          categories={data.categories}
          onSave={handleSaveEvent}
          onClose={() => setEventDialog(false)}
        />
      )}
    </div>
  )
}
