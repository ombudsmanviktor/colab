import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { Plus, Download, X, FileText, GripVertical } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { loadAtas, saveAta, deleteAta, generateId } from '@/lib/storage'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { MarkdownEditor, MarkdownRenderer } from '@/components/shared/MarkdownEditor'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/toast'
import type { AtaDecisao } from '@/types'

export function AtasEDecisoes() {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const { toasts, toast, dismiss } = useToast()

  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editAta, setEditAta] = useState<AtaDecisao | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!exportOpen) return
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [exportOpen])

  const { data: rawAtas = [], isLoading } = useQuery({
    queryKey: ['atas'],
    queryFn: loadAtas,
  })

  const atas = [...rawAtas].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  function openNew() { setEditAta(null); setTitle(''); setBody(''); setDialogOpen(true) }
  function openEdit(a: AtaDecisao) { setEditAta(a); setTitle(a.title); setBody(a.body); setDialogOpen(true) }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const ata: AtaDecisao = editAta
        ? { ...editAta, title: title.trim(), body, updatedAt: now }
        : { id: generateId(), title: title.trim(), body, order: rawAtas.length, createdAt: now, updatedAt: now }

      await saveAta(ata)
      queryClient.setQueryData(['atas'], (prev: AtaDecisao[] = []) =>
        editAta ? prev.map(a => a.id === ata.id ? ata : a) : [...prev, ata]
      )
      setDialogOpen(false)
      toast({ title: editAta ? 'Ata atualizada' : 'Ata criada' })
    } catch (err) {
      toast({ title: 'Erro', description: String(err), variant: 'destructive' })
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!editAta) return
    await deleteAta(editAta.id)
    queryClient.setQueryData(['atas'], (prev: AtaDecisao[] = []) => prev.filter(a => a.id !== editAta.id))
    setDialogOpen(false)
    toast({ title: 'Ata removida' })
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination || result.destination.index === result.source.index) return
    const reordered = [...atas]
    const [moved] = reordered.splice(result.source.index, 1)
    reordered.splice(result.destination.index, 0, moved)
    const withOrder = reordered.map((a, i) => ({ ...a, order: i }))
    queryClient.setQueryData(['atas'], withOrder)
    Promise.all(
      withOrder
        .filter((a, i) => a.order !== atas[i]?.order)
        .map(a => saveAta(a))
    ).catch(() => {
      toast({ title: 'Erro ao reordenar', variant: 'destructive' })
      queryClient.setQueryData(['atas'], rawAtas)
    })
  }

  async function exportAllPDF() {
    if (atas.length === 0) return
    try {
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' })
      const margin = 20
      const pageW = pdf.internal.pageSize.getWidth()
      for (let i = 0; i < atas.length; i++) {
        const a = atas[i]
        if (i > 0) pdf.addPage()
        let y = margin
        pdf.setFontSize(16); pdf.setFont('helvetica', 'bold')
        pdf.text(a.title, margin, y); y += 10
        pdf.setFontSize(10); pdf.setFont('helvetica', 'normal')
        const text = a.body
          .replace(/#{1,6}\s/g, '').replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/\*([^*]+)\*/g, '$1').replace(/`([^`]+)`/g, '$1')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^[-*+]\s/gm, '• ')
        const lines = pdf.splitTextToSize(text, pageW - margin * 2)
        for (const line of lines) {
          if (y > 270) { pdf.addPage(); y = margin }
          pdf.text(line, margin, y); y += 5
        }
      }
      pdf.save('atas-e-decisoes.pdf')
    } catch (err) {
      toast({ title: 'Erro ao exportar PDF', description: String(err), variant: 'destructive' })
    }
  }

  async function exportAllDOCX() {
    if (atas.length === 0) return
    try {
      const { Document, Paragraph, HeadingLevel, Packer, TextRun, PageBreak } = await import('docx')
      const children = []
      for (let i = 0; i < atas.length; i++) {
        const a = atas[i]
        if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }))
        children.push(new Paragraph({ text: a.title, heading: HeadingLevel.HEADING_1 }))
        const bodyText = a.body
          .replace(/#{1,6}\s/g, '').replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/\*([^*]+)\*/g, '$1').replace(/`([^`]+)`/g, '$1')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        for (const line of bodyText.split('\n')) {
          children.push(new Paragraph({ children: [new TextRun(line)] }))
        }
      }
      const doc = new Document({ sections: [{ children }] })
      const blob = await Packer.toBlob(doc)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'atas-e-decisoes.docx'; a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast({ title: 'Erro ao exportar DOCX', description: String(err), variant: 'destructive' })
    }
  }

  function exportAllMarkdown() {
    if (atas.length === 0) return
    const lines = ['# Atas e Decisões\n']
    for (const a of atas) { lines.push(`## ${a.title}`, a.body, '\n---\n') }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const el = document.createElement('a')
    el.href = url; el.download = 'atas-e-decisoes.md'; el.click()
    URL.revokeObjectURL(url)
  }

  function exportMarkdown(a: AtaDecisao) {
    const blob = new Blob([`# ${a.title}\n\n${a.body}`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const el = document.createElement('a')
    el.href = url; el.download = `${a.id}.md`; el.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // dummy reference to avoid unused warning
  void session

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Atas e Decisões</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Documentação e decisões do grupo de pesquisa</p>
        </div>
        <div className="flex items-center gap-2">
          {atas.length > 0 && (
            <div className="relative" ref={exportRef}>
              <Button variant="outline" size="sm" onClick={() => setExportOpen(v => !v)}>
                <Download className="w-4 h-4" /> Exportar Tudo
              </Button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-30 py-1 min-w-[150px]">
                  {[
                    { label: 'PDF', fn: exportAllPDF },
                    { label: 'Word (DOCX)', fn: exportAllDOCX },
                    { label: 'Markdown', fn: exportAllMarkdown },
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
          <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" onClick={openNew}>
            <Plus className="w-4 h-4" /> Nova Ata
          </Button>
        </div>
      </div>

      {atas.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-gray-500">Nenhuma ata cadastrada</p>
          <Button className="mt-4 bg-amber-500 hover:bg-amber-600 text-white" onClick={openNew}>
            <Plus className="w-4 h-4" /> Criar
          </Button>
        </div>
      ) : (
        <>
          {/* Index */}
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-xl px-5 py-4">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-3">Índice</p>
            <ol className="space-y-1">
              {atas.map((a, i) => (
                <li key={a.id} className="flex items-baseline gap-2">
                  <span className="text-xs text-amber-400 w-5 flex-shrink-0 text-right">{i + 1}.</span>
                  <button
                    onClick={() => document.getElementById(`ata-${a.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="text-sm text-amber-800 dark:text-amber-300 hover:text-amber-600 hover:underline text-left"
                  >
                    {a.title}
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="atas">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`space-y-4 ${snapshot.isDraggingOver ? 'bg-amber-50/50 rounded-xl p-1' : ''}`}
                >
                  {atas.map((a, index) => (
                    <Draggable key={a.id} draggableId={a.id} index={index}>
                      {(prov, snap) => (
                        <div
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          id={`ata-${a.id}`}
                          className={`bg-white dark:bg-gray-800 border rounded-xl shadow-sm scroll-mt-4 transition-shadow ${
                            snap.isDragging
                              ? 'border-amber-300 shadow-lg ring-1 ring-amber-200'
                              : 'border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                {...prov.dragHandleProps}
                                className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 hover:text-gray-400 transition-colors"
                                title="Arrastar para reordenar"
                              >
                                <GripVertical className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <h3 className="font-semibold text-gray-900 dark:text-white">{a.title}</h3>
                                <p className="text-xs text-gray-400 mt-0.5">{formatDate(a.updatedAt)}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Button variant="ghost" size="icon" onClick={() => exportMarkdown(a)} title="Exportar Markdown">
                                <Download className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>Editar</Button>
                            </div>
                          </div>
                          <div className="px-5 py-4">
                            <MarkdownRenderer content={a.body} />
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editAta ? 'Editar Ata/Decisão' : 'Nova Ata/Decisão'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Conteúdo</Label>
              <MarkdownEditor value={body} onChange={setBody} minHeight={300} />
            </div>
          </div>
          <DialogFooter>
            {editAta && (
              <Button variant="outline" className="text-red-500 mr-auto" onClick={handleDelete}>
                <X className="w-4 h-4" /> Remover
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !title.trim()} className="bg-amber-500 hover:bg-amber-600 text-white">
              {saving ? 'Salvando…' : editAta ? 'Atualizar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
