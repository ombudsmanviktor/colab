import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookText, Plus, Trash2, Edit2, X, Link2, ImagePlus,
  Bold, Italic, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Code, Minus, Download, Upload,
  Search, ChevronLeft, FilePlus, GripVertical,
} from 'lucide-react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '@/contexts/AuthContext'
import { loadWikiEntries, saveWikiEntry, deleteWikiEntry, uploadWikiImage, generateId } from '@/lib/storage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/toast'
import type { WikiEntry } from '@/types'

// ─── Format helpers ───────────────────────────────────────────────────────

function fmt(
  ta: HTMLTextAreaElement,
  action: string,
): { value: string; sel: [number, number] } {
  const v = ta.value
  const s = ta.selectionStart
  const e = ta.selectionEnd
  const sel = v.slice(s, e)
  const lineStart = v.lastIndexOf('\n', s - 1) + 1
  const lineEndRaw = v.indexOf('\n', s)
  const lineEnd = lineEndRaw === -1 ? v.length : lineEndRaw
  const line = v.slice(lineStart, lineEnd)

  const inlineWrap = (w: string): { value: string; sel: [number, number] } => {
    if (sel.startsWith(w) && sel.endsWith(w) && sel.length >= w.length * 2) {
      const inner = sel.slice(w.length, sel.length - w.length)
      return { value: v.slice(0, s) + inner + v.slice(e), sel: [s, s + inner.length] }
    }
    return { value: v.slice(0, s) + w + sel + w + v.slice(e), sel: [s + w.length, e + w.length] }
  }

  const linePfx = (pfx: string, clearHeadings = false): { value: string; sel: [number, number] } => {
    const clean = clearHeadings ? line.replace(/^#{1,6} /, '') : line
    const removed = line.length - clean.length
    if (line.startsWith(pfx)) {
      const result = line.slice(pfx.length)
      const nv = v.slice(0, lineStart) + result + v.slice(lineEnd)
      return { value: nv, sel: [Math.max(lineStart, s - pfx.length), Math.max(lineStart, s - pfx.length)] }
    }
    const nv = v.slice(0, lineStart) + pfx + clean + v.slice(lineEnd)
    return { value: nv, sel: [s + pfx.length - removed, s + pfx.length - removed] }
  }

  switch (action) {
    case 'bold':   return inlineWrap('**')
    case 'italic': return inlineWrap('*')
    case 'strike': return inlineWrap('~~')
    case 'h1':     return linePfx('# ', true)
    case 'h2':     return linePfx('## ', true)
    case 'h3':     return linePfx('### ', true)
    case 'ul':     return linePfx('- ')
    case 'ol':     return linePfx('1. ')
    case 'quote':  return linePfx('> ')
    case 'code': {
      if (sel.includes('\n')) {
        const block = '\n```\n' + sel + '\n```\n'
        return { value: v.slice(0, s) + block + v.slice(e), sel: [s + 5, s + 5 + sel.length] }
      }
      return inlineWrap('`')
    }
    case 'divider': {
      const ins = '\n\n---\n\n'
      return { value: v.slice(0, s) + ins + v.slice(e), sel: [s + ins.length, s + ins.length] }
    }
    default: return { value: v, sel: [s, e] }
  }
}

function insertTextAtCursor(
  ta: HTMLTextAreaElement,
  text: string,
): { value: string; sel: [number, number] } {
  const v = ta.value
  const s = ta.selectionStart
  const e = ta.selectionEnd
  return { value: v.slice(0, s) + text + v.slice(e), sel: [s + text.length, s + text.length] }
}

// ─── Shared markdown preview styles ──────────────────────────────────────

const PROSE_CLS = [
  'prose prose-sm dark:prose-invert max-w-none',
  'prose-headings:text-gray-900 dark:prose-headings:text-white',
  'prose-a:text-amber-700 dark:prose-a:text-amber-400',
  'prose-hr:border-amber-100 dark:prose-hr:border-amber-900/30',
  'prose-blockquote:border-l-amber-400 prose-blockquote:text-gray-600 dark:prose-blockquote:text-gray-400',
  'prose-code:bg-amber-50 dark:prose-code:bg-amber-950/30 prose-code:text-amber-800 dark:prose-code:text-amber-300 prose-code:rounded prose-code:px-1',
].join(' ')

function MdPreview({ content }: { content: string }) {
  if (!content.trim()) {
    return <p className="text-sm text-gray-300 dark:text-gray-600 italic">O preview aparece aqui…</p>
  }
  return (
    <div className={PROSE_CLS}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ src, alt }) => (
            <img src={src} alt={alt ?? ''} className="max-w-full rounded-lg shadow-sm my-3" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

// ─── Link Dialog ──────────────────────────────────────────────────────────

function LinkDialog({ initialText, onInsert, onClose }: {
  initialText: string
  onInsert: (text: string, url: string) => void
  onClose: () => void
}) {
  const [text, setText] = useState(initialText)
  const [url, setUrl] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-5 w-80 space-y-3" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Inserir link</p>
        <div className="space-y-1.5">
          <Label>Texto</Label>
          <Input value={text} onChange={e => setText(e.target.value)} placeholder="Texto do link" autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label>URL</Label>
          <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…"
            onKeyDown={e => { if (e.key === 'Enter' && url.trim()) { onInsert(text || url, url.trim()); onClose() } }} />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" disabled={!url.trim()} onClick={() => { onInsert(text || url, url.trim()); onClose() }}
            className="bg-amber-500 hover:bg-amber-600 text-white">
            Inserir
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Toolbar ──────────────────────────────────────────────────────────────

const SEP = '|'

const TOOLS: Array<{ id: string; icon?: React.ElementType; label?: string; title: string } | typeof SEP> = [
  { id: 'bold',   icon: Bold,          title: 'Negrito (Ctrl+B)' },
  { id: 'italic', icon: Italic,        title: 'Itálico (Ctrl+I)' },
  { id: 'strike', icon: Strikethrough, title: 'Tachado' },
  SEP,
  { id: 'h1', icon: Heading1, title: 'Título 1' },
  { id: 'h2', icon: Heading2, title: 'Título 2' },
  { id: 'h3', icon: Heading3, title: 'Título 3' },
  SEP,
  { id: 'ul',    icon: List,        title: 'Lista' },
  { id: 'ol',    icon: ListOrdered, title: 'Lista numerada' },
  { id: 'quote', icon: Quote,       title: 'Citação' },
  SEP,
  { id: 'code',    icon: Code,  title: 'Código' },
  { id: 'divider', icon: Minus, title: 'Divisor' },
  SEP,
  { id: 'link',  icon: Link2,     title: 'Inserir link' },
  { id: 'image', icon: ImagePlus, title: 'Inserir imagem' },
]

function Toolbar({ onApply, onLinkClick, onImageClick }: {
  onApply: (action: string) => void
  onLinkClick: () => void
  onImageClick: () => void
}) {
  function handleKey(e: React.KeyboardEvent) {
    if (!e.ctrlKey && !e.metaKey) return
    if (e.key === 'b') { e.preventDefault(); onApply('bold') }
    if (e.key === 'i') { e.preventDefault(); onApply('italic') }
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      onKeyDown={handleKey}
      className="flex items-center gap-0.5 flex-wrap px-3 py-1.5 border-b border-amber-100 dark:border-amber-900/30 bg-amber-50/60 dark:bg-amber-950/20"
    >
      {TOOLS.map((t, i) => {
        if (t === SEP) return <div key={i} className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
        const Icon = t.icon
        const isLink = t.id === 'link'
        const isImg = t.id === 'image'
        return (
          <button
            key={t.id}
            title={t.title}
            type="button"
            onMouseDown={e => {
              e.preventDefault()
              if (isLink) { onLinkClick(); return }
              if (isImg)  { onImageClick(); return }
              onApply(t.id)
            }}
            className="p-1.5 rounded hover:bg-amber-100 dark:hover:bg-amber-900/40 text-gray-500 dark:text-gray-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
          >
            {Icon ? <Icon className="w-3.5 h-3.5" /> : <span className="text-xs font-mono">{t.label}</span>}
          </button>
        )
      })}
    </div>
  )
}

// ─── Wiki Editor ──────────────────────────────────────────────────────────

function WikiEditor({ entry, onSave, onCancel, isNew }: {
  entry: WikiEntry
  onSave: (e: WikiEntry) => Promise<void>
  onCancel: () => void
  isNew: boolean
}) {
  const [title, setTitle] = useState(entry.title === 'Nova entrada' && isNew ? '' : entry.title)
  const [content, setContent] = useState(entry.content)
  const [saving, setSaving] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const [linkInitialText, setLinkInitialText] = useState('')
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit')
  const taRef = useRef<HTMLTextAreaElement>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const pendingSel = useRef<[number, number] | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (isNew) titleRef.current?.focus() }, [isNew])
  useEffect(() => {
    if (pendingSel.current && taRef.current) {
      taRef.current.setSelectionRange(...pendingSel.current)
      pendingSel.current = null
    }
  }, [content])

  function applyFmt(action: string) {
    const ta = taRef.current
    if (!ta) return
    const { value, sel } = fmt(ta, action)
    setContent(value)
    pendingSel.current = sel
    requestAnimationFrame(() => taRef.current?.focus())
  }

  function openLink() {
    const ta = taRef.current
    if (!ta) return
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd)
    setLinkInitialText(sel)
    setShowLink(true)
  }

  function insertLink(text: string, url: string) {
    const ta = taRef.current
    if (!ta) return
    const { value, sel } = insertTextAtCursor(ta, `[${text}](${url})`)
    setContent(value)
    pendingSel.current = sel
  }

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const url = await uploadWikiImage(file)
      const ta = taRef.current
      if (!ta) return
      const { value, sel } = insertTextAtCursor(ta, `![${file.name}](${url})`)
      setContent(value)
      pendingSel.current = sel
    } catch {
      // upload failed silently
    }
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    await onSave({ ...entry, title: title.trim(), content: content.trim() })
    setSaving(false)
  }

  function handleExport() {
    const md = `# ${title}\n\n${content}`
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${entry.id}.md`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Title */}
      <div className="px-6 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <input
          ref={titleRef}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Título da entrada…"
          className="w-full text-2xl font-bold text-gray-900 dark:text-white bg-transparent outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600"
        />
      </div>

      {/* Mobile: Edit/Preview tabs */}
      <div className="flex lg:hidden border-b border-gray-100 dark:border-gray-800 flex-shrink-0 bg-white dark:bg-gray-900">
        <button
          onMouseDown={e => { e.preventDefault(); setMobileTab('edit') }}
          className={`flex-1 py-2 text-xs font-medium transition-colors border-b-2 ${
            mobileTab === 'edit'
              ? 'text-amber-700 dark:text-amber-300 border-amber-500'
              : 'text-gray-500 dark:text-gray-400 border-transparent'
          }`}
        >
          Editar
        </button>
        <button
          onMouseDown={e => { e.preventDefault(); setMobileTab('preview') }}
          className={`flex-1 py-2 text-xs font-medium transition-colors border-b-2 ${
            mobileTab === 'preview'
              ? 'text-amber-700 dark:text-amber-300 border-amber-500'
              : 'text-gray-500 dark:text-gray-400 border-transparent'
          }`}
        >
          Preview
        </button>
      </div>

      {/* Toolbar: always on desktop, hidden in preview mode on mobile */}
      <div className={`flex-shrink-0 ${mobileTab === 'preview' ? 'hidden lg:block' : ''}`}>
        <Toolbar
          onApply={applyFmt}
          onLinkClick={openLink}
          onImageClick={() => imgInputRef.current?.click()}
        />
      </div>
      <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />

      {/* Split body: textarea (left) + live preview (right) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: raw markdown */}
        <div className={`${mobileTab === 'preview' ? 'hidden' : 'flex'} lg:flex flex-1 overflow-hidden border-r border-gray-100 dark:border-gray-800`}>
          <textarea
            ref={taRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Escreva o conteúdo em Markdown…"
            spellCheck
            className="w-full h-full px-6 py-4 text-sm leading-relaxed text-gray-800 dark:text-gray-200 bg-transparent outline-none resize-none placeholder:text-gray-300 dark:placeholder:text-gray-600 font-mono overflow-y-auto"
          />
        </div>

        {/* Right: live rendered preview */}
        <div className={`${mobileTab === 'edit' ? 'hidden' : 'flex'} lg:flex flex-1 flex-col overflow-y-auto px-6 py-4 bg-gray-50/40 dark:bg-gray-900/30`}>
          <MdPreview content={content} />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <button onClick={handleExport} title="Exportar como .md"
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-amber-600 transition-colors">
          <Download className="w-3.5 h-3.5" /> Exportar .md
        </button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !title.trim()}
            className="bg-amber-500 hover:bg-amber-600 text-white">
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </div>

      {showLink && (
        <LinkDialog
          initialText={linkInitialText}
          onInsert={insertLink}
          onClose={() => setShowLink(false)}
        />
      )}
    </div>
  )
}

// ─── Wiki Viewer ──────────────────────────────────────────────────────────

function WikiViewer({ entry, onEdit, onDelete }: {
  entry: WikiEntry
  onEdit: () => void
  onDelete: () => void
}) {
  function handleExport() {
    const md = `# ${entry.title}\n\n${entry.content}`
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${entry.id}.md`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex-1 min-w-0 pr-4">{entry.title}</h1>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={handleExport} title="Exportar como .md"
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={onEdit} title="Editar"
            className="p-1.5 rounded hover:bg-amber-50 dark:hover:bg-amber-900/30 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={onDelete} title="Excluir"
            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {entry.content.trim() ? (
          <div className={PROSE_CLS}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                img: ({ src, alt }) => (
                  <img src={src} alt={alt ?? ''} className="max-w-full rounded-lg shadow-sm my-3" />
                ),
              }}
            >
              {entry.content}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-gray-300 dark:text-gray-600 italic">Sem conteúdo. Clique em Editar para começar.</p>
        )}
      </div>
    </div>
  )
}

// ─── Table of Contents (home view) ───────────────────────────────────────

function WikiToc({ entries, onSelectEntry, onNew }: {
  entries: WikiEntry[]
  onSelectEntry: (id: string) => void
  onNew: () => void
}) {
  return (
    <div className="flex-1 overflow-y-auto px-8 py-8">
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <BookText className="w-5 h-5 text-amber-500" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Índice</h1>
        </div>
        {entries.length === 0 ? (
          <div className="text-center py-12">
            <BookText className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-gray-400 dark:text-gray-500 text-sm mb-4">Nenhuma entrada ainda</p>
            <Button onClick={onNew} className="bg-amber-500 hover:bg-amber-600 text-white">
              <FilePlus className="w-4 h-4" /> Nova entrada
            </Button>
          </div>
        ) : (
          <ol className="space-y-0.5">
            {entries.map((entry, i) => (
              <li key={entry.id}>
                <button
                  onClick={() => onSelectEntry(entry.id)}
                  className="flex items-baseline gap-3 text-left w-full py-1.5 px-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/30 group transition-colors"
                >
                  <span className="text-xs text-gray-400 dark:text-gray-600 w-5 text-right flex-shrink-0 tabular-nums">
                    {i + 1}.
                  </span>
                  <span className="text-sm text-amber-700 dark:text-amber-400 group-hover:underline">
                    {entry.title}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export function WikiPage() {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const { toasts, toast, dismiss } = useToast()

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['wiki'],
    queryFn: loadWikiEntries,
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showMobileEntry, setShowMobileEntry] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  const sorted = [...entries].sort((a, b) => a.order - b.order)
  const filtered = sorted.filter(e =>
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.content.toLowerCase().includes(search.toLowerCase())
  )

  const selected = entries.find(e => e.id === selectedId) ?? null
  const isEditing = editingId !== null
  const editingEntry = entries.find(e => e.id === editingId) ?? null

  function selectEntry(id: string) {
    setSelectedId(id)
    setEditingId(null)
    setShowMobileEntry(true)
  }

  function handleNew() {
    const now = new Date().toISOString()
    const newEntry: WikiEntry = {
      id: generateId(),
      title: 'Nova entrada',
      content: '',
      order: entries.length,
      created_at: now,
      updated_at: now,
      created_by: session?.email ?? '',
      updated_by: session?.email ?? '',
    }
    queryClient.setQueryData(['wiki'], (prev: WikiEntry[] = []) => [...prev, newEntry])
    setSelectedId(newEntry.id)
    setEditingId(newEntry.id)
    setShowMobileEntry(true)
  }

  async function handleSave(updated: WikiEntry) {
    const now = new Date().toISOString()
    const toSave = { ...updated, updated_at: now, updated_by: session?.email ?? '' }
    try {
      await saveWikiEntry(toSave)
      queryClient.setQueryData(['wiki'], (prev: WikiEntry[] = []) => {
        const exists = prev.find(e => e.id === toSave.id)
        return exists ? prev.map(e => e.id === toSave.id ? toSave : e) : [...prev, toSave]
      })
      setEditingId(null)
      toast({ title: 'Entrada salva' })
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' })
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteWikiEntry(id)
      queryClient.setQueryData(['wiki'], (prev: WikiEntry[] = []) => prev.filter(e => e.id !== id))
      if (selectedId === id) { setSelectedId(null); setShowMobileEntry(false) }
      toast({ title: 'Entrada removida' })
    } catch {
      toast({ title: 'Erro ao remover', variant: 'destructive' })
    }
  }

  function handleCancel(id: string) {
    const entry = entries.find(e => e.id === id)
    const isNew = entry && !entry.content && entry.title === 'Nova entrada'
    if (isNew) {
      queryClient.setQueryData(['wiki'], (prev: WikiEntry[] = []) => prev.filter(e => e.id !== id))
      setSelectedId(null)
      setShowMobileEntry(false)
    }
    setEditingId(null)
  }

  async function handleReorder(result: DropResult) {
    if (!result.destination || result.source.index === result.destination.index) return

    const reordered = [...sorted]
    const [moved] = reordered.splice(result.source.index, 1)
    reordered.splice(result.destination.index, 0, moved)

    const withOrder = reordered.map((e, i) => ({ ...e, order: i }))
    queryClient.setQueryData(['wiki'], withOrder)

    const changed = withOrder.filter(e => {
      const original = entries.find(x => x.id === e.id)
      return original && original.order !== e.order
    })

    try {
      await Promise.all(changed.map(e => saveWikiEntry(e)))
    } catch {
      toast({ title: 'Erro ao reordenar', variant: 'destructive' })
      queryClient.setQueryData(['wiki'], entries)
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const text = await file.text()
    const now = new Date().toISOString()
    const titleMatch = text.match(/^#\s+(.+)$/m)
    const title = titleMatch ? titleMatch[1].trim() : file.name.replace('.md', '')
    const content = titleMatch ? text.replace(titleMatch[0], '').trim() : text.trim()
    const newEntry: WikiEntry = {
      id: generateId(),
      title,
      content,
      order: entries.length,
      created_at: now,
      updated_at: now,
      created_by: session?.email ?? '',
      updated_by: session?.email ?? '',
    }
    try {
      await saveWikiEntry(newEntry)
      queryClient.setQueryData(['wiki'], (prev: WikiEntry[] = []) => [...prev, newEntry])
      setSelectedId(newEntry.id)
      setShowMobileEntry(true)
      toast({ title: 'Arquivo importado' })
    } catch {
      toast({ title: 'Erro ao importar', variant: 'destructive' })
    }
  }

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="flex flex-col -mx-6 -mt-6 lg:-mx-8 lg:-mt-8 overflow-hidden h-[calc(100dvh-3.5rem)] lg:h-dvh">
      {/* Mobile: back button */}
      {showMobileEntry && (
        <div className="lg:hidden flex items-center gap-2 px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
          <button
            onClick={() => { setShowMobileEntry(false); setEditingId(null) }}
            className="flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700"
          >
            <ChevronLeft className="w-4 h-4" /> Wiki
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Left: Entry list ── */}
        <aside className={`${showMobileEntry ? 'hidden' : 'flex'} lg:flex flex-col w-full lg:w-60 xl:w-72 border-r border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex-shrink-0`}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              <BookText className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Wiki</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => importRef.current?.click()} title="Importar .md"
                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors">
                <Upload className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleNew} title="Nova entrada"
                className="p-1.5 rounded hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-500 hover:text-amber-700 transition-colors">
                <FilePlus className="w-3.5 h-3.5" />
              </button>
            </div>
            <input ref={importRef} type="file" accept=".md" className="hidden" onChange={handleImport} />
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar…"
                className="flex-1 text-sm bg-transparent outline-none text-gray-700 dark:text-gray-300 placeholder:text-gray-400"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Entries: D&D when not searching, plain list when searching */}
          {!search ? (
            <DragDropContext onDragEnd={handleReorder}>
              <Droppable droppableId="wiki-entries">
                {provided => (
                  <nav
                    className="flex-1 overflow-y-auto py-1"
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                  >
                    {sorted.length === 0 ? (
                      <div className="text-center py-10 px-4">
                        <BookText className="w-8 h-8 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                        <p className="text-xs text-gray-400 dark:text-gray-600">Nenhuma entrada ainda</p>
                        <button onClick={handleNew} className="mt-3 flex items-center gap-1.5 text-xs text-amber-500 hover:text-amber-700 mx-auto">
                          <Plus className="w-3.5 h-3.5" /> Criar primeira entrada
                        </button>
                      </div>
                    ) : (
                      sorted.map((entry, index) => (
                        <Draggable key={entry.id} draggableId={entry.id} index={index}>
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              className={`flex items-center border-l-2 transition-colors ${
                                selectedId === entry.id
                                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40'
                                  : 'border-transparent hover:bg-white dark:hover:bg-gray-800/60'
                              } ${snap.isDragging ? 'opacity-75 shadow-md rounded-r-lg' : ''}`}
                            >
                              <div
                                {...prov.dragHandleProps}
                                className="pl-2 pr-1 py-2.5 text-gray-300 hover:text-gray-400 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
                              >
                                <GripVertical className="w-3.5 h-3.5" />
                              </div>
                              <button
                                onClick={() => selectEntry(entry.id)}
                                className="flex-1 text-left py-2.5 pr-4 min-w-0"
                              >
                                <p className={`text-sm font-medium truncate ${
                                  selectedId === entry.id
                                    ? 'text-amber-700 dark:text-amber-300'
                                    : 'text-gray-700 dark:text-gray-300'
                                }`}>
                                  {entry.title}
                                </p>
                              </button>
                            </div>
                          )}
                        </Draggable>
                      ))
                    )}
                    {provided.placeholder}
                  </nav>
                )}
              </Droppable>
            </DragDropContext>
          ) : (
            <nav className="flex-1 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="text-center text-xs text-gray-400 dark:text-gray-600 py-10">Nenhum resultado</p>
              ) : (
                filtered.map(entry => (
                  <button
                    key={entry.id}
                    onClick={() => selectEntry(entry.id)}
                    className={`w-full text-left px-4 py-2.5 border-l-2 transition-colors ${
                      selectedId === entry.id
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500'
                        : 'border-transparent hover:bg-white dark:hover:bg-gray-800/60'
                    }`}
                  >
                    <p className={`text-sm font-medium truncate ${
                      selectedId === entry.id
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}>
                      {entry.title}
                    </p>
                  </button>
                ))
              )}
            </nav>
          )}

          {/* Sidebar footer */}
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
            <button onClick={handleNew}
              className="w-full flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Nova entrada
            </button>
          </div>
        </aside>

        {/* ── Right: Content area ── */}
        <main className={`${showMobileEntry ? 'flex' : 'hidden'} lg:flex flex-col flex-1 min-w-0 bg-white dark:bg-gray-900`}>
          {isEditing && editingEntry ? (
            <WikiEditor
              entry={editingEntry}
              onSave={handleSave}
              onCancel={() => handleCancel(editingEntry.id)}
              isNew={editingEntry.title === 'Nova entrada' && !editingEntry.content}
            />
          ) : selected ? (
            <WikiViewer
              entry={selected}
              onEdit={() => setEditingId(selected.id)}
              onDelete={() => handleDelete(selected.id)}
            />
          ) : (
            <WikiToc entries={sorted} onSelectEntry={selectEntry} onNew={handleNew} />
          )}
        </main>
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
