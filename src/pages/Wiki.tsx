import React, { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookText, Plus, Trash2, Edit2, X, Link2, ImagePlus,
  Bold, Italic, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Code, Minus, Download, Upload,
  Search, ChevronLeft, FilePlus, GripVertical, History,
  Settings, ChevronUp, ChevronDown, FolderPlus,
} from 'lucide-react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '@/contexts/AuthContext'
import { loadWikiEntries, saveWikiEntry, deleteWikiEntry, uploadWikiImage, generateId, getWikiEntryHistory, getWikiEntryAtVersion, loadWikiSections, saveWikiSections, logActivity, type WikiHistoryItem } from '@/lib/storage'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/toast'
import type { WikiEntry, WikiSection } from '@/types'

function groupBySections(
  entries: WikiEntry[],
  sections: WikiSection[],
): Array<{ section: WikiSection | null; id: string; items: WikiEntry[] }> {
  const sorted = [...sections].sort((a, b) => a.order - b.order)
  const map = new Map<string, WikiEntry[]>()
  for (const s of sorted) map.set(s.id, [])
  map.set('__none__', [])
  for (const e of entries) {
    const sec = e.category ? sorted.find(s => s.id === e.category || s.name === e.category) : null
    const key = sec ? sec.id : '__none__'
    map.get(key)!.push(e)
  }
  // sort entries within each section by order
  for (const [, list] of map) list.sort((a, b) => a.order - b.order)
  const result: Array<{ section: WikiSection | null; id: string; items: WikiEntry[] }> = []
  for (const s of sorted) {
    const items = map.get(s.id)!
    result.push({ section: s, id: s.id, items })
  }
  const none = map.get('__none__')!
  if (none.length > 0) result.push({ section: null, id: '__none__', items: none })
  return result
}

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

// Allow data: URIs (demo mode uploads) and standard web schemes; block javascript:
function safeUrl(url: string): string {
  if (url.startsWith('data:image/')) return url
  if (/^(https?|mailto|tel):/i.test(url)) return url
  if (!url.includes(':')) return url // relative
  return ''
}

// Extract H1–H3 headings from raw markdown content
function extractHeadings(content: string): { level: number; text: string }[] {
  return content
    .split('\n')
    .flatMap(line => {
      const m = line.match(/^(#{1,3})\s+(.+)$/)
      return m ? [{ level: m[1].length, text: m[2].trim() }] : []
    })
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function childText(node: React.ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(childText).join('')
  if (node && typeof node === 'object' && 'props' in (node as object)) {
    return childText((node as React.ReactElement<{ children?: React.ReactNode }>).props.children)
  }
  return ''
}

// ─── Image with download button ───────────────────────────────────────────

const MIME_EXT: Record<string, string> = {
  jpeg: 'jpg', jpg: 'jpg', png: 'png', gif: 'gif', webp: 'webp', 'svg+xml': 'svg',
}
const MIME_LABEL: Record<string, string> = {
  jpeg: 'JPG', jpg: 'JPG', png: 'PNG', gif: 'GIF', webp: 'WebP', 'svg+xml': 'SVG',
}

function parseDataUri(src: string): { subtype: string; ext: string; label: string } | null {
  const m = src.match(/^data:image\/([^;]+);/)
  if (!m) return null
  const sub = m[1]
  return { subtype: sub, ext: MIME_EXT[sub] ?? sub, label: MIME_LABEL[sub] ?? sub.toUpperCase() }
}

function triggerAnchorDownload(href: string, filename: string) {
  const a = document.createElement('a')
  a.href = href; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

function canvasToPng(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth; c.height = img.naturalHeight
      const ctx = c.getContext('2d')
      if (!ctx) { reject(new Error('No context')); return }
      ctx.drawImage(img, 0, 0)
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('Load failed'))
    img.src = src
  })
}

function WikiImage({ src, alt }: { src?: string; alt?: string }) {
  const info = src ? parseDataUri(src) : null
  const baseName = (alt ?? 'imagem').replace(/\.[^.]+$/, '')

  function downloadOriginal() {
    if (!src) return
    if (!info) { window.open(src, '_blank'); return }
    triggerAnchorDownload(src, `${baseName}.${info.ext}`)
  }

  function downloadPng() {
    if (!src || !info) return
    if (info.ext === 'png') {
      triggerAnchorDownload(src, `${baseName}.png`)
    } else {
      canvasToPng(src)
        .then(png => triggerAnchorDownload(png, `${baseName}.png`))
        .catch(() => triggerAnchorDownload(src, `${baseName}.png`))
    }
  }

  const btnCls = 'flex items-center gap-1 px-2 py-1 text-xs font-medium bg-black/60 hover:bg-black/80 text-white rounded backdrop-blur-sm transition-colors'

  return (
    <span className="relative block group my-3">
      <img src={src ?? ''} alt={alt ?? ''} className="max-w-full rounded-lg shadow-sm" />
      <span className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
        {info && info.ext !== 'png' && (
          <button type="button" onClick={downloadPng} title="Baixar como PNG" className={btnCls}>
            <Download className="w-3 h-3" /> PNG
          </button>
        )}
        <button type="button" onClick={downloadOriginal} title={info ? `Baixar ${info.label}` : 'Abrir imagem'} className={btnCls}>
          <Download className="w-3 h-3" /> {info?.label ?? 'Baixar'}
        </button>
      </span>
    </span>
  )
}

function MdPreview({ content }: { content: string }) {
  if (!content.trim()) {
    return <p className="text-sm text-gray-300 dark:text-gray-600 italic">O preview aparece aqui…</p>
  }
  return (
    <div className={PROSE_CLS}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={safeUrl}
        components={{
          img: ({ src, alt }) => <WikiImage src={src} alt={alt} />,
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

function WikiEditor({ entry, sections, onSave, onCancel, isNew }: {
  entry: WikiEntry
  sections: WikiSection[]
  onSave: (e: WikiEntry) => Promise<void>
  onCancel: () => void
  isNew: boolean
}) {
  const [title, setTitle] = useState(entry.title === 'Nova entrada' && isNew ? '' : entry.title)
  const [category, setCategory] = useState(entry.category ?? '')
  const [description, setDescription] = useState(entry.description ?? '')
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
    await onSave({
      ...entry,
      title: title.trim(),
      content: content.trim(),
      category: category || undefined,
      description: description.trim() || undefined,
    })
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
      {/* Title + metadata */}
      <div className="px-6 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0 space-y-2">
        <input
          ref={titleRef}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Título da entrada…"
          className="w-full text-2xl font-bold text-gray-900 dark:text-white bg-transparent outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600"
        />
        <div className="flex flex-wrap gap-3">
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 outline-none focus:border-amber-400"
          >
            <option value="">Sem seção</option>
            {[...sections].sort((a, b) => a.order - b.order).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Descrição breve (aparece no índice)…"
            className="flex-1 min-w-48 text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 outline-none focus:border-amber-400 placeholder:text-gray-300 dark:placeholder:text-gray-600"
          />
        </div>
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

// ─── History Dialog ───────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  } catch { return iso }
}

function HistoryDialog({ entry, onClose, onRestored }: {
  entry: WikiEntry
  onClose: () => void
  onRestored: (updated: WikiEntry) => void
}) {
  const { session } = useAuth()
  const { toast } = useToast()
  const [selectedSha, setSelectedSha] = useState<string | null>(null)
  const [preview, setPreview] = useState<WikiEntry | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['wiki-history', entry.id],
    queryFn: () => getWikiEntryHistory(entry.id),
    staleTime: 0,
  })

  async function selectVersion(item: WikiHistoryItem) {
    if (item.sha === selectedSha) return
    setSelectedSha(item.sha)
    setLoadingPreview(true)
    setPreview(null)
    try {
      const old = await getWikiEntryAtVersion(entry.id, item.sha)
      setPreview(old)
    } catch {
      toast({ title: 'Erro ao carregar versão', variant: 'destructive' })
    } finally {
      setLoadingPreview(false)
    }
  }

  async function handleRestore() {
    if (!preview) return
    setRestoring(true)
    try {
      const restored: WikiEntry = {
        ...entry,
        title: preview.title,
        content: preview.content,
        updated_at: new Date().toISOString(),
        updated_by: session?.email ?? '',
      }
      await saveWikiEntry(restored)
      onRestored(restored)
    } catch {
      toast({ title: 'Erro ao restaurar versão', variant: 'destructive' })
      setRestoring(false)
    }
  }

  const isCurrentIdx = history.findIndex(h => h.sha === selectedSha)

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0 gap-0 overflow-hidden dark:bg-gray-900 dark:border-gray-800">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <DialogTitle className="text-base font-semibold dark:text-white flex items-center gap-2">
            <History className="w-4 h-4 text-amber-500" />
            Histórico · <span className="font-normal text-gray-500 dark:text-gray-400">{entry.title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Version list */}
          <div className="w-64 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-10">
                <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10 px-4 leading-relaxed">
                Nenhuma versão anterior encontrada
              </p>
            ) : (
              <ul className="py-1">
                {history.map((item, idx) => (
                  <li key={item.sha}>
                    <button
                      onClick={() => selectVersion(item)}
                      className={`w-full text-left px-4 py-3 transition-colors border-l-2 ${
                        selectedSha === item.sha
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40'
                          : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <code className="text-[11px] text-gray-400">{item.shortSha}</code>
                        {idx === 0 && (
                          <span className="text-[10px] px-1.5 py-px rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 font-medium leading-tight">
                            atual
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-300 truncate">{item.author}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{fmtDate(item.date)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Preview panel */}
          <div className="flex-1 flex flex-col min-w-0">
            {!selectedSha ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                Selecione uma versão para visualizar
              </div>
            ) : loadingPreview ? (
              <div className="flex justify-center items-center h-full">
                <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : preview ? (
              <>
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{preview.title}</h2>
                  {preview.content ? (
                    <div className={PROSE_CLS}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={safeUrl}>
                        {preview.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">Sem conteúdo nesta versão.</p>
                  )}
                </div>
                {isCurrentIdx !== 0 && (
                  <div className="flex-shrink-0 flex justify-end border-t border-gray-100 dark:border-gray-800 px-6 py-3">
                    <Button
                      onClick={handleRestore}
                      disabled={restoring}
                      className="bg-amber-500 hover:bg-amber-600 text-white text-sm"
                    >
                      {restoring ? 'Restaurando…' : 'Restaurar esta versão'}
                    </Button>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── In-article TOC ───────────────────────────────────────────────────────

function ArticleToc({ headings }: { headings: { level: number; text: string }[] }) {
  const [open, setOpen] = useState(true)
  if (headings.length < 2) return null

  function scrollTo(text: string) {
    const id = `wiki-h-${slugify(text)}`
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="mb-6 border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden text-sm not-prose">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/60 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <List className="w-3 h-3" />
          Conteúdo
        </span>
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <nav className="px-3 py-2 space-y-1">
          {headings.map((h, i) => (
            <button
              key={i}
              onClick={() => scrollTo(h.text)}
              style={{ paddingLeft: `${(h.level - 1) * 12}px` }}
              className="block text-left text-xs text-amber-700 dark:text-amber-400 hover:underline leading-snug"
            >
              {h.text}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}

// Heading components that inject scroll-target IDs
const wikiHeadingComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => {
    const id = `wiki-h-${slugify(childText(children))}`
    return <h1 id={id}>{children}</h1>
  },
  h2: ({ children }: { children?: React.ReactNode }) => {
    const id = `wiki-h-${slugify(childText(children))}`
    return <h2 id={id}>{children}</h2>
  },
  h3: ({ children }: { children?: React.ReactNode }) => {
    const id = `wiki-h-${slugify(childText(children))}`
    return <h3 id={id}>{children}</h3>
  },
}

// ─── Wiki Viewer ──────────────────────────────────────────────────────────

function WikiViewer({ entry, onEdit, onDelete, onRestore }: {
  entry: WikiEntry
  onEdit: () => void
  onDelete: () => void
  onRestore: (updated: WikiEntry) => void
}) {
  const [showHistory, setShowHistory] = useState(false)
  const headings = extractHeadings(entry.content)

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
      {showHistory && (
        <HistoryDialog
          entry={entry}
          onClose={() => setShowHistory(false)}
          onRestored={updated => { setShowHistory(false); onRestore(updated) }}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex-1 min-w-0 pr-4">{entry.title}</h1>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowHistory(true)}
            title="Histórico de versões"
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 bg-gray-100 dark:bg-gray-800 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
          >
            <History className="w-3 h-3" />
            Histórico
          </button>
          <div className="flex items-center gap-1">
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {entry.content.trim() ? (
          <>
            <ArticleToc headings={headings} />
            <div className={PROSE_CLS}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                urlTransform={safeUrl}
                components={{
                  img: ({ src, alt }) => <WikiImage src={src} alt={alt} />,
                  ...wikiHeadingComponents,
                }}
              >
                {entry.content}
              </ReactMarkdown>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-300 dark:text-gray-600 italic">Sem conteúdo. Clique em Editar para começar.</p>
        )}
      </div>
    </div>
  )
}

// ─── Section banners (abstract wave patterns) ────────────────────────────

const SECTION_BANNERS: Array<(uid: string) => React.ReactElement> = [
  // 0 – Amber + Ocean Blue
  (u) => (
    <svg viewBox="0 0 1200 64" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
      <defs>
        <linearGradient id={`${u}a`} x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fbbf24"/><stop offset="100%" stopColor="#d97706"/>
        </linearGradient>
        <linearGradient id={`${u}b`} x1="1200" y1="0" x2="600" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e40af"/><stop offset="100%" stopColor="#3b82f6"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="64" fill={`url(#${u}a)`}/>
      <path d="M 1200 0 C 920 0 780 45 600 64 L 1200 64 Z" fill={`url(#${u}b)`}/>
      <path d="M 1200 0 C 1060 12 930 4 830 0 Z" fill="white" fillOpacity="0.35"/>
    </svg>
  ),
  // 1 – Amber + Teal
  (u) => (
    <svg viewBox="0 0 1200 64" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
      <defs>
        <linearGradient id={`${u}a`} x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f59e0b"/><stop offset="100%" stopColor="#b45309"/>
        </linearGradient>
        <linearGradient id={`${u}b`} x1="1200" y1="0" x2="530" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0f766e"/><stop offset="100%" stopColor="#14b8a6"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="64" fill={`url(#${u}a)`}/>
      <path d="M 1200 0 C 880 5 720 52 530 64 L 1200 64 Z" fill={`url(#${u}b)`}/>
      <path d="M 1200 0 C 1070 10 940 3 840 0 Z" fill="#67e8f9" fillOpacity="0.45"/>
    </svg>
  ),
  // 2 – Amber + Violet
  (u) => (
    <svg viewBox="0 0 1200 64" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
      <defs>
        <linearGradient id={`${u}a`} x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fcd34d"/><stop offset="100%" stopColor="#f59e0b"/>
        </linearGradient>
        <linearGradient id={`${u}b`} x1="0" y1="64" x2="600" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6d28d9"/><stop offset="100%" stopColor="#8b5cf6"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="64" fill={`url(#${u}a)`}/>
      <path d="M 0 64 C 200 64 380 10 600 0 L 0 0 Z" fill={`url(#${u}b)`}/>
      <path d="M 0 64 C 120 55 240 64 380 64 Z" fill="#c4b5fd" fillOpacity="0.5"/>
    </svg>
  ),
  // 3 – Amber + Indigo
  (u) => (
    <svg viewBox="0 0 1200 64" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
      <defs>
        <linearGradient id={`${u}a`} x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fde68a"/><stop offset="100%" stopColor="#f59e0b"/>
        </linearGradient>
        <linearGradient id={`${u}b`} x1="1200" y1="64" x2="580" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#312e81"/><stop offset="100%" stopColor="#4f46e5"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="64" fill={`url(#${u}a)`}/>
      <path d="M 1200 64 C 950 64 780 8 580 0 L 1200 0 Z" fill={`url(#${u}b)`}/>
      <path d="M 1200 64 C 1060 55 940 64 800 64 Z" fill="#a5b4fc" fillOpacity="0.45"/>
    </svg>
  ),
  // 4 – Amber + Rose
  (u) => (
    <svg viewBox="0 0 1200 64" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
      <defs>
        <linearGradient id={`${u}a`} x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fcd34d"/><stop offset="100%" stopColor="#f59e0b"/>
        </linearGradient>
        <linearGradient id={`${u}b`} x1="0" y1="0" x2="680" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#9f1239"/><stop offset="100%" stopColor="#f43f5e"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="64" fill={`url(#${u}a)`}/>
      <path d="M 0 0 C 280 0 430 64 680 64 L 0 64 Z" fill={`url(#${u}b)`}/>
      <path d="M 0 0 C 170 12 310 2 440 0 Z" fill="#fda4af" fillOpacity="0.5"/>
    </svg>
  ),
  // 5 – Amber + Cobalt
  (u) => (
    <svg viewBox="0 0 1200 64" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
      <defs>
        <linearGradient id={`${u}a`} x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fef3c7"/><stop offset="50%" stopColor="#fbbf24"/><stop offset="100%" stopColor="#d97706"/>
        </linearGradient>
        <linearGradient id={`${u}b`} x1="1200" y1="0" x2="700" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e3a8a"/><stop offset="100%" stopColor="#2563eb"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="64" fill={`url(#${u}a)`}/>
      <path d="M 1200 0 C 960 10 840 38 700 64 L 1200 64 Z" fill={`url(#${u}b)`}/>
      <path d="M 1200 0 C 1100 8 980 0 880 0 Z" fill="#bfdbfe" fillOpacity="0.6"/>
    </svg>
  ),
  // 6 – Amber + Forest Green
  (u) => (
    <svg viewBox="0 0 1200 64" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
      <defs>
        <linearGradient id={`${u}a`} x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fbbf24"/><stop offset="100%" stopColor="#d97706"/>
        </linearGradient>
        <linearGradient id={`${u}b`} x1="0" y1="64" x2="800" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#14532d"/><stop offset="100%" stopColor="#16a34a"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="64" fill={`url(#${u}a)`}/>
      <path d="M 0 64 C 320 64 530 5 800 0 L 0 0 Z" fill={`url(#${u}b)`}/>
      <path d="M 0 64 C 200 58 360 64 520 64 Z" fill="#86efac" fillOpacity="0.5"/>
    </svg>
  ),
  // 7 – Amber + Deep Purple/Pink
  (u) => (
    <svg viewBox="0 0 1200 64" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
      <defs>
        <linearGradient id={`${u}a`} x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fcd34d"/><stop offset="100%" stopColor="#fbbf24"/>
        </linearGradient>
        <linearGradient id={`${u}b`} x1="1200" y1="0" x2="650" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4a044e"/><stop offset="100%" stopColor="#9333ea"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="64" fill={`url(#${u}a)`}/>
      <path d="M 1200 0 C 1000 0 820 32 650 64 L 1200 64 Z" fill={`url(#${u}b)`}/>
      <path d="M 1200 0 C 1090 14 970 5 870 0 Z" fill="#f0abfc" fillOpacity="0.5"/>
    </svg>
  ),
  // 8 – Amber + Coral
  (u) => (
    <svg viewBox="0 0 1200 64" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
      <defs>
        <linearGradient id={`${u}a`} x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f59e0b"/><stop offset="100%" stopColor="#92400e"/>
        </linearGradient>
        <linearGradient id={`${u}b`} x1="0" y1="0" x2="610" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#c2410c"/><stop offset="100%" stopColor="#f97316"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="64" fill={`url(#${u}a)`}/>
      <path d="M 0 0 C 230 0 370 58 610 64 L 0 64 Z" fill={`url(#${u}b)`}/>
      <path d="M 0 0 C 160 12 300 2 440 0 Z" fill="#fed7aa" fillOpacity="0.6"/>
    </svg>
  ),
  // 9 – Amber + Emerald
  (u) => (
    <svg viewBox="0 0 1200 64" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
      <defs>
        <linearGradient id={`${u}a`} x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fde68a"/><stop offset="100%" stopColor="#fbbf24"/>
        </linearGradient>
        <linearGradient id={`${u}b`} x1="0" y1="64" x2="820" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#064e3b"/><stop offset="100%" stopColor="#059669"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="64" fill={`url(#${u}a)`}/>
      <path d="M 0 64 C 350 64 560 0 820 0 L 0 0 Z" fill={`url(#${u}b)`}/>
      <path d="M 0 64 C 230 56 400 64 560 64 Z" fill="#6ee7b7" fillOpacity="0.5"/>
    </svg>
  ),
]

function SectionBanner({ section, fallbackIdx = 0 }: { section: WikiSection; fallbackIdx?: number }) {
  const idx = (section.banner !== undefined ? section.banner : fallbackIdx) % SECTION_BANNERS.length
  return (
    <div className="h-12 rounded-xl overflow-hidden mb-3" aria-hidden="true">
      {SECTION_BANNERS[idx](section.id)}
    </div>
  )
}

// ─── Table of Contents (home view) ───────────────────────────────────────

const HEADING_INDENT: Record<number, string> = {
  1: 'pl-0',
  2: 'pl-3',
  3: 'pl-6',
}

function WikiTocEntry({ entry, idx, onSelectEntry }: { entry: WikiEntry; idx: number; onSelectEntry: (id: string) => void }) {
  const headings = extractHeadings(entry.content)
  const [expanded, setExpanded] = useState(false)
  return (
    <li>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onSelectEntry(entry.id)}
          className="flex items-baseline gap-3 text-left flex-1 min-w-0 py-1.5 px-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/30 group transition-colors"
        >
          <span className="text-xs text-gray-400 dark:text-gray-600 w-5 text-right flex-shrink-0 tabular-nums">
            {idx + 1}.
          </span>
          <span className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-400 group-hover:underline">
              {entry.title}
            </span>
            {entry.description && (
              <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{entry.description}</span>
            )}
          </span>
        </button>
        {headings.length > 0 && (
          <button
            onClick={() => setExpanded(v => !v)}
            title={expanded ? 'Ocultar seções' : 'Ver seções'}
            className="p-1 flex-shrink-0 rounded text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>
      {expanded && headings.length > 0 && (
        <ul className="mt-0.5 mb-1 space-y-0.5 border-l border-gray-100 dark:border-gray-800 ml-7 pl-2">
          {headings.map((h, j) => (
            <li key={j}>
              <button
                onClick={() => onSelectEntry(entry.id)}
                className={`flex items-center text-left w-full py-0.5 rounded text-xs text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors ${HEADING_INDENT[h.level] ?? ''}`}
              >
                <span className="truncate">{h.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function WikiToc({ entries, sections, onSelectEntry, onNew }: {
  entries: WikiEntry[]
  sections: WikiSection[]
  onSelectEntry: (id: string) => void
  onNew: () => void
}) {
  const groups = groupBySections(entries, sections)
  const hasSections = groups.some(g => g.section !== null)
  let globalIdx = 0

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
        ) : hasSections ? (
          <div className="space-y-8">
            {groups.map(({ section, id, items }, groupIdx) => {
              const start = globalIdx
              globalIdx += items.length
              return (
                <section key={id}>
                  {section && (
                    <>
                      <SectionBanner section={section} fallbackIdx={groupIdx} />
                      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3 pb-1 border-b border-gray-100 dark:border-gray-800">
                        {section.name}
                      </h2>
                    </>
                  )}
                  {!section && hasSections && (
                    <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3 pb-1 border-b border-gray-100 dark:border-gray-800">
                      Sem seção
                    </h2>
                  )}
                  <ol className="space-y-2">
                    {items.map((entry, i) => (
                      <WikiTocEntry key={entry.id} entry={entry} idx={start + i} onSelectEntry={onSelectEntry} />
                    ))}
                  </ol>
                </section>
              )
            })}
          </div>
        ) : (
          <ol className="space-y-3">
            {entries.map((entry, i) => (
              <WikiTocEntry key={entry.id} entry={entry} idx={i} onSelectEntry={onSelectEntry} />
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

// ─── Sections manager dialog ───────────────────────────────────────────────

function SectionsDialog({ sections, onClose, onSave }: {
  sections: WikiSection[]
  onClose: () => void
  onSave: (sections: WikiSection[]) => Promise<void>
}) {
  const [list, setList] = useState(() => [...sections].sort((a, b) => a.order - b.order))
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  function addSection() {
    const name = newName.trim()
    if (!name) return
    setList(prev => {
      const lastBanner = prev.length > 0 ? (prev[prev.length - 1].banner ?? prev.length - 1) : -1
      const nextBanner = (lastBanner + 1) % SECTION_BANNERS.length
      return [...prev, { id: generateId(), name, order: prev.length, banner: nextBanner }]
    })
    setNewName('')
  }

  function rename(id: string, name: string) {
    setList(prev => prev.map(s => s.id === id ? { ...s, name } : s))
  }

  function remove(id: string) {
    setList(prev => prev.filter(s => s.id !== id).map((s, i) => ({ ...s, order: i })))
  }

  function move(id: string, dir: -1 | 1) {
    setList(prev => {
      const idx = prev.findIndex(s => s.id === id)
      const next = idx + dir
      if (next < 0 || next >= prev.length) return prev
      const arr = [...prev]
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return arr.map((s, i) => ({ ...s, order: i }))
    })
  }

  async function handleSave() {
    setSaving(true)
    await onSave(list.map((s, i) => ({ ...s, order: i })))
    setSaving(false)
    onClose()
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-md dark:bg-gray-900 dark:border-gray-800">
        <DialogHeader>
          <DialogTitle>Gerenciar Seções</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 max-h-80 overflow-y-auto py-1">
          {list.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Nenhuma seção ainda</p>
          )}
          {list.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 group">
              <input
                value={s.name}
                onChange={e => rename(s.id, e.target.value)}
                className="flex-1 text-sm bg-transparent outline-none border-b border-transparent focus:border-amber-400 text-gray-800 dark:text-gray-200 py-0.5"
              />
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => move(s.id, -1)} disabled={i === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-20">
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => move(s.id, 1)} disabled={i === list.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-20">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => remove(s.id)} className="p-1 text-gray-400 hover:text-red-500">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-1 border-t border-gray-100 dark:border-gray-800">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addSection() }}
            placeholder="Nova seção…"
            className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 outline-none focus:border-amber-400 placeholder:text-gray-300 dark:placeholder:text-gray-600"
          />
          <Button size="sm" variant="outline" onClick={addSection} disabled={!newName.trim()}>
            <FolderPlus className="w-3.5 h-3.5" />
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-white">
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  const { data: sections = [], isLoading: sectionsLoading } = useQuery({
    queryKey: ['wiki-sections'],
    queryFn: loadWikiSections,
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showMobileEntry, setShowMobileEntry] = useState(false)
  const [showSections, setShowSections] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  // sorted within sections: primary sort by section order, secondary by entry order
  const groups = groupBySections(entries, sections)
  const sorted = groups.flatMap(g => g.items)
  const filtered = (search
    ? entries.filter(e =>
        e.title.toLowerCase().includes(search.toLowerCase()) ||
        e.content.toLowerCase().includes(search.toLowerCase())
      ).sort((a, b) => a.order - b.order)
    : sorted
  )

  const selected = entries.find(e => e.id === selectedId) ?? null
  const isEditing = editingId !== null
  const editingEntry = entries.find(e => e.id === editingId) ?? null

  function selectEntry(id: string) {
    setSelectedId(id)
    setEditingId(null)
    setShowMobileEntry(true)
  }

  async function handleSaveSections(updated: WikiSection[]) {
    queryClient.setQueryData(['wiki-sections'], updated)
    try {
      await saveWikiSections(updated)
      toast({ title: 'Seções salvas' })
      logActivity({ actor: session?.email ?? '', module: 'Wiki', action: 'update', description: `${session?.email} atualizou as seções do Wiki` })
    } catch {
      queryClient.invalidateQueries({ queryKey: ['wiki-sections'] })
      toast({ title: 'Erro ao salvar seções', variant: 'destructive' })
    }
  }

  function handleNew() {
    const now = new Date().toISOString()
    const inheritedCategory = selected?.category
    const sectionGroup = groups.find(g => g.items.some(e => e.id === selected?.id))
    const sectionOrder = sectionGroup ? sectionGroup.items.length : entries.length
    const newEntry: WikiEntry = {
      id: generateId(),
      title: 'Nova entrada',
      content: '',
      category: inheritedCategory,
      order: sectionOrder,
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
    const isNew = !entries.find(e => e.id === toSave.id)
    try {
      await saveWikiEntry(toSave)
      queryClient.setQueryData(['wiki'], (prev: WikiEntry[] = []) => {
        const exists = prev.find(e => e.id === toSave.id)
        return exists ? prev.map(e => e.id === toSave.id ? toSave : e) : [...prev, toSave]
      })
      setEditingId(null)
      toast({ title: 'Entrada salva' })
      logActivity({
        actor: session?.email ?? '',
        module: 'Wiki',
        action: isNew ? 'create' : 'update',
        description: `${session?.email} ${isNew ? 'criou' : 'atualizou'} a entrada "${toSave.title}" no Wiki`,
      })
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' })
    }
  }

  async function handleDelete(id: string) {
    const entry = entries.find(e => e.id === id)
    try {
      await deleteWikiEntry(id)
      queryClient.setQueryData(['wiki'], (prev: WikiEntry[] = []) => prev.filter(e => e.id !== id))
      if (selectedId === id) { setSelectedId(null); setShowMobileEntry(false) }
      toast({ title: 'Entrada removida' })
      if (entry) logActivity({ actor: session?.email ?? '', module: 'Wiki', action: 'delete', description: `${session?.email} removeu a entrada "${entry.title}" do Wiki` })
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
    if (!result.destination) return
    const { source, destination, draggableId } = result

    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    if (source.droppableId !== destination.droppableId) {
      // Moving between sections: update category and recompute orders per section
      const destGroupId = destination.droppableId
      const newGroups = groups.map(g => {
        if (g.id === source.droppableId) {
          return { ...g, items: g.items.filter(e => e.id !== draggableId) }
        }
        if (g.id === destGroupId) {
          const entry = entries.find(e => e.id === draggableId)!
          const newItems = [...g.items]
          newItems.splice(destination.index, 0, entry)
          return { ...g, items: newItems }
        }
        return g
      })
      const toSave: WikiEntry[] = []
      for (const g of newGroups) {
        const newCat = g.section ? g.section.id : undefined
        g.items.forEach((e, i) => toSave.push({ ...e, category: newCat, order: i }))
      }
      queryClient.setQueryData(['wiki'], toSave)
      const changed = toSave.filter(e => {
        const orig = entries.find(x => x.id === e.id)
        return orig && (orig.order !== e.order || orig.category !== e.category)
      })
      try {
        await Promise.all(changed.map(e => saveWikiEntry(e)))
      } catch {
        toast({ title: 'Erro ao reordenar', variant: 'destructive' })
        queryClient.setQueryData(['wiki'], entries)
      }
    } else {
      // Moving within same section
      const group = groups.find(g => g.id === source.droppableId)
      if (!group) return
      const newItems = [...group.items]
      const [moved] = newItems.splice(source.index, 1)
      newItems.splice(destination.index, 0, moved)
      const updatedItems = newItems.map((e, i) => ({ ...e, order: i }))
      const updatedEntries = entries.map(e => updatedItems.find(u => u.id === e.id) ?? e)
      queryClient.setQueryData(['wiki'], updatedEntries)
      const changed = updatedItems.filter(e => {
        const orig = entries.find(x => x.id === e.id)
        return orig && orig.order !== e.order
      })
      try {
        await Promise.all(changed.map(e => saveWikiEntry(e)))
      } catch {
        toast({ title: 'Erro ao reordenar', variant: 'destructive' })
        queryClient.setQueryData(['wiki'], entries)
      }
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

  if (isLoading || sectionsLoading) return (
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
              {session?.isAdmin && (
                <button onClick={() => setShowSections(true)} title="Gerenciar seções"
                  className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors">
                  <Settings className="w-3.5 h-3.5" />
                </button>
              )}
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

          {/* Fixed: Índice (ToC) entry — always at top, never draggable */}
          <div className="flex-shrink-0">
            <button
              onClick={() => { setSelectedId(null); setEditingId(null); setShowMobileEntry(true) }}
              className={`w-full text-left flex items-center gap-2 px-4 py-2.5 border-l-2 transition-colors ${
                selectedId === null
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                  : 'border-transparent hover:bg-white dark:hover:bg-gray-800/60 text-gray-600 dark:text-gray-400'
              }`}
            >
              <BookText className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
              <span className="text-sm font-medium">Índice</span>
            </button>
            <div className="border-b border-gray-100 dark:border-gray-800 mx-0" />
          </div>

          {/* Entries: D&D when not searching, plain list when searching */}
          {!search ? (
            <DragDropContext onDragEnd={handleReorder}>
              <nav className="flex-1 overflow-y-auto py-1">
                {sorted.length === 0 ? (
                  <div className="text-center py-10 px-4">
                    <BookText className="w-8 h-8 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                    <p className="text-xs text-gray-400 dark:text-gray-600">Nenhuma entrada ainda</p>
                    <button onClick={handleNew} className="mt-3 flex items-center gap-1.5 text-xs text-amber-500 hover:text-amber-700 mx-auto">
                      <Plus className="w-3.5 h-3.5" /> Criar primeira entrada
                    </button>
                  </div>
                ) : groups.map(({ section, id, items }) => (
                  <div key={id}>
                    {section ? (
                      <div className="px-4 pt-3 pb-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600 truncate">
                          {section.name}
                        </p>
                      </div>
                    ) : groups.length > 1 ? (
                      <div className="px-4 pt-3 pb-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 dark:text-gray-700 truncate">
                          Sem seção
                        </p>
                      </div>
                    ) : null}
                    <Droppable droppableId={id}>
                      {provided => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className="min-h-[4px]">
                          {items.map((entry, index) => (
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
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                ))}
              </nav>
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
              sections={sections}
              onSave={handleSave}
              onCancel={() => handleCancel(editingEntry.id)}
              isNew={editingEntry.title === 'Nova entrada' && !editingEntry.content}
            />
          ) : selected ? (
            <WikiViewer
              entry={selected}
              onEdit={() => setEditingId(selected.id)}
              onDelete={() => handleDelete(selected.id)}
              onRestore={updated => {
                queryClient.setQueryData(['wiki'], (prev: WikiEntry[] = []) =>
                  prev.map(e => e.id === updated.id ? updated : e)
                )
                toast({ title: 'Versão restaurada com sucesso' })
              }}
            />
          ) : (
            <WikiToc entries={sorted} sections={sections} onSelectEntry={selectEntry} onNew={handleNew} />
          )}
        </main>
      </div>

      {showSections && (
        <SectionsDialog
          sections={sections}
          onClose={() => setShowSections(false)}
          onSave={handleSaveSections}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
