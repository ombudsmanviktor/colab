import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen, Plus, Download, Trash2, Mail, Edit2, X, Upload, FileText,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { loadLeituras, saveLeitura, deleteLeitura, loadUsersIndex, generateId } from '@/lib/storage'
import { extractPdfMetadata } from '@/lib/pdfExtract'
import { sendLeituraNotification } from '@/lib/emailjs'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/toast'
import type { Leitura } from '@/types'

// ─── Bibliography formatter ────────────────────────────────────────────────

function formatABNT(l: Leitura): string {
  const authors = l.authors.map(a => {
    const parts = a.split(',')
    return parts.length >= 2 ? `${parts[0].trim().toUpperCase()}, ${parts[1].trim()}` : a.toUpperCase()
  }).join('; ')
  const year = l.year ? `. ${l.year}` : ''
  const source = l.source ? `. *${l.source}*` : ''
  return `${authors}${year}. **${l.title}**${source}.`
}

function formatBibText(l: Leitura): string {
  const authors = l.authors.join('; ')
  const year = l.year ? ` (${l.year})` : ''
  const source = l.source ? `. ${l.source}` : ''
  return `${authors}${year}. ${l.title}${source}.`
}

// ─── Export ───────────────────────────────────────────────────────────────

function exportMarkdown(leituras: Leitura[]) {
  const grouped = groupByDate(leituras)
  const lines = ['# Lista de Leituras Recomendadas\n']
  for (const [date, items] of Object.entries(grouped)) {
    lines.push(`## Reunião: ${formatDate(date)}\n`)
    for (const l of items) lines.push(`- ${formatABNT(l)}`)
    lines.push('')
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'leituras.md'; a.click()
  URL.revokeObjectURL(url)
}

async function exportPDF(leituras: Leitura[]) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' })
  const ml = 20, pageW = pdf.internal.pageSize.getWidth()
  let y = 20

  pdf.setFillColor(217, 119, 6)
  pdf.rect(0, 0, pageW, 12, 'F')
  pdf.setTextColor(255, 255, 255); pdf.setFontSize(8); pdf.setFont('helvetica', 'normal')
  pdf.text('coLAB · coLAB/UFF · Leituras Recomendadas', ml, 8)
  y = 24

  const grouped = groupByDate(leituras)
  for (const [date, items] of Object.entries(grouped)) {
    pdf.setFontSize(12); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(120, 53, 15)
    pdf.text(`Reunião: ${formatDate(date)}`, ml, y); y += 8
    for (const l of items) {
      const text = formatBibText(l)
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
  pdf.save('leituras.pdf')
}

async function exportDOCX(leituras: Leitura[]) {
  const { Document, Paragraph, HeadingLevel, Packer, TextRun } = await import('docx')
  const children = []
  const grouped = groupByDate(leituras)
  for (const [date, items] of Object.entries(grouped)) {
    children.push(new Paragraph({ text: `Reunião: ${formatDate(date)}`, heading: HeadingLevel.HEADING_2 }))
    for (const l of items) {
      children.push(new Paragraph({ children: [new TextRun(formatBibText(l))] }))
    }
    children.push(new Paragraph({ text: '' }))
  }
  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'leituras.docx'; a.click()
  URL.revokeObjectURL(url)
}

async function exportXLS(leituras: Leitura[]) {
  const { utils, writeFile } = await import('xlsx')
  const rows = leituras.map(l => ({
    'Título': l.title,
    'Autores': l.authors.join('; '),
    'Ano': l.year ?? '',
    'Fonte': l.source ?? '',
    'Reunião': l.meetingDate,
    'Adicionado por': l.addedBy,
  }))
  const ws = utils.json_to_sheet(rows)
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, 'Leituras')
  writeFile(wb, 'leituras.xlsx')
}

function groupByDate(leituras: Leitura[]): Record<string, Leitura[]> {
  const sorted = [...leituras].sort((a, b) => b.meetingDate.localeCompare(a.meetingDate))
  return sorted.reduce<Record<string, Leitura[]>>((acc, l) => {
    if (!acc[l.meetingDate]) acc[l.meetingDate] = []
    acc[l.meetingDate].push(l)
    return acc
  }, {})
}

// ─── Upload Dialog ─────────────────────────────────────────────────────────

function UploadDialog({
  open, onClose, onSave,
}: {
  open: boolean; onClose: () => void; onSave: (l: Leitura) => Promise<void>
}) {
  const { session } = useAuth()
  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [year, setYear] = useState('')
  const [source, setSource] = useState('')
  const [meetingDate, setMeetingDate] = useState('')
  const [notes, setNotes] = useState('')
  const [url, setUrl] = useState('')
  const [pdfBase64, setPdfBase64] = useState<string | undefined>()
  const [pdfName, setPdfName] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setTitle(''); setAuthors(''); setYear(''); setSource('')
    setMeetingDate(''); setNotes(''); setUrl('')
    setPdfBase64(undefined); setPdfName(undefined)
    setLoading(false); setSaving(false)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setPdfName(file.name)
    try {
      const buffer = await file.arrayBuffer()
      const meta = await extractPdfMetadata(buffer)
      if (meta.title) setTitle(meta.title)
      if (meta.authors?.length) setAuthors(meta.authors.join('; '))
      if (meta.year) setYear(meta.year)
      if (meta.source) setSource(meta.source)

      // Convert to base64 for storage
      const bytes = new Uint8Array(buffer)
      const binStr = Array.from(bytes, b => String.fromCodePoint(b)).join('')
      setPdfBase64(btoa(binStr))
    } catch {
      // metadata extraction failed — fields remain empty for manual fill
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!title.trim() || !meetingDate) return
    setSaving(true)
    const now = new Date().toISOString()
    const leitura: Leitura = {
      id: generateId(),
      title: title.trim(),
      authors: authors.split(';').map(a => a.trim()).filter(Boolean),
      year: year.trim() || undefined,
      source: source.trim() || undefined,
      meetingDate,
      notes: notes.trim() || undefined,
      url: url.trim() || undefined,
      pdfBase64,
      pdfName,
      addedBy: session?.email ?? '',
      createdAt: now,
    }
    await onSave(leitura)
    reset()
    onClose()
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar Leitura Recomendada</DialogTitle>
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
            <Label>Autores (separados por ;)</Label>
            <Input value={authors} onChange={e => setAuthors(e.target.value)} placeholder="Sobrenome, Nome; Sobrenome2, Nome2" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ano</Label>
              <Input value={year} onChange={e => setYear(e.target.value)} placeholder="2024" />
            </div>
            <div className="space-y-1.5">
              <Label>Data da reunião <span className="text-red-400">*</span></Label>
              <Input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Periódico / Livro</Label>
            <Input value={source} onChange={e => setSource(e.target.value)} placeholder="Nome da revista, editora, etc." />
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
            disabled={saving || loading || !title.trim() || !meetingDate}
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

function EditDialog({ leitura, onClose, onSave }: {
  leitura: Leitura; onClose: () => void; onSave: (l: Leitura) => Promise<void>
}) {
  const [title, setTitle] = useState(leitura.title)
  const [authors, setAuthors] = useState(leitura.authors.join('; '))
  const [year, setYear] = useState(leitura.year ?? '')
  const [source, setSource] = useState(leitura.source ?? '')
  const [meetingDate, setMeetingDate] = useState(leitura.meetingDate)
  const [notes, setNotes] = useState(leitura.notes ?? '')
  const [url, setUrl] = useState(leitura.url ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!title.trim() || !meetingDate) return
    setSaving(true)
    await onSave({
      ...leitura,
      title: title.trim(),
      authors: authors.split(';').map(a => a.trim()).filter(Boolean),
      year: year.trim() || undefined,
      source: source.trim() || undefined,
      meetingDate,
      notes: notes.trim() || undefined,
      url: url.trim() || undefined,
    })
    setSaving(false)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Editar Leitura</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Autores (separados por ;)</Label>
            <Input value={authors} onChange={e => setAuthors(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ano</Label>
              <Input value={year} onChange={e => setYear(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Data da reunião</Label>
              <Input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Periódico / Livro</Label>
            <Input value={source} onChange={e => setSource(e.target.value)} />
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
          <Button onClick={handleSave} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-white">
            {saving ? 'Salvando…' : 'Atualizar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Leitura Card ─────────────────────────────────────────────────────────

function LeituraCard({ l, onDelete, onEdit, onEmail }: {
  l: Leitura; onDelete: () => void; onEdit: () => void; onEmail: () => void
}) {
  function downloadPdf() {
    if (!l.pdfBase64 || !l.pdfName) return
    const binStr = atob(l.pdfBase64)
    const bytes = new Uint8Array(binStr.length)
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = l.pdfName; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 flex items-start justify-between gap-3 hover:shadow-sm transition-shadow">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{l.title}</p>
        {l.authors.length > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{l.authors.join('; ')}{l.year ? ` (${l.year})` : ''}</p>
        )}
        {l.source && <p className="text-xs text-gray-400 dark:text-gray-500 italic mt-0.5">{l.source}</p>}
        {l.notes && <p className="text-xs text-gray-400 mt-1">{l.notes}</p>}
        <div className="flex items-center gap-2 mt-1.5">
          {l.url && (
            <a href={l.url} target="_blank" rel="noreferrer" className="text-xs text-amber-600 hover:underline">Link</a>
          )}
          {l.pdfBase64 && (
            <button onClick={downloadPdf} className="text-xs text-amber-600 hover:underline flex items-center gap-1">
              <FileText className="w-3 h-3" /> PDF
            </button>
          )}
          <span className="text-xs text-gray-300">por {l.addedBy}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} title="Editar" className="p-1.5 rounded hover:bg-amber-50 text-gray-300 hover:text-amber-500 transition-colors">
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onEmail} title="Enviar por email" className="p-1.5 rounded hover:bg-blue-50 text-gray-300 hover:text-blue-500 transition-colors">
          <Mail className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} title="Remover" className="p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export function Leituras() {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const { toasts, toast, dismiss } = useToast()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [editLeitura, setEditLeitura] = useState<Leitura | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  const [filterStart, setFilterStart] = useState('')
  const [filterEnd, setFilterEnd] = useState('')

  const { data: leituras = [], isLoading } = useQuery({
    queryKey: ['leituras'],
    queryFn: loadLeituras,
  })

  const filteredLeituras = leituras.filter(l => {
    if (filterStart && l.meetingDate < filterStart) return false
    if (filterEnd && l.meetingDate > filterEnd) return false
    return true
  })

  const grouped = groupByDate(filteredLeituras)

  async function handleSave(l: Leitura) {
    await saveLeitura(l)
    queryClient.setQueryData(['leituras'], (prev: Leitura[] = []) => {
      const exists = prev.find(x => x.id === l.id)
      return exists ? prev.map(x => x.id === l.id ? l : x) : [l, ...prev]
    })
    toast({ title: 'Leitura salva' })
  }

  async function handleDelete(id: string) {
    await deleteLeitura(id)
    queryClient.setQueryData(['leituras'], (prev: Leitura[] = []) => prev.filter(x => x.id !== id))
    toast({ title: 'Leitura removida' })
  }

  async function handleEmail(l: Leitura) {
    try {
      const idx = await loadUsersIndex()
      const recipients = idx.emails.filter(e => e !== session?.email)
      await sendLeituraNotification({
        senderEmail: session?.email ?? '',
        recipientEmails: recipients,
        leituraTitle: l.title,
        leituraAuthors: l.authors.join('; '),
        leituraYear: l.year,
        leituraSource: l.source,
        meetingDate: l.meetingDate,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Leituras Recomendadas</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Referências bibliográficas do grupo</p>
        </div>
        <div className="flex items-center gap-2">
          {leituras.length > 0 && (
            <div className="relative" ref={exportRef}>
              <Button variant="outline" size="sm" onClick={() => setExportOpen(v => !v)}>
                <Download className="w-4 h-4" /> Exportar
              </Button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-30 py-1 min-w-[150px]">
                  {[
                    { label: 'Markdown', fn: () => exportMarkdown(filteredLeituras) },
                    { label: 'PDF', fn: () => exportPDF(filteredLeituras) },
                    { label: 'Word (DOCX)', fn: () => exportDOCX(filteredLeituras) },
                    { label: 'Excel (XLS)', fn: () => exportXLS(filteredLeituras) },
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

      {/* Filter */}
      {leituras.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-500">Período:</span>
          <Input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="w-auto text-sm" />
          <span className="text-gray-400">—</span>
          <Input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="w-auto text-sm" />
          {(filterStart || filterEnd) && (
            <button onClick={() => { setFilterStart(''); setFilterEnd('') }} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <X className="w-3 h-3" /> Limpar
            </button>
          )}
        </div>
      )}

      {leituras.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-gray-500">Nenhuma leitura cadastrada</p>
          <Button className="mt-4 bg-amber-500 hover:bg-amber-600 text-white" onClick={() => setUploadOpen(true)}>
            <Plus className="w-4 h-4" /> Adicionar primeira leitura
          </Button>
        </div>
      ) : filteredLeituras.length === 0 ? (
        <div className="text-center py-10 text-gray-400">Nenhuma leitura neste período.</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-amber-100 dark:bg-amber-900/30" />
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide px-2">
                  Reunião · {formatDate(date)}
                </span>
                <div className="h-px flex-1 bg-amber-100 dark:bg-amber-900/30" />
              </div>
              <div className="space-y-2">
                {items.map(l => (
                  <LeituraCard
                    key={l.id} l={l}
                    onDelete={() => handleDelete(l.id)}
                    onEdit={() => setEditLeitura(l)}
                    onEmail={() => handleEmail(l)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onSave={handleSave} />
      {editLeitura && (
        <EditDialog leitura={editLeitura} onClose={() => setEditLeitura(null)} onSave={handleSave} />
      )}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
