import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Plus, GraduationCap, Pencil, Trash2, FileText, ChevronDown, ChevronUp,
  BookOpen, Link2, Paperclip, Download, X, CalendarDays, Archive, ArchiveRestore,
  Upload, Loader2, Eye, Star,
} from 'lucide-react'
import { dump, load } from 'js-yaml'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/useToast'
import {
  loadOrientacoes, saveOrientacaoFile, deleteOrientacaoFile, uploadAnexo,
  downloadPlanPdf, openDocBlob,
} from '@/lib/storage'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ToastContainer } from '@/components/ui/toast'
import type { Orientacao, NotaReuniao, Anexo, LeituraDoc } from '@/types'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function downloadNotasMarkdown(o: Orientacao) {
  const reunioes = o.reunioes ?? []
  const sorted = [...reunioes].sort((a, b) => {
    if (a.data && b.data) return b.data.localeCompare(a.data)
    if (a.data) return -1
    if (b.data) return 1
    return 0
  })
  const lines: string[] = [
    `# Notas de Orientação`,
    ``,
    `**Orientado(a):** ${o.nome_orientando}`,
    `**Curso:** ${o.curso}`,
  ]
  if (o.titulo_provisorio) lines.push(`**Título Provisório:** ${o.titulo_provisorio}`)
  if (o.data_inicio_orientacao) lines.push(`**Ingresso:** ${new Date(o.data_inicio_orientacao + 'T00:00:00').toLocaleDateString('pt-BR')}`)
  if (o.previsao_conclusao) lines.push(`**Previsão de Conclusão:** ${o.previsao_conclusao}`)
  lines.push(``, `---`, ``)
  if (sorted.length === 0) {
    lines.push(`_Nenhuma anotação registrada._`)
  } else {
    sorted.forEach(r => {
      lines.push(r.data ? `## ${r.data}` : `## (sem data)`)
      lines.push(``, r.texto, ``)
      if (r.anexo) lines.push(`📎 ${r.anexo.name}`, ``)
    })
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `reunioes-${o.nome_orientando.replace(/\s+/g, '-').toLowerCase()}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function exportPDF(orientacoes: Orientacao[]) {
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('Orientações', 14, 22)
  autoTable(doc, {
    startY: 30,
    head: [['Orientado(a)', 'Curso', 'Título Provisório', 'Ingresso', 'Conclusão']],
    body: orientacoes.map(o => [
      o.nome_orientando, o.curso, o.titulo_provisorio ?? '—',
      o.data_inicio_orientacao ? new Date(o.data_inicio_orientacao + 'T00:00:00').toLocaleDateString('pt-BR') : '—',
      o.previsao_conclusao ?? '—',
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [217, 119, 6] },
  })
  doc.save('orientacoes.pdf')
}

function exportExcel(orientacoes: Orientacao[]) {
  const ws = XLSX.utils.json_to_sheet(orientacoes.map(o => ({
    'Orientado(a)': o.nome_orientando,
    Curso: o.curso,
    'Título Provisório': o.titulo_provisorio ?? '',
    'Ano Ingresso': o.data_inicio_orientacao ? new Date(o.data_inicio_orientacao + 'T00:00:00').toLocaleDateString('pt-BR') : '',
    'Previsão Conclusão': o.previsao_conclusao ?? '',
    'Exame de Qualificação': o.exame_qualificacao ? 'Sim' : '',
  })))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Orientações')
  XLSX.writeFile(wb, 'orientacoes.xlsx')
}

function exportAllYAML(orientacoes: Orientacao[]) {
  const data = orientacoes.map(o => ({
    id: o.id,
    nome_orientando: o.nome_orientando,
    curso: o.curso,
    ...(o.titulo_provisorio ? { titulo_provisorio: o.titulo_provisorio } : {}),
    ...(o.data_inicio_orientacao ? { data_inicio_orientacao: o.data_inicio_orientacao } : {}),
    ...(o.previsao_conclusao ? { previsao_conclusao: o.previsao_conclusao } : {}),
    ...(o.exame_qualificacao ? { exame_qualificacao: true } : {}),
    ...(o.arquivada ? { arquivada: true } : {}),
    leituras: o.leituras ?? [],
    leituras_docs: o.leituras_docs ?? [],
    links_documentos: o.links_documentos ?? [],
    reunioes: (o.reunioes ?? []).map(r => ({
      id: r.id,
      ...(r.data ? { data: r.data } : {}),
      texto: r.texto,
      ...(r.anexo ? { anexo: { name: r.anexo.name, size: r.anexo.size, ...(r.anexo.path ? { path: r.anexo.path } : {}) } } : {}),
    })),
    ...(o.projeto_original ? {
      projeto_original: {
        name: o.projeto_original.name,
        size: o.projeto_original.size,
        ...(o.projeto_original.path ? { path: o.projeto_original.path } : {}),
      },
    } : {}),
    created_at: o.created_at,
    updated_at: o.updated_at,
  }))
  const header = `# Exportação de Orientações — coLAB\n# Gerado em: ${new Date().toISOString()}\n\n`
  const yamlStr = dump(data, { lineWidth: -1, sortKeys: false })
  const blob = new Blob([header + yamlStr], { type: 'text/yaml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `orientacoes-${new Date().toISOString().slice(0, 10)}.yaml`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ─── Deadline pill helpers ───────────────────────────────────────────── */

function addMonths(date: Date, n: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}
function monthsElapsed(from: Date): number {
  const now = new Date()
  return (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth())
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

type PillColor = 'green' | 'yellow' | 'red' | 'gray'
const PILL_CLASSES: Record<PillColor, string> = {
  green:  'bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-400',
  yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  red:    'bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-400',
  gray:   'bg-gray-100   text-gray-500   dark:bg-gray-700      dark:text-gray-400',
}

function calcPrazosOrientacao(curso: string, dataInicio: string) {
  const inicio = new Date(dataInicio + 'T00:00:00')
  const elapsed = monthsElapsed(inicio)
  if (curso === 'Mestrado') {
    return {
      qualDate: addMonths(inicio, 18),
      defDate: addMonths(inicio, 24),
      qualColor: (elapsed < 12 ? 'green' : elapsed < 18 ? 'yellow' : 'red') as PillColor,
      defColor: (elapsed < 24 ? 'green' : 'red') as PillColor,
    }
  }
  return {
    qualDate: addMonths(inicio, 36),
    defDate: addMonths(inicio, 48),
    qualColor: (elapsed < 24 ? 'green' : elapsed < 36 ? 'yellow' : 'red') as PillColor,
    defColor: (elapsed < 48 ? 'green' : 'red') as PillColor,
  }
}

/* ─── Constants ───────────────────────────────────────────────────────── */

const CURSOS = ['Doutorado', 'Mestrado', 'Iniciação Científica', 'TCC', 'Pós-Doutorado']

const CURSO_COLORS: Record<string, string> = {
  Doutorado: 'bg-amber-100 text-amber-700',
  Mestrado: 'bg-purple-100 text-purple-700',
  'Iniciação Científica': 'bg-blue-100 text-blue-700',
  TCC: 'bg-teal-100 text-teal-700',
  'Pós-Doutorado': 'bg-orange-100 text-orange-700',
}

const needsQualificacao = (curso: string) => curso === 'Mestrado' || curso === 'Doutorado'

/* ─── Form type ──────────────────────────────────────────────────────── */

type OrientacaoForm = {
  nome_orientando: string
  curso: string
  titulo_provisorio: string
  previsao_conclusao: string
  exame_qualificacao: boolean
  data_inicio_orientacao: string
  data_defesa_tcc: string
}

const emptyForm: OrientacaoForm = {
  nome_orientando: '', curso: 'Mestrado', titulo_provisorio: '',
  previsao_conclusao: '',
  exame_qualificacao: false,
  data_inicio_orientacao: '',
  data_defesa_tcc: '',
}

/* ─── Component ──────────────────────────────────────────────────────── */

export function OrientacoesPage() {
  const { isDemoMode } = useAuth()
  const { toasts, toast, dismiss } = useToast()

  const [orientacoes, setOrientacoes] = useState<Orientacao[]>([])
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Orientacao | null>(null)
  const [form, setForm] = useState<OrientacaoForm>(emptyForm)
  const [pendingProjetoOriginal, setPendingProjetoOriginal] = useState<Anexo | null>(null)
  const [pendingProjetoFile, setPendingProjetoFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const importFileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  const [expanded, setExpanded] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const [activeReuniaoId, setActiveReuniaoId] = useState<string | null>(null)
  const [novaReuniaoData, setNovaReuniaoData] = useState('')
  const [novaReuniaoTexto, setNovaReuniaoTexto] = useState('')
  const [novaReuniaoFile, setNovaReuniaoFile] = useState<File | null>(null)
  const [novaReuniaoImportante, setNovaReuniaoImportante] = useState(false)
  const reuniaoFileRef = useRef<HTMLInputElement>(null)

  const [editingReuniaoId, setEditingReuniaoId] = useState<string | null>(null)
  const [editingReuniaoTexto, setEditingReuniaoTexto] = useState('')
  const [editingReuniaoData, setEditingReuniaoData] = useState('')

  const [novaLeitura, setNovaLeitura] = useState('')
  const [activeLeituraId, setActiveLeituraId] = useState<string | null>(null)

  const [novaLink, setNovaLink] = useState('')
  const [activeLinkId, setActiveLinkId] = useState<string | null>(null)

  // D&D state for leitura documents
  const [isDraggingDoc, setIsDraggingDoc] = useState(false)
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null)
  const [viewingDocId, setViewingDocId] = useState<string | null>(null)
  const docDragCounterRef = useRef(0)

  // Track which sub-tab is active per orientando
  const [activeSubTab, setActiveSubTab] = useState<Record<string, string>>({})

  useEffect(() => {
    loadOrientacoes().then(o => {
      setOrientacoes(o)
      setLoading(false)
    }).catch(err => {
      toast({ title: 'Erro ao carregar', description: err.message, variant: 'destructive' })
      setLoading(false)
    })
  }, [])

  // Window-level D&D for leitura documents — only active when an orientando is
  // expanded and the Leituras sub-tab is selected
  const leiturasDndActive = expanded !== null && (activeSubTab[expanded] ?? 'reunioes') === 'leituras'

  const handleDocDrop = useCallback(async (files: FileList) => {
    if (!expanded) return
    const file = files[0]
    if (!file) return
    setUploadingDocId(expanded)
    try {
      const anexo = await uploadAnexo('orientacoes', expanded, file)
      const doc: LeituraDoc = {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        path: anexo.path!,
      }
      const updated = orientacoes.map(o =>
        o.id !== expanded ? o
          : { ...o, leituras_docs: [...(o.leituras_docs ?? []), doc], updated_at: new Date().toISOString() }
      )
      setOrientacoes(updated)
      const updatedO = updated.find(o => o.id === expanded)!
      await saveOrientacaoFile(updatedO)
      toast({ title: 'Documento anexado' })
    } catch (err) {
      toast({ title: 'Erro ao fazer upload', description: String(err), variant: 'destructive' })
    } finally {
      setUploadingDocId(null)
    }
  }, [expanded, orientacoes])

  useEffect(() => {
    if (!leiturasDndActive) return

    function onDragEnter(e: DragEvent) {
      if (!e.dataTransfer?.types.includes('Files')) return
      docDragCounterRef.current++
      if (docDragCounterRef.current === 1) setIsDraggingDoc(true)
    }
    function onDragLeave() {
      docDragCounterRef.current--
      if (docDragCounterRef.current <= 0) {
        docDragCounterRef.current = 0
        setIsDraggingDoc(false)
      }
    }
    function onDragOver(e: DragEvent) { e.preventDefault() }
    function onDrop(e: DragEvent) {
      e.preventDefault()
      docDragCounterRef.current = 0
      setIsDraggingDoc(false)
      if (e.dataTransfer?.files.length) handleDocDrop(e.dataTransfer.files)
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [leiturasDndActive, handleDocDrop])

  /* ── Form open/close ── */

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setPendingProjetoOriginal(null)
    setPendingProjetoFile(null)
    setShowForm(true)
  }

  function openEdit(o: Orientacao) {
    setEditing(o)
    setForm({
      nome_orientando: o.nome_orientando,
      curso: o.curso,
      titulo_provisorio: o.titulo_provisorio ?? '',
      previsao_conclusao: o.previsao_conclusao ?? '',
      exame_qualificacao: o.exame_qualificacao ?? false,
      data_inicio_orientacao: o.data_inicio_orientacao ?? '',
      data_defesa_tcc: o.data_defesa_tcc ?? '',
    })
    setPendingProjetoOriginal(null)
    setPendingProjetoFile(null)
    setShowForm(true)
  }

  /* ── CRUD ── */

  async function handleSave() {
    if (!form.nome_orientando.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' })
      return
    }
    const projeto_original = pendingProjetoOriginal ?? editing?.projeto_original ?? undefined
    const payload = {
      nome_orientando: form.nome_orientando,
      curso: form.curso,
      titulo_provisorio: form.titulo_provisorio,
      previsao_conclusao: form.previsao_conclusao,
      exame_qualificacao: form.exame_qualificacao,
      data_inicio_orientacao: form.data_inicio_orientacao || undefined,
      data_defesa_tcc: form.data_defesa_tcc || undefined,
      leituras: editing?.leituras ?? [],
      leituras_docs: editing?.leituras_docs ?? [],
      links_documentos: editing?.links_documentos ?? [],
      projeto_original,
    }

    const now = new Date().toISOString()
    const id = editing ? editing.id : crypto.randomUUID()

    let savedProjetoOriginal: Anexo | undefined = pendingProjetoOriginal ?? editing?.projeto_original ?? undefined
    if (!isDemoMode && pendingProjetoFile) {
      try {
        savedProjetoOriginal = await uploadAnexo('orientacoes', id, pendingProjetoFile)
      } catch (err: unknown) {
        toast({ title: 'Erro ao fazer upload', description: String(err), variant: 'destructive' })
        return
      }
    }

    const orientacao: Orientacao = {
      id,
      ...payload,
      projeto_original: savedProjetoOriginal,
      reunioes: editing?.reunioes ?? [],
      created_at: editing?.created_at ?? now,
      updated_at: now,
    }

    try {
      await saveOrientacaoFile(orientacao)
    } catch (err: unknown) {
      toast({ title: 'Erro ao salvar', description: String(err), variant: 'destructive' })
      return
    }

    setOrientacoes(prev => editing
      ? prev.map(o => o.id === id ? orientacao : o)
      : [orientacao, ...prev]
    )
    toast({ title: editing ? 'Orientação atualizada' : 'Orientação criada' })
    setPendingProjetoOriginal(null)
    setPendingProjetoFile(null)
    setShowForm(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta orientação?')) return
    try {
      await deleteOrientacaoFile(id)
    } catch (err: unknown) {
      toast({ title: 'Erro ao remover', description: String(err), variant: 'destructive' })
      return
    }
    setOrientacoes(prev => prev.filter(o => o.id !== id))
    toast({ title: 'Orientação removida' })
  }

  /* ── Archive ── */

  async function handleArchive(o: Orientacao) {
    const updated: Orientacao = { ...o, arquivada: !o.arquivada, updated_at: new Date().toISOString() }
    try {
      await saveOrientacaoFile(updated)
      setOrientacoes(prev => prev.map(x => x.id === o.id ? updated : x))
      toast({ title: o.arquivada ? 'Orientação reativada' : 'Orientação arquivada' })
    } catch (err: unknown) {
      toast({ title: 'Erro ao arquivar', description: String(err), variant: 'destructive' })
    }
  }

  /* ── Import YAML ── */

  async function handleImportYAML(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    try {
      const text = await file.text()
      const raw = load(text) as Array<Record<string, unknown>>
      if (!Array.isArray(raw)) throw new Error('Arquivo inválido: esperado array YAML')

      const importedOrientacoes: Orientacao[] = []

      for (const item of raw) {
        const o: Orientacao = {
          id: (item.id as string) ?? crypto.randomUUID(),
          nome_orientando: (item.nome_orientando as string) ?? '',
          curso: (item.curso as string) ?? 'Mestrado',
          titulo_provisorio: item.titulo_provisorio as string | undefined,
          data_inicio_orientacao: (item.data_inicio_orientacao as string | undefined),
          previsao_conclusao: item.previsao_conclusao as string | undefined,
          exame_qualificacao: item.exame_qualificacao as boolean | undefined,
          arquivada: item.arquivada as boolean | undefined,
          leituras: (item.leituras as string[]) ?? [],
          leituras_docs: (item.leituras_docs as LeituraDoc[]) ?? [],
          links_documentos: (item.links_documentos as string[]) ?? [],
          reunioes: ((item.reunioes as Array<Record<string, unknown>>) ?? []).map((r) => ({
            id: (r.id as string) ?? crypto.randomUUID(),
            ...(r.data ? { data: r.data as string } : {}),
            texto: (r.texto as string) ?? '',
            ...(r.anexo ? { anexo: r.anexo as Anexo } : {}),
          })),
          ...(item.projeto_original ? { projeto_original: item.projeto_original as Anexo } : {}),
          created_at: (item.created_at as string) ?? new Date().toISOString(),
          updated_at: (item.updated_at as string) ?? new Date().toISOString(),
        }
        importedOrientacoes.push(o)
      }

      setOrientacoes(prev => {
        const map = new Map(prev.map(x => [x.id, x]))
        importedOrientacoes.forEach(o => map.set(o.id, o))
        return Array.from(map.values())
      })

      if (!isDemoMode) {
        for (const o of importedOrientacoes) {
          await saveOrientacaoFile(o)
        }
      }

      toast({ title: `${importedOrientacoes.length} orientação(ões) importada(s)` })
    } catch (err: unknown) {
      toast({ title: 'Erro ao importar', description: String(err), variant: 'destructive' })
    } finally {
      setImporting(false)
    }
  }



  /* ── Reuniões ── */

  async function addReuniao(orientacaoId: string) {
    if (!novaReuniaoTexto.trim()) return
    let anexo: Anexo | undefined
    if (novaReuniaoFile) {
      if (isDemoMode) {
        anexo = {
          id: crypto.randomUUID(),
          name: novaReuniaoFile.name,
          size: novaReuniaoFile.size,
          url: URL.createObjectURL(novaReuniaoFile),
          type: novaReuniaoFile.type,
        }
      } else {
        try {
          anexo = await uploadAnexo('orientacoes', orientacaoId, novaReuniaoFile)
        } catch (err: unknown) {
          toast({ title: 'Erro ao fazer upload', description: String(err), variant: 'destructive' })
          return
        }
      }
    }
    const entry: NotaReuniao = {
      id: crypto.randomUUID(),
      ...(novaReuniaoData ? { data: novaReuniaoData } : {}),
      texto: novaReuniaoTexto.trim(),
      ...(anexo ? { anexo } : {}),
      ...(novaReuniaoImportante ? { importante: true } : {}),
    }
    const updatedOrientacoes = orientacoes.map(o =>
      o.id !== orientacaoId ? o : { ...o, reunioes: [...(o.reunioes ?? []), entry] }
    )
    setOrientacoes(updatedOrientacoes)
    setNovaReuniaoTexto('')
    setNovaReuniaoData('')
    setNovaReuniaoFile(null)
    setNovaReuniaoImportante(false)
    setActiveReuniaoId(null)
    const updatedO = updatedOrientacoes.find(o => o.id === orientacaoId)!
    saveOrientacaoFile(updatedO).catch(() => {})
  }

  function deleteReuniao(orientacaoId: string, reuniaoId: string) {
    const updatedOrientacoes = orientacoes.map(o =>
      o.id !== orientacaoId ? o : { ...o, reunioes: (o.reunioes ?? []).filter(r => r.id !== reuniaoId) }
    )
    setOrientacoes(updatedOrientacoes)
    const updatedO = updatedOrientacoes.find(o => o.id === orientacaoId)!
    saveOrientacaoFile(updatedO).catch(() => {})
  }

  function deleteReuniaoAnexo(orientacaoId: string, reuniaoId: string) {
    const updatedOrientacoes = orientacoes.map(o =>
      o.id !== orientacaoId ? o : {
        ...o, reunioes: (o.reunioes ?? []).map(r =>
          r.id !== reuniaoId ? r : { ...r, anexo: undefined }
        ),
      }
    )
    setOrientacoes(updatedOrientacoes)
    const updatedO = updatedOrientacoes.find(o => o.id === orientacaoId)!
    saveOrientacaoFile(updatedO).catch(() => {})
  }

  function updateReuniao(orientacaoId: string, reuniaoId: string, novoTexto: string, novaData: string) {
    const updatedOrientacoes = orientacoes.map(o =>
      o.id !== orientacaoId ? o : {
        ...o, reunioes: (o.reunioes ?? []).map(r =>
          r.id !== reuniaoId ? r : { ...r, texto: novoTexto, ...(novaData ? { data: novaData } : { data: undefined }) }
        ),
      }
    )
    setOrientacoes(updatedOrientacoes)
    const updatedO = updatedOrientacoes.find(o => o.id === orientacaoId)!
    saveOrientacaoFile(updatedO).catch(() => {})
  }

  /* ── Leituras (text) ── */

  function addLeitura(orientacaoId: string) {
    if (!novaLeitura.trim()) return
    const updatedOrientacoes = orientacoes.map(o =>
      o.id !== orientacaoId ? o
        : { ...o, leituras: [...(o.leituras ?? []), novaLeitura.trim()], updated_at: new Date().toISOString() }
    )
    setOrientacoes(updatedOrientacoes)
    setNovaLeitura('')
    setActiveLeituraId(null)
    const updatedO = updatedOrientacoes.find(o => o.id === orientacaoId)!
    saveOrientacaoFile(updatedO).catch(() => {})
  }

  function deleteLeitura(orientacaoId: string, idx: number) {
    const updatedOrientacoes = orientacoes.map(o =>
      o.id !== orientacaoId ? o
        : { ...o, leituras: (o.leituras ?? []).filter((_, i) => i !== idx), updated_at: new Date().toISOString() }
    )
    setOrientacoes(updatedOrientacoes)
    const updatedO = updatedOrientacoes.find(o => o.id === orientacaoId)!
    saveOrientacaoFile(updatedO).catch(() => {})
  }

  /* ── Leituras (documents) ── */

  function deleteLeituraDoc(orientacaoId: string, docId: string) {
    const updatedOrientacoes = orientacoes.map(o =>
      o.id !== orientacaoId ? o
        : { ...o, leituras_docs: (o.leituras_docs ?? []).filter(d => d.id !== docId), updated_at: new Date().toISOString() }
    )
    setOrientacoes(updatedOrientacoes)
    const updatedO = updatedOrientacoes.find(o => o.id === orientacaoId)!
    saveOrientacaoFile(updatedO).catch(() => {})
  }

  async function handleViewDoc(doc: LeituraDoc) {
    setViewingDocId(doc.id)
    try {
      await openDocBlob(doc.path)
    } catch (err) {
      toast({ title: 'Erro ao abrir documento', description: String(err), variant: 'destructive' })
    } finally {
      setViewingDocId(null)
    }
  }

  async function handleDownloadDoc(doc: LeituraDoc) {
    try {
      await downloadPlanPdf(doc.path, doc.name)
    } catch (err) {
      toast({ title: 'Erro ao baixar', description: String(err), variant: 'destructive' })
    }
  }

  /* ── Links ── */

  function addLink(orientacaoId: string) {
    if (!novaLink.trim()) return
    const updatedOrientacoes = orientacoes.map(o =>
      o.id !== orientacaoId ? o
        : { ...o, links_documentos: [...(o.links_documentos ?? []), novaLink.trim()], updated_at: new Date().toISOString() }
    )
    setOrientacoes(updatedOrientacoes)
    setNovaLink('')
    setActiveLinkId(null)
    const updatedO = updatedOrientacoes.find(o => o.id === orientacaoId)!
    saveOrientacaoFile(updatedO).catch(() => {})
  }

  function deleteLink(orientacaoId: string, idx: number) {
    const updatedOrientacoes = orientacoes.map(o =>
      o.id !== orientacaoId ? o
        : { ...o, links_documentos: (o.links_documentos ?? []).filter((_, i) => i !== idx), updated_at: new Date().toISOString() }
    )
    setOrientacoes(updatedOrientacoes)
    const updatedO = updatedOrientacoes.find(o => o.id === orientacaoId)!
    saveOrientacaoFile(updatedO).catch(() => {})
  }

  /* ── File pickers ── */

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingProjetoOriginal({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      url: URL.createObjectURL(file),
      type: file.type,
    })
    setPendingProjetoFile(file)
    e.target.value = ''
  }

  function handleReuniaoFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setNovaReuniaoFile(file)
    e.target.value = ''
  }

  /* ── Grouped list ── */

  const activeOrientacoes = orientacoes.filter(o => !o.arquivada)
  const archivedOrientacoes = orientacoes.filter(o => o.arquivada)
  const byCurso = CURSOS.filter(c => activeOrientacoes.some(o => o.curso === c))

  /* ─── Render ──────────────────────────────────────────────────────── */

  return (
    <div className="animate-fade-in space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Fullscreen D&D overlay for leitura documents */}
      {isDraggingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-amber-500/10 dark:bg-amber-400/10 border-4 border-dashed border-amber-400 dark:border-amber-500 rounded-2xl m-4" />
          <div className="relative flex flex-col items-center gap-3 px-10 py-8 rounded-2xl bg-white/90 dark:bg-gray-900/90 shadow-2xl border border-amber-200 dark:border-amber-700">
            <FileText className="w-10 h-10 text-amber-500" />
            <p className="text-lg font-semibold text-gray-800 dark:text-white">Solte para anexar à leitura</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">O arquivo será adicionado como leitura</p>
          </div>
        </div>
      )}

      <input type="file" ref={fileRef} className="hidden" onChange={handleFileSelect} />
      <input type="file" ref={reuniaoFileRef} className="hidden" onChange={handleReuniaoFileSelect} />

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Orientações</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Gestão de orientandos(as) e tarefas</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => exportExcel(orientacoes)}>
            <FileText className="w-4 h-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportPDF(orientacoes)}>
            <FileText className="w-4 h-4" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportAllYAML(orientacoes)} title="Exporta todas as orientações em YAML">
            <Download className="w-4 h-4" /> Exportar Todas
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => importFileRef.current?.click()}
            disabled={importing}
            title="Importar orientações de um arquivo YAML"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Importar
          </Button>
          <input ref={importFileRef} type="file" accept=".yaml,.yml" className="hidden" onChange={handleImportYAML} />
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4" /> Nova Orientação
          </Button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <Card className="sm:col-span-1">
          <CardContent className="pt-5 pb-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Total</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{activeOrientacoes.length}</p>
          </CardContent>
        </Card>
        {CURSOS.map(c => (
          <Card key={c}>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">{c}</p>
              <p className="text-3xl font-bold text-amber-700">
                {activeOrientacoes.filter(o => o.curso === c).length}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Orientandos list ── */}
      {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-gray-200 dark:border-gray-700 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : orientacoes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-12 text-gray-400 dark:text-gray-500">
              <GraduationCap className="w-10 h-10 mb-2" />
              <p className="text-sm">Nenhum(a) orientando(a) cadastrado(a)</p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={openNew}>
                Adicionar primeiro(a) orientando(a)
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {byCurso.map(curso => (
              <div key={curso}>
                <div className="flex items-center gap-2 mb-3">
                  <Badge className={`${CURSO_COLORS[curso] ?? 'bg-gray-100 text-gray-700'} border-0`}>
                    {curso}
                  </Badge>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {activeOrientacoes.filter(o => o.curso === curso).length}
                  </span>
                </div>
                <div className="space-y-3">
                  {activeOrientacoes.filter(o => o.curso === curso).map(o => {
                    const isOpen = expanded === o.id
                    const reunioes = o.reunioes ?? []
                    const leiturasDocs = o.leituras_docs ?? []
                    const sortedReunioes = [...reunioes].sort((a, b) => {
                      if (a.data && b.data) return b.data.localeCompare(a.data)
                      if (a.data) return -1
                      if (b.data) return 1
                      return 0
                    })
                    const currentSubTab = activeSubTab[o.id] ?? 'reunioes'

                    return (
                      <Card key={o.id} className="hover:shadow-md transition-shadow">
                        {/* Card header */}
                        <div
                          className="flex items-center gap-3 px-6 py-4 cursor-pointer"
                          onClick={() => setExpanded(isOpen ? null : o.id)}
                        >
                          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-bold text-amber-700">
                              {o.nome_orientando.charAt(0)}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-gray-900 dark:text-white">{o.nome_orientando}</span>
                              <Badge className={`${CURSO_COLORS[o.curso] ?? 'bg-gray-100 text-gray-700'} border-0 text-xs`}>
                                {o.curso}
                              </Badge>
                              {needsQualificacao(o.curso) && o.exame_qualificacao && (
                                <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">
                                  Qualificado(a)
                                </Badge>
                              )}
                              {(o.curso === 'Mestrado' || o.curso === 'Doutorado') && o.data_inicio_orientacao && (() => {
                                const p = calcPrazosOrientacao(o.curso, o.data_inicio_orientacao)
                                const qualColor: PillColor = o.exame_qualificacao ? 'gray' : p.qualColor
                                return (
                                  <>
                                    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${PILL_CLASSES[qualColor]}`}>
                                      Qual: {fmtDate(p.qualDate)}
                                    </span>
                                    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${PILL_CLASSES[p.defColor]}`}>
                                      Defesa: {fmtDate(p.defDate)}
                                    </span>
                                  </>
                                )
                              })()}
                              {o.curso === 'TCC' && o.data_defesa_tcc && (
                                <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
                                  Defesa TCC: {new Date(o.data_defesa_tcc + 'T00:00:00').toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </div>
                            {o.titulo_provisorio && (
                              <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">{o.titulo_provisorio}</p>
                            )}
                            <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex-wrap">
                              {o.data_inicio_orientacao && <span>Ingresso: {new Date(o.data_inicio_orientacao + 'T00:00:00').toLocaleDateString('pt-BR')}</span>}
                              {o.previsao_conclusao && <span>Conclusão: {o.previsao_conclusao}</span>}
                              {reunioes.length > 0 && <span>{reunioes.length} reunião(ões)</span>}
                              {leiturasDocs.length > 0 && <span>{leiturasDocs.length} doc(s)</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); openEdit(o) }} title="Editar">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Arquivar" onClick={e => { e.stopPropagation(); handleArchive(o) }}>
                              <Archive className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); handleDelete(o.id) }} title="Excluir">
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </Button>
                            {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400 dark:text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
                          </div>
                        </div>

                        {/* Expanded tabs */}
                        {isOpen && (
                          <div className="border-t border-gray-100 dark:border-gray-700 px-6 py-4">
                            <Tabs
                              value={currentSubTab}
                              onValueChange={v => setActiveSubTab(prev => ({ ...prev, [o.id]: v }))}
                            >
                              <TabsList className="mb-4 flex-wrap h-auto gap-1">
                                <TabsTrigger value="reunioes">Reuniões e Prazos ({reunioes.length})</TabsTrigger>
                                <TabsTrigger value="leituras">
                                  Leituras ({(o.leituras ?? []).length + leiturasDocs.length})
                                </TabsTrigger>
                                <TabsTrigger value="links">Links ({(o.links_documentos ?? []).length})</TabsTrigger>
                                {o.projeto_original && <TabsTrigger value="projeto">Projeto</TabsTrigger>}
                              </TabsList>

                              {/* ── Reuniões ── */}
                              <TabsContent value="reunioes">
                                <div className="flex justify-end mb-3">
                                  <Button variant="outline" size="sm" onClick={() => downloadNotasMarkdown(o)} disabled={reunioes.length === 0}>
                                    <Download className="w-3.5 h-3.5" /> Baixar Markdown
                                  </Button>
                                </div>
                                <div className="space-y-0 mb-4">
                                  {sortedReunioes.length === 0 && (
                                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Nenhuma anotação registrada</p>
                                  )}
                                  {sortedReunioes.map((r, idx) => {
                                    const isPast = r.data ? r.data < new Date().toISOString().slice(0, 10) : false
                                    const dotColor = isPast
                                      ? 'text-gray-400 fill-gray-400'
                                      : 'text-amber-400 fill-amber-400'
                                    const dotBg = isPast ? 'bg-gray-300 dark:bg-gray-600' : 'bg-amber-400'
                                    return (
                                    <div key={r.id} className="flex gap-3 group">
                                      <div className="flex flex-col items-center pt-1.5 flex-shrink-0">
                                        {r.importante
                                          ? <Star className={`w-3.5 h-3.5 flex-shrink-0 ${dotColor}`} />
                                          : <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-0.5 ${dotBg}`} />
                                        }
                                        {idx < sortedReunioes.length - 1 && (
                                          <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700 my-1" style={{ minHeight: 24 }} />
                                        )}
                                      </div>
                                      <div className="flex-1 pb-4">
                                        {editingReuniaoId === r.id ? (
                                          <div className="space-y-1.5">
                                            <div className="flex items-center gap-2">
                                              <CalendarDays className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                              <Input
                                                type="date"
                                                value={editingReuniaoData}
                                                onChange={e => setEditingReuniaoData(e.target.value)}
                                                className="h-7 text-xs w-40"
                                              />
                                              <span className="text-xs text-gray-400 dark:text-gray-500">data opcional</span>
                                            </div>
                                            <Textarea
                                              value={editingReuniaoTexto}
                                              onChange={e => setEditingReuniaoTexto(e.target.value)}
                                              rows={2}
                                              className="text-sm"
                                              autoFocus
                                            />
                                            <div className="flex gap-1.5">
                                              <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => { updateReuniao(o.id, r.id, editingReuniaoTexto, editingReuniaoData); setEditingReuniaoId(null) }}>
                                                Salvar
                                              </Button>
                                              <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingReuniaoId(null)}>
                                                Cancelar
                                              </Button>
                                            </div>
                                          </div>
                                        ) : (
                                          <>
                                            {r.data ? (
                                              <div className="flex items-center gap-1.5 mb-1">
                                                <CalendarDays className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                                                <span className={`text-xs font-medium ${isPast ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'}`}>{r.data}</span>
                                                {r.importante && <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Importante</span>}
                                              </div>
                                            ) : (
                                              <div className="flex items-center gap-1.5 mb-1">
                                                <span className="text-xs text-gray-400 dark:text-gray-500 italic">Sem data</span>
                                                {r.importante && <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Importante</span>}
                                              </div>
                                            )}
                                            <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{r.texto}</p>
                                          </>
                                        )}
                                        {r.anexo && (
                                          <div className="mt-2 flex items-center gap-2">
                                            <a
                                              href={r.anexo.url}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-2 py-1 rounded-md transition-colors"
                                            >
                                              <Paperclip className="w-3 h-3 flex-shrink-0" />
                                              <span className="truncate max-w-[200px]">{r.anexo.name}</span>
                                              <span className="text-gray-400 dark:text-gray-500 ml-0.5">({formatFileSize(r.anexo.size)})</span>
                                            </a>
                                            <button onClick={() => deleteReuniaoAnexo(o.id, r.id)} className="text-gray-300 dark:text-gray-600 hover:text-red-500 transition-colors" title="Remover anexo">
                                              <X className="w-3 h-3" />
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
                                        <button onClick={() => { setEditingReuniaoId(r.id); setEditingReuniaoTexto(r.texto); setEditingReuniaoData(r.data ?? '') }} className="p-1 text-gray-300 dark:text-gray-600 hover:text-blue-500" title="Editar">
                                          <Pencil className="w-3 h-3" />
                                        </button>
                                        <button onClick={() => deleteReuniao(o.id, r.id)} className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-500" title="Remover">
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                    )
                                  })}
                                </div>
                                <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 space-y-2 bg-gray-50 dark:bg-gray-800" onClick={e => e.stopPropagation()}>
                                  <div className="flex items-center gap-2">
                                    <CalendarDays className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                    <Input
                                      type="date"
                                      value={activeReuniaoId === o.id ? novaReuniaoData : ''}
                                      onChange={e => { setActiveReuniaoId(o.id); setNovaReuniaoData(e.target.value) }}
                                      className="h-7 text-xs w-40"
                                    />
                                    <span className="text-xs text-gray-400 dark:text-gray-500">data opcional</span>
                                  </div>
                                  <Textarea
                                    value={activeReuniaoId === o.id ? novaReuniaoTexto : ''}
                                    onChange={e => { setActiveReuniaoId(o.id); setNovaReuniaoTexto(e.target.value) }}
                                    placeholder="Anotação da reunião ou descrição do prazo"
                                    rows={2}
                                    className="text-sm"
                                  />
                                  <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1.5 flex-1">
                                      <Checkbox
                                        id={`importante-${o.id}`}
                                        checked={activeReuniaoId === o.id ? novaReuniaoImportante : false}
                                        onCheckedChange={v => { setActiveReuniaoId(o.id); setNovaReuniaoImportante(Boolean(v)) }}
                                      />
                                      <label htmlFor={`importante-${o.id}`} className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">Importante</label>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => { setActiveReuniaoId(o.id); reuniaoFileRef.current?.click() }}
                                      className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1 rounded border border-gray-200 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-400 transition-colors bg-white dark:bg-gray-900"
                                    >
                                      <Paperclip className="w-3.5 h-3.5" />
                                      {activeReuniaoId === o.id && novaReuniaoFile ? novaReuniaoFile.name : 'Anexar arquivo'}
                                    </button>
                                    {activeReuniaoId === o.id && novaReuniaoFile && (
                                      <button onClick={() => setNovaReuniaoFile(null)} className="text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors">
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex justify-end">
                                    <Button
                                      size="sm" variant="outline"
                                      onClick={() => { setActiveReuniaoId(o.id); addReuniao(o.id) }}
                                      disabled={!(activeReuniaoId === o.id && novaReuniaoTexto.trim())}
                                    >
                                      <Plus className="w-3.5 h-3.5" /> Adicionar
                                    </Button>
                                  </div>
                                </div>
                              </TabsContent>

                              {/* ── Leituras ── */}
                              <TabsContent value="leituras">
                                {/* Text references */}
                                <div className="space-y-1.5 mb-3">
                                  {(o.leituras ?? []).map((l, i) => (
                                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800 group">
                                      <BookOpen className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0" />
                                      <span className="text-sm text-gray-700 dark:text-gray-200 flex-1">{l}</span>
                                      <button onClick={() => deleteLeitura(o.id, i)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 flex-shrink-0">
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                  {(o.leituras ?? []).length === 0 && leiturasDocs.length === 0 && (
                                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-2">Nenhuma leitura indicada</p>
                                  )}
                                </div>
                                <div className="flex gap-2 mb-4" onClick={e => e.stopPropagation()}>
                                  <Input
                                    value={activeLeituraId === o.id ? novaLeitura : ''}
                                    onChange={e => { setActiveLeituraId(o.id); setNovaLeitura(e.target.value) }}
                                    onKeyDown={e => { if (e.key === 'Enter') addLeitura(o.id) }}
                                    placeholder="Referência bibliográfica (Enter para adicionar)"
                                    className="flex-1"
                                  />
                                  <Button size="sm" variant="outline" onClick={() => { setActiveLeituraId(o.id); addLeitura(o.id) }}>
                                    <Plus className="w-4 h-4" />
                                  </Button>
                                </div>

                                {/* Document attachments */}
                                {leiturasDocs.length > 0 && (
                                  <div className="mb-3">
                                    <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Documentos</p>
                                    <div className="space-y-1.5">
                                      {leiturasDocs.map(doc => (
                                        <div key={doc.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800 group">
                                          <FileText className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                          <span className="text-sm text-gray-700 dark:text-gray-200 flex-1 truncate">{doc.name}</span>
                                          <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{formatFileSize(doc.size)}</span>
                                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                              onClick={() => handleViewDoc(doc)}
                                              disabled={viewingDocId === doc.id}
                                              className="p-1 text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors"
                                              title="Visualizar"
                                            >
                                              {viewingDocId === doc.id
                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                : <Eye className="w-3.5 h-3.5" />
                                              }
                                            </button>
                                            <button
                                              onClick={() => handleDownloadDoc(doc)}
                                              className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                              title="Baixar"
                                            >
                                              <Download className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                              onClick={() => deleteLeituraDoc(o.id, doc.id)}
                                              className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 transition-colors"
                                              title="Remover"
                                            >
                                              <X className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* D&D hint */}
                                <div className="mt-3 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
                                  {uploadingDocId === o.id ? (
                                    <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      Fazendo upload...
                                    </div>
                                  ) : (
                                    <p className="text-sm text-gray-400 dark:text-gray-500">
                                      Arraste um documento aqui para anexar como leitura
                                    </p>
                                  )}
                                </div>
                              </TabsContent>

                              {/* ── Links ── */}
                              <TabsContent value="links">
                                <div className="space-y-1.5 mb-3">
                                  {(o.links_documentos ?? []).map((link, i) => (
                                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800 group">
                                      <Link2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                                      <a href={link} target="_blank" rel="noreferrer" className="text-sm text-blue-600 truncate flex-1 hover:underline">{link}</a>
                                      <button onClick={() => deleteLink(o.id, i)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 flex-shrink-0">
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                  {(o.links_documentos ?? []).length === 0 && (
                                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-2">Nenhum link cadastrado</p>
                                  )}
                                </div>
                                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                                  <Input
                                    value={activeLinkId === o.id ? novaLink : ''}
                                    onChange={e => { setActiveLinkId(o.id); setNovaLink(e.target.value) }}
                                    onKeyDown={e => { if (e.key === 'Enter') addLink(o.id) }}
                                    placeholder="https://... (Enter para adicionar)"
                                    className="flex-1"
                                  />
                                  <Button size="sm" variant="outline" onClick={() => { setActiveLinkId(o.id); addLink(o.id) }}>
                                    <Plus className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TabsContent>

                              {/* ── Projeto Original ── */}
                              {o.projeto_original && (
                                <TabsContent value="projeto">
                                  <a
                                    href={o.projeto_original.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
                                  >
                                    <Paperclip className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{o.projeto_original.name}</p>
                                      <p className="text-xs text-gray-400 dark:text-gray-500">{formatFileSize(o.projeto_original.size)}</p>
                                    </div>
                                    <Download className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                                  </a>
                                </TabsContent>
                              )}
                            </Tabs>
                          </div>
                        )}
                      </Card>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* ── Orientações Arquivadas ── */}
            {archivedOrientacoes.length > 0 && (
              <div className="mt-2 pt-4 border-t border-dashed border-gray-200 dark:border-gray-700">
                <button
                  className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-300 transition-colors mb-3"
                  onClick={() => setShowArchived(v => !v)}
                >
                  {showArchived ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  <Archive className="w-4 h-4" />
                  <span>Orientações Concluídas ({archivedOrientacoes.length})</span>
                </button>
                {showArchived && (
                  <div className="space-y-1.5">
                    {archivedOrientacoes.map(o => (
                      <div key={o.id} className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-lg group hover:border-gray-200 dark:hover:border-gray-600 transition-colors">
                        <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-gray-400 dark:text-gray-500">{o.nome_orientando.charAt(0)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{o.nome_orientando}</span>
                          {o.titulo_provisorio && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{o.titulo_provisorio}</p>}
                        </div>
                        <Badge className={`${CURSO_COLORS[o.curso] ?? 'bg-gray-100 text-gray-700'} border-0 text-xs opacity-60`}>{o.curso}</Badge>
                        {o.previsao_conclusao && <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:inline">{o.previsao_conclusao}</span>}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Reativar" onClick={() => handleArchive(o)}>
                            <ArchiveRestore className="w-3.5 h-3.5 text-green-500" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => openEdit(o)}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Excluir" onClick={() => handleDelete(o.id)}>
                            <Trash2 className="w-3 h-3 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}


      {/* ── Form Dialog ── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-gray-900 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Orientação' : 'Nova Orientação'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Nome do(a) Orientando(a) *</Label>
                <Input
                  value={form.nome_orientando}
                  onChange={e => setForm(f => ({ ...f, nome_orientando: e.target.value }))}
                  placeholder="Nome completo"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Curso *</Label>
                <select
                  value={form.curso}
                  onChange={e => setForm(f => ({ ...f, curso: e.target.value, exame_qualificacao: false }))}
                  className="flex h-9 w-full rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {CURSOS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Título Provisório</Label>
                <Input
                  value={form.titulo_provisorio}
                  onChange={e => setForm(f => ({ ...f, titulo_provisorio: e.target.value }))}
                  placeholder="Título da dissertação/tese"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ano de Ingresso</Label>
                <Input
                  type="date"
                  value={form.data_inicio_orientacao}
                  onChange={e => setForm(f => ({ ...f, data_inicio_orientacao: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Previsão de Conclusão</Label>
                <Input
                  value={form.previsao_conclusao}
                  onChange={e => setForm(f => ({ ...f, previsao_conclusao: e.target.value }))}
                  placeholder="Ex: 2025/1"
                />
              </div>
              {(form.curso === 'Mestrado' || form.curso === 'Doutorado') && form.data_inicio_orientacao && (
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs text-gray-500 dark:text-gray-400">Prazos calculados automaticamente</Label>
                  {(() => {
                    const p = calcPrazosOrientacao(form.curso, form.data_inicio_orientacao)
                    const qualColor: PillColor = form.exame_qualificacao ? 'gray' : p.qualColor
                    return (
                      <div className="flex gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${PILL_CLASSES[qualColor]}`}>
                          Qualificação: {fmtDate(p.qualDate)}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${PILL_CLASSES[p.defColor]}`}>
                          Defesa: {fmtDate(p.defDate)}
                        </span>
                      </div>
                    )
                  })()}
                </div>
              )}
              {form.curso === 'TCC' && (
                <div className="space-y-1.5">
                  <Label>Data de Defesa (TCC)</Label>
                  <Input
                    type="date"
                    value={form.data_defesa_tcc}
                    onChange={e => setForm(f => ({ ...f, data_defesa_tcc: e.target.value }))}
                  />
                </div>
              )}
              <div className="col-span-2 space-y-1.5">
                <Label>Projeto Original</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    <Paperclip className="w-4 h-4" /> Anexar Arquivo
                  </Button>
                  {pendingProjetoOriginal && (
                    <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 px-2.5 py-1 rounded-lg">
                      <FileText className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                      {pendingProjetoOriginal.name}
                      <span className="text-xs text-gray-400 dark:text-gray-500 ml-0.5">({formatFileSize(pendingProjetoOriginal.size)})</span>
                      <button type="button" onClick={() => setPendingProjetoOriginal(null)} className="ml-1 text-gray-400 dark:text-gray-500 hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {!pendingProjetoOriginal && editing?.projeto_original && (
                    <span className="text-sm text-gray-500 dark:text-gray-400 italic">Atual: {editing.projeto_original.name}</span>
                  )}
                </div>
              </div>
              {needsQualificacao(form.curso) && (
                <div className="col-span-2 flex items-center gap-2.5">
                  <Checkbox
                    id="exame-qualificacao"
                    checked={form.exame_qualificacao}
                    onCheckedChange={v => setForm(f => ({ ...f, exame_qualificacao: Boolean(v) }))}
                  />
                  <Label htmlFor="exame-qualificacao" className="cursor-pointer font-normal">
                    Exame de Qualificação realizado
                  </Label>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editing ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
