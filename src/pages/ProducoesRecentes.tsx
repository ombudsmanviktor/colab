import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookMarked, Plus, Download, Trash2, Mail, Edit2, X, Upload, FileText, Users, Calendar,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { loadProducoes, saveProducao, deleteProducao, loadUsersIndex, generateId } from '@/lib/storage'
import { extractPdfMetadata } from '@/lib/pdfExtract'
import { sendLeituraNotification } from '@/lib/emailjs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/toast'
import { useFileDrop } from '@/hooks/useFileDrop'
import type { Producao } from '@/types'

// ─── Name normalization ────────────────────────────────────────────────────
// All names are stored internally in ABNT format: "Sobrenome, Prenome"

function toAbntName(raw: string): string {
  const s = raw.trim()
  if (!s) return s
  if (s.includes(',')) {
    const [last, ...rest] = s.split(',')
    return `${last.trim()}, ${rest.join(',').trim()}`
  }
  const parts = s.split(/\s+/)
  if (parts.length === 1) return parts[0]
  const last = parts[parts.length - 1]
  const first = parts.slice(0, -1).join(' ')
  return `${last}, ${first}`
}

function toDisplayName(abnt: string): string {
  if (!abnt.includes(',')) return abnt
  const comma = abnt.indexOf(',')
  const last = abnt.slice(0, comma).trim()
  const first = abnt.slice(comma + 1).trim()
  return first ? `${first} ${last}` : last
}

function parseRawAuthors(raw: string): string[] {
  return raw.split(';').map(a => toAbntName(a)).filter(Boolean)
}

// ─── Author pills ──────────────────────────────────────────────────────────

function AuthorPillToggle({
  abnt, isColab, onToggle,
}: { abnt: string; isColab: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={isColab ? 'Membro do coLAB · clique para desmarcar' : 'Externo · clique para marcar como membro do coLAB'}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
        isColab
          ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 ring-1 ring-amber-300 dark:ring-amber-700'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
      }`}
    >
      {isColab && <span className="text-amber-500 text-[10px]">◆</span>}
      {toDisplayName(abnt)}
    </button>
  )
}

function AuthorPillDisplay({
  abnt, isColab,
}: { abnt: string; isColab: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
      isColab
        ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 ring-1 ring-amber-200 dark:ring-amber-800'
        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
    }`}>
      {isColab && <span className="text-amber-400 text-[9px]">◆</span>}
      {toDisplayName(abnt)}
    </span>
  )
}

// Combined author input + pill preview with coLAB toggle
function AuthorsInput({
  raw, colabSet, onChange, onToggleColab,
}: {
  raw: string
  colabSet: Set<string>
  onChange: (v: string) => void
  onToggleColab: (abnt: string) => void
}) {
  const parsed = parseRawAuthors(raw)
  return (
    <div className="space-y-2">
      <Input
        value={raw}
        onChange={e => onChange(e.target.value)}
        placeholder="Prenome Sobrenome; Sobrenome, Prenome2; …"
      />
      {parsed.length > 0 && (
        <div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1.5">
            Clique para marcar/desmarcar como membro do coLAB <span className="text-amber-500">◆</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {parsed.map((abnt, i) => (
              <AuthorPillToggle
                key={i}
                abnt={abnt}
                isColab={colabSet.has(abnt)}
                onToggle={() => onToggleColab(abnt)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Grouping ──────────────────────────────────────────────────────────────

type GroupMode = 'author' | 'year'

function groupByAuthor(producoes: Producao[]): Map<string, { displayName: string; entries: Producao[] }> {
  const map = new Map<string, { displayName: string; entries: Producao[] }>()
  for (const p of producoes) {
    for (const a of p.authors) {
      if (!map.has(a)) map.set(a, { displayName: toDisplayName(a), entries: [] })
      map.get(a)!.entries.push(p)
    }
  }
  return new Map(
    [...map.entries()].sort((a, b) =>
      a[1].displayName.localeCompare(b[1].displayName, 'pt-BR', { sensitivity: 'base' })
    )
  )
}

function groupByYear(producoes: Producao[]): Map<string, Producao[]> {
  const map = new Map<string, Producao[]>()
  for (const p of producoes) {
    const y = p.year ?? 'Sem ano'
    if (!map.has(y)) map.set(y, [])
    map.get(y)!.push(p)
  }
  return new Map(
    [...map.entries()].sort((a, b) => {
      if (a[0] === 'Sem ano') return 1
      if (b[0] === 'Sem ano') return -1
      return b[0].localeCompare(a[0])
    })
  )
}

// ─── Bibliography formatters ───────────────────────────────────────────────

function formatABNT(p: Producao): string {
  const authors = p.authors
    .map(a => {
      if (!a.includes(',')) return a.toUpperCase()
      const [last, ...rest] = a.split(',')
      return `${last.trim().toUpperCase()}, ${rest.join(',').trim()}`
    })
    .join('; ')
  const year = p.year ? `. ${p.year}` : ''
  const source = p.source ? `. *${p.source}*` : ''
  return `${authors}${year}. **${p.title}**${source}.`
}

function formatBibText(p: Producao): string {
  const authors = p.authors.join('; ')
  const year = p.year ? ` (${p.year})` : ''
  const source = p.source ? `. ${p.source}` : ''
  return `${authors}${year}. ${p.title}${source}.`
}

// ─── Export ───────────────────────────────────────────────────────────────

function exportMarkdown(producoes: Producao[]) {
  const byYear = groupByYear(producoes)
  const lines = ['# Produções Recentes\n']
  for (const [year, items] of byYear.entries()) {
    lines.push(`## ${year}\n`)
    for (const p of items) lines.push(`- ${formatABNT(p)}`)
    lines.push('')
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'producoes.md'; a.click()
  URL.revokeObjectURL(url)
}

async function exportPDF(producoes: Producao[]) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' })
  const ml = 20, pageW = pdf.internal.pageSize.getWidth()
  let y = 20

  pdf.setFillColor(217, 119, 6)
  pdf.rect(0, 0, pageW, 12, 'F')
  pdf.setTextColor(255, 255, 255); pdf.setFontSize(8); pdf.setFont('helvetica', 'normal')
  pdf.text('coLAB · coLAB/UFF · Produções Recentes', ml, 8)
  y = 24

  const byYear = groupByYear(producoes)
  for (const [year, items] of byYear.entries()) {
    pdf.setFontSize(12); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(120, 53, 15)
    pdf.text(year, ml, y); y += 8
    for (const p of items) {
      const text = formatBibText(p)
      pdf.setFontSize(10); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(31, 41, 55)
      const lines = pdf.splitTextToSize(text, pageW - ml * 2) as string[]
      for (const line of lines) {
        if (y > 270) { pdf.addPage(); y = 20 }
        pdf.text(line, ml, y); y += 5
      }
      y += 3
    }
    y += 5
  }
  pdf.save('producoes.pdf')
}

async function exportDOCX(producoes: Producao[]) {
  const { Document, Paragraph, HeadingLevel, Packer, TextRun } = await import('docx')
  const children = []
  const byYear = groupByYear(producoes)
  for (const [year, items] of byYear.entries()) {
    children.push(new Paragraph({ text: year, heading: HeadingLevel.HEADING_2 }))
    for (const p of items) {
      children.push(new Paragraph({ children: [new TextRun(formatBibText(p))] }))
    }
    children.push(new Paragraph({ text: '' }))
  }
  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'producoes.docx'; a.click()
  URL.revokeObjectURL(url)
}

async function exportXLS(producoes: Producao[]) {
  const { utils, writeFile } = await import('xlsx')
  const rows = producoes.map(p => ({
    'Título': p.title,
    'Autores': p.authors.join('; '),
    'Membros coLAB': (p.colabAuthors ?? []).join('; '),
    'Ano': p.year ?? '',
    'Fonte': p.source ?? '',
    'Adicionado por': p.addedBy,
  }))
  const ws = utils.json_to_sheet(rows)
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, 'Produções')
  writeFile(wb, 'producoes.xlsx')
}

// ─── Upload Dialog ─────────────────────────────────────────────────────────

function UploadDialog({
  open, onClose, onSave, initialFile,
}: {
  open: boolean; onClose: () => void; onSave: (p: Producao) => Promise<void>
  initialFile?: File
}) {
  const { session } = useAuth()
  const [title, setTitle] = useState('')
  const [authorsRaw, setAuthorsRaw] = useState('')
  const [colabSet, setColabSet] = useState<Set<string>>(new Set())
  const [year, setYear] = useState('')
  const [source, setSource] = useState('')
  const [notes, setNotes] = useState('')
  const [url, setUrl] = useState('')
  const [pdfBase64, setPdfBase64] = useState<string | undefined>()
  const [pdfName, setPdfName] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const didProcess = useRef(false)

  function reset() {
    setTitle(''); setAuthorsRaw(''); setColabSet(new Set()); setYear(''); setSource('')
    setNotes(''); setUrl('')
    setPdfBase64(undefined); setPdfName(undefined)
    setLoading(false); setSaving(false)
    didProcess.current = false
  }

  function toggleColab(abnt: string) {
    setColabSet(prev => {
      const next = new Set(prev)
      next.has(abnt) ? next.delete(abnt) : next.add(abnt)
      return next
    })
  }

  async function processFile(file: File) {
    setLoading(true)
    setPdfName(file.name)
    try {
      const buffer = await file.arrayBuffer()
      const meta = await extractPdfMetadata(buffer)
      if (meta.title) setTitle(meta.title)
      if (meta.authors?.length) setAuthorsRaw(meta.authors.join('; '))
      if (meta.year) setYear(meta.year)
      if (meta.source) setSource(meta.source)
      const bytes = new Uint8Array(buffer)
      const binStr = Array.from(bytes, b => String.fromCodePoint(b)).join('')
      setPdfBase64(btoa(binStr))
    } catch {
      // metadata extraction failed
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) { didProcess.current = false; return }
    if (initialFile && !didProcess.current) {
      didProcess.current = true
      processFile(initialFile)
    }
  }, [open, initialFile]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const parsedAuthors = parseRawAuthors(authorsRaw)
  const canSave = title.trim() && parsedAuthors.length > 0

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    const now = new Date().toISOString()
    const producao: Producao = {
      id: generateId(),
      title: title.trim(),
      authors: parsedAuthors,
      colabAuthors: parsedAuthors.filter(a => colabSet.has(a)),
      year: year.trim() || undefined,
      source: source.trim() || undefined,
      notes: notes.trim() || undefined,
      url: url.trim() || undefined,
      pdfBase64,
      pdfName,
      addedBy: session?.email ?? '',
      createdAt: now,
    }
    await onSave(producao)
    reset()
    onClose()
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar Produção Recente</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* PDF Upload */}
          <div>
            <Label>Arquivo PDF (opcional)</Label>
            <div
              className="mt-1.5 border-2 border-dashed border-amber-200 dark:border-amber-800 rounded-lg p-4 text-center cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFile} />
              {loading ? (
                <div className="flex items-center justify-center gap-2 text-amber-600 text-sm">
                  <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  Extraindo metadados…
                </div>
              ) : pdfName ? (
                <div className="flex items-center justify-center gap-2 text-amber-700 text-sm">
                  <FileText className="w-4 h-4" /> {pdfName}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 text-gray-400">
                  <Upload className="w-6 h-6" />
                  <span className="text-sm">Clique para selecionar um PDF</span>
                  <span className="text-xs">Metadados serão extraídos automaticamente</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Título <span className="text-red-400">*</span></Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título da obra" />
          </div>

          <div className="space-y-1.5">
            <Label>
              Autores <span className="text-red-400">*</span>
              <span className="ml-2 text-xs font-normal text-gray-400">separados por ponto e vírgula</span>
            </Label>
            <AuthorsInput
              raw={authorsRaw}
              colabSet={colabSet}
              onChange={setAuthorsRaw}
              onToggleColab={toggleColab}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ano</Label>
              <Input value={year} onChange={e => setYear(e.target.value)} placeholder="2024" />
            </div>
            <div className="space-y-1.5">
              <Label>Periódico / Livro</Label>
              <Input value={source} onChange={e => setSource(e.target.value)} placeholder="Revista, editora…" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>URL (opcional)</Label>
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />
          </div>

          <div className="space-y-1.5">
            <Label>Notas (opcional)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observações…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose() }}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading || !canSave}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {saving ? 'Salvando…' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit Dialog ──────────────────────────────────────────────────────────

function EditDialog({ producao, onClose, onSave }: {
  producao: Producao; onClose: () => void; onSave: (p: Producao) => Promise<void>
}) {
  const [title, setTitle] = useState(producao.title)
  const [authorsRaw, setAuthorsRaw] = useState(producao.authors.join('; '))
  const [colabSet, setColabSet] = useState<Set<string>>(new Set(producao.colabAuthors ?? []))
  const [year, setYear] = useState(producao.year ?? '')
  const [source, setSource] = useState(producao.source ?? '')
  const [notes, setNotes] = useState(producao.notes ?? '')
  const [url, setUrl] = useState(producao.url ?? '')
  const [saving, setSaving] = useState(false)

  function toggleColab(abnt: string) {
    setColabSet(prev => {
      const next = new Set(prev)
      next.has(abnt) ? next.delete(abnt) : next.add(abnt)
      return next
    })
  }

  const parsedAuthors = parseRawAuthors(authorsRaw)
  const canSave = title.trim() && parsedAuthors.length > 0

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    await onSave({
      ...producao,
      title: title.trim(),
      authors: parsedAuthors,
      colabAuthors: parsedAuthors.filter(a => colabSet.has(a)),
      year: year.trim() || undefined,
      source: source.trim() || undefined,
      notes: notes.trim() || undefined,
      url: url.trim() || undefined,
    })
    setSaving(false)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar Produção</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Título <span className="text-red-400">*</span></Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>
              Autores <span className="text-red-400">*</span>
              <span className="ml-2 text-xs font-normal text-gray-400">separados por ponto e vírgula</span>
            </Label>
            <AuthorsInput
              raw={authorsRaw}
              colabSet={colabSet}
              onChange={setAuthorsRaw}
              onToggleColab={toggleColab}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ano</Label>
              <Input value={year} onChange={e => setYear(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Periódico / Livro</Label>
              <Input value={source} onChange={e => setSource(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>URL</Label>
            <Input value={url} onChange={e => setUrl(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !canSave} className="bg-amber-500 hover:bg-amber-600 text-white">
            {saving ? 'Salvando…' : 'Atualizar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Producao Card ────────────────────────────────────────────────────────

function ProducaoCard({ p, onDelete, onEdit, onEmail }: {
  p: Producao; onDelete: () => void; onEdit: () => void; onEmail: () => void
}) {
  const colabSet = new Set(p.colabAuthors ?? [])

  function downloadPdf() {
    if (!p.pdfBase64 || !p.pdfName) return
    const binStr = atob(p.pdfBase64)
    const bytes = new Uint8Array(binStr.length)
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = p.pdfName; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 flex items-start justify-between gap-3 hover:shadow-sm transition-shadow">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">{p.title}</p>

        {/* Author pills */}
        {p.authors.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {p.authors.map((a, i) => (
              <AuthorPillDisplay key={i} abnt={a} isColab={colabSet.has(a)} />
            ))}
            {p.year && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-50 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500 ring-1 ring-gray-200 dark:ring-gray-600">
                {p.year}
              </span>
            )}
          </div>
        )}

        {p.source && <p className="text-xs text-gray-400 dark:text-gray-500 italic mt-1">{p.source}</p>}
        {p.notes && <p className="text-xs text-gray-400 mt-1">{p.notes}</p>}

        <div className="flex items-center gap-2 mt-1.5">
          {p.url && (
            <a href={p.url} target="_blank" rel="noreferrer" className="text-xs text-amber-600 hover:underline">Link</a>
          )}
          {p.pdfBase64 && (
            <button onClick={downloadPdf} className="text-xs text-amber-600 hover:underline flex items-center gap-1">
              <FileText className="w-3 h-3" /> PDF
            </button>
          )}
          <span className="text-xs text-gray-300 dark:text-gray-600">por {p.addedBy}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} title="Editar" className="p-1.5 rounded hover:bg-amber-50 dark:hover:bg-amber-900/30 text-gray-300 hover:text-amber-500 transition-colors">
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onEmail} title="Enviar por email" className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-300 hover:text-blue-500 transition-colors">
          <Mail className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} title="Remover" className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-300 hover:text-red-400 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export function ProducoesRecentes() {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const { toasts, toast, dismiss } = useToast()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [dropFile, setDropFile] = useState<File | null>(null)
  const [editProducao, setEditProducao] = useState<Producao | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  const [groupMode, setGroupMode] = useState<GroupMode>('year')
  const [search, setSearch] = useState('')

  const isDragging = useFileDrop((file) => {
    setDropFile(file)
    setUploadOpen(true)
  })

  const { data: producoes = [], isLoading } = useQuery({
    queryKey: ['producoes'],
    queryFn: loadProducoes,
  })

  // Close export dropdown when clicking outside
  useEffect(() => {
    if (!exportOpen) return
    function onClickOut(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', onClickOut)
    return () => document.removeEventListener('mousedown', onClickOut)
  }, [exportOpen])

  const filtered = producoes.filter(p => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      p.title.toLowerCase().includes(q) ||
      p.authors.some(a => toDisplayName(a).toLowerCase().includes(q) || a.toLowerCase().includes(q)) ||
      (p.year ?? '').includes(q) ||
      (p.source ?? '').toLowerCase().includes(q)
    )
  })

  async function handleSave(p: Producao) {
    await saveProducao(p)
    queryClient.setQueryData(['producoes'], (prev: Producao[] = []) => {
      const exists = prev.find(x => x.id === p.id)
      return exists ? prev.map(x => x.id === p.id ? p : x) : [p, ...prev]
    })
    toast({ title: 'Produção salva' })
  }

  async function handleDelete(id: string) {
    await deleteProducao(id)
    queryClient.setQueryData(['producoes'], (prev: Producao[] = []) => prev.filter(x => x.id !== id))
    toast({ title: 'Produção removida' })
  }

  async function handleEmail(p: Producao) {
    try {
      const idx = await loadUsersIndex()
      const recipients = idx.emails.filter(e => e !== session?.email)
      await sendLeituraNotification({
        senderEmail: session?.email ?? '',
        recipientEmails: recipients,
        leituraTitle: p.title,
        leituraAuthors: p.authors.join('; '),
        leituraYear: p.year,
        leituraSource: p.source,
        meetingDate: '',
      })
      toast({ title: 'Notificação enviada' })
    } catch (err) {
      toast({ title: 'Erro ao enviar email', description: String(err), variant: 'destructive' })
    }
  }

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const byAuthor = groupByAuthor(filtered)
  const byYear = groupByYear(filtered)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Produções Recentes</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Produções bibliográficas do grupo</p>
        </div>
        <div className="flex items-center gap-2">
          {producoes.length > 0 && (
            <div className="relative" ref={exportRef}>
              <Button variant="outline" size="sm" onClick={() => setExportOpen(v => !v)}>
                <Download className="w-4 h-4" /> Exportar
              </Button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-30 py-1 min-w-[150px]">
                  {[
                    { label: 'Markdown', fn: () => exportMarkdown(filtered) },
                    { label: 'PDF', fn: () => exportPDF(filtered) },
                    { label: 'Word (DOCX)', fn: () => exportDOCX(filtered) },
                    { label: 'Excel (XLS)', fn: () => exportXLS(filtered) },
                  ].map(({ label, fn }) => (
                    <button key={label} onClick={() => { fn(); setExportOpen(false) }}
                      className="w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-left transition-colors">
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" onClick={() => setUploadOpen(true)}>
            <Plus className="w-4 h-4" /> Adicionar
          </Button>
        </div>
      </div>

      {/* Toolbar: search + group toggle */}
      {producoes.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por título, autor, ano…"
              className="text-sm"
            />
          </div>
          {search && (
            <button onClick={() => setSearch('')} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <X className="w-3 h-3" /> Limpar
            </button>
          )}
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-gray-50 dark:bg-gray-800">
            <button
              onClick={() => setGroupMode('year')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                groupMode === 'year'
                  ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" /> Por ano
            </button>
            <button
              onClick={() => setGroupMode('author')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                groupMode === 'author'
                  ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" /> Por autor
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {producoes.length === 0 ? (
        <div className="text-center py-16">
          <BookMarked className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-gray-500">Nenhuma produção cadastrada</p>
          <Button className="mt-4 bg-amber-500 hover:bg-amber-600 text-white" onClick={() => setUploadOpen(true)}>
            <Plus className="w-4 h-4" /> Adicionar primeira produção
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-gray-400">Nenhuma produção encontrada.</div>
      ) : groupMode === 'year' ? (
        /* ─── Por ano ─── */
        <div className="space-y-6">
          {[...byYear.entries()].map(([year, items]) => (
            <div key={year}>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-amber-100 dark:bg-amber-900/30" />
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide px-2">
                  {year}
                </span>
                <div className="h-px flex-1 bg-amber-100 dark:bg-amber-900/30" />
              </div>
              <div className="space-y-2">
                {items.map(p => (
                  <ProducaoCard
                    key={p.id} p={p}
                    onDelete={() => handleDelete(p.id)}
                    onEdit={() => setEditProducao(p)}
                    onEmail={() => handleEmail(p)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ─── Por autor ─── */
        <div className="space-y-6">
          {[...byAuthor.entries()].map(([abnt, { displayName, entries }]) => (
            <div key={abnt}>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-amber-100 dark:bg-amber-900/30" />
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide px-2 flex items-center gap-1.5">
                  {/* Show diamond if this person is a coLAB member in any entry */}
                  {entries.some(e => (e.colabAuthors ?? []).includes(abnt)) && (
                    <span className="text-amber-400 normal-case text-[10px]">◆</span>
                  )}
                  {displayName}
                </span>
                <div className="h-px flex-1 bg-amber-100 dark:bg-amber-900/30" />
              </div>
              <div className="space-y-2">
                {entries.map(p => (
                  <ProducaoCard
                    key={`${abnt}-${p.id}`} p={p}
                    onDelete={() => handleDelete(p.id)}
                    onEdit={() => setEditProducao(p)}
                    onEmail={() => handleEmail(p)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <UploadDialog
        open={uploadOpen}
        onClose={() => { setUploadOpen(false); setDropFile(null) }}
        onSave={handleSave}
        initialFile={dropFile ?? undefined}
      />
      {editProducao && (
        <EditDialog producao={editProducao} onClose={() => setEditProducao(null)} onSave={handleSave} />
      )}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Full-page drop overlay */}
      <div
        className={`fixed inset-4 z-50 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-200 pointer-events-none ${
          isDragging
            ? 'border-amber-400 dark:border-amber-500 bg-amber-50/80 dark:bg-amber-950/50 opacity-100'
            : 'border-transparent opacity-0'
        }`}
      >
        <Upload className="w-12 h-12 text-amber-400 dark:text-amber-500 mb-3" />
        <p className="text-base font-semibold text-amber-700 dark:text-amber-300">Soltar para adicionar</p>
        <p className="text-sm text-amber-500 dark:text-amber-400 mt-1">O PDF será lido automaticamente</p>
      </div>
    </div>
  )
}
