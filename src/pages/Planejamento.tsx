import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import {
  Plus, Calendar, Archive, ChevronDown, ChevronRight, Trash2,
  GripVertical, BookOpen, X, Edit2, ArchiveRestore, Star,
} from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/toast'
import { loadMeetingPlans, saveMeetingPlan, deleteMeetingPlan, generateId } from '@/lib/storage'
import type { MeetingPlan, PlannedMeeting, PlanReading } from '@/types'
import { useAuth } from '@/contexts/AuthContext'

// ─── Date helpers ─────────────────────────────────────────────────────────

const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const WEEKDAYS_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS_PT[m - 1]} ${y}`
}

function fmtDateShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

function isoToday(): string {
  return new Date().toISOString().split('T')[0]
}

function addWeeks(iso: string, weeks: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + weeks * 7)
  return d.toISOString().split('T')[0]
}

function nextWeekday(from: string, weekday: number): string {
  const d = new Date(from + 'T12:00:00')
  const diff = (weekday - d.getDay() + 7) % 7
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function generateMeetings(plan: Pick<MeetingPlan, 'startDate' | 'endDate' | 'weekday' | 'intervalWeeks'>): PlannedMeeting[] {
  const meetings: PlannedMeeting[] = []
  let cur = nextWeekday(plan.startDate, plan.weekday)
  while (cur <= plan.endDate) {
    meetings.push({ id: generateId(), date: cur, isSpecial: false, description: '' })
    cur = addWeeks(cur, plan.intervalWeeks)
  }
  return meetings
}

function sortMeetings(meetings: PlannedMeeting[]): PlannedMeeting[] {
  return [...meetings].sort((a, b) => a.date.localeCompare(b.date))
}

// ─── Plan form dialog ─────────────────────────────────────────────────────

interface PlanFormProps {
  initial?: Partial<MeetingPlan>
  onSave: (data: Pick<MeetingPlan, 'name' | 'startDate' | 'endDate' | 'weekday' | 'intervalWeeks'>) => void
  onClose: () => void
}

function PlanFormDialog({ initial, onSave, onClose }: PlanFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [startDate, setStartDate] = useState(initial?.startDate ?? isoToday())
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')
  const [weekday, setWeekday] = useState(initial?.weekday ?? 5)
  const [intervalWeeks, setIntervalWeeks] = useState(initial?.intervalWeeks ?? 2)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !startDate || !endDate) return
    onSave({ name: name.trim(), startDate, endDate, weekday, intervalWeeks })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-5">
          {initial?.id ? 'Editar plano' : 'Novo plano de reuniões'}
        </h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome do plano</label>
            <input
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: 2º Semestre 2026"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Início</label>
              <input type="date" className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                value={startDate} onChange={e => setStartDate(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Término</label>
              <input type="date" className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                value={endDate} onChange={e => setEndDate(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dia da semana</label>
              <select className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                value={weekday} onChange={e => setWeekday(Number(e.target.value))}>
                {WEEKDAYS_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Periodicidade</label>
              <select className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                value={intervalWeeks} onChange={e => setIntervalWeeks(Number(e.target.value))}>
                <option value={1}>Semanal</option>
                <option value={2}>Quinzenal</option>
                <option value={3}>A cada 3 semanas</option>
                <option value={4}>Mensal</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              Cancelar
            </button>
            <button type="submit"
              className="px-4 py-2 text-sm rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors">
              {initial?.id ? 'Salvar' : 'Criar plano'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Special meeting dialog ───────────────────────────────────────────────

function SpecialMeetingDialog({ onAdd, onClose }: { onAdd: (m: PlannedMeeting) => void; onClose: () => void }) {
  const [date, setDate] = useState(isoToday())
  const [description, setDescription] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!date) return
    onAdd({ id: generateId(), date, isSpecial: true, description })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Reunião especial</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data</label>
            <input type="date" className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              value={date} onChange={e => setDate(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição (opcional)</label>
            <input className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Motivação do encontro" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              Cancelar
            </button>
            <button type="submit"
              className="px-4 py-2 text-sm rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors">
              Adicionar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Reading form ─────────────────────────────────────────────────────────

function ReadingForm({ onAdd, onClose }: { onAdd: (r: PlanReading) => void; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [year, setYear] = useState('')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    onAdd({ id: generateId(), title: title.trim(), authors: authors.trim() || undefined, year: year.trim() || undefined, url: url.trim() || undefined, notes: notes.trim() || undefined })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Adicionar leitura ao acervo</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Título *</label>
            <input className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              value={title} onChange={e => setTitle(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Autor(es)</label>
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                value={authors} onChange={e => setAuthors(e.target.value)} placeholder="Sobrenome, Prenome" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ano</label>
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                value={year} onChange={e => setYear(e.target.value)} placeholder="2024" maxLength={4} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL (opcional)</label>
            <input className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observações</label>
            <textarea className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              Cancelar
            </button>
            <button type="submit"
              className="px-4 py-2 text-sm rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors">
              Adicionar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Meeting card ─────────────────────────────────────────────────────────

function MeetingCard({
  meeting, readings, provided, onDescChange, onRemoveReading, onDeleteMeeting,
}: {
  meeting: PlannedMeeting
  readings: PlanReading[]
  provided: { innerRef: (el: HTMLElement | null) => void; draggableProps: Record<string, unknown>; dragHandleProps: Record<string, unknown> | null }
  onDescChange: (desc: string) => void
  onRemoveReading: () => void
  onDeleteMeeting: () => void
}) {
  const assignedReading = readings.find(r => r.id === meeting.readingId)
  const isPast = meeting.date < isoToday()

  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      className={`rounded-xl border p-4 mb-3 bg-white dark:bg-gray-900 ${meeting.isSpecial ? 'border-amber-300 dark:border-amber-700' : 'border-gray-200 dark:border-gray-700'} ${isPast ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex flex-col items-center pt-0.5 min-w-[40px]">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{fmtDateShort(meeting.date)}</span>
          <span className="text-[10px] text-gray-400">{WEEKDAYS_PT[new Date(meeting.date + 'T12:00:00').getDay()]}</span>
          {meeting.isSpecial && <Star className="w-3 h-3 text-amber-500 mt-1" />}
        </div>
        <div className="flex-1 min-w-0">
          {/* Description */}
          <input
            className="w-full text-sm bg-transparent border-none outline-none text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-600"
            value={meeting.description ?? ''}
            onChange={e => onDescChange(e.target.value)}
            placeholder="Descrição / motivação do encontro…"
          />
          {/* Assigned reading drop zone */}
          <Droppable droppableId={`meeting-${meeting.id}`} type="reading">
            {(dropProvided, snapshot) => (
              <div
                ref={dropProvided.innerRef}
                {...dropProvided.droppableProps}
                className={`mt-2 rounded-lg min-h-[2rem] transition-colors ${
                  assignedReading
                    ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2'
                    : snapshot.isDraggingOver
                    ? 'bg-amber-50 dark:bg-amber-950/30 border-2 border-dashed border-amber-400 px-3 py-2'
                    : 'border-2 border-dashed border-gray-200 dark:border-gray-700 px-3 py-1'
                }`}
              >
                {assignedReading ? (
                  <div className="flex items-start gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-amber-800 dark:text-amber-300 truncate">{assignedReading.title}</p>
                      {assignedReading.authors && <p className="text-[10px] text-amber-600 dark:text-amber-400 truncate">{assignedReading.authors}{assignedReading.year ? `, ${assignedReading.year}` : ''}</p>}
                    </div>
                    <button onClick={onRemoveReading} className="shrink-0 text-amber-400 hover:text-amber-600 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-400 dark:text-gray-600 text-center">Arraste uma leitura aqui</p>
                )}
                {dropProvided.placeholder}
              </div>
            )}
          </Droppable>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {meeting.isSpecial && (
            <button onClick={onDeleteMeeting} className="p-1 text-gray-400 hover:text-red-500 transition-colors" title="Remover">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <div {...(provided.dragHandleProps as React.HTMLAttributes<HTMLDivElement>)} className="cursor-grab p-1 text-gray-300 hover:text-gray-500">
            <GripVertical className="w-4 h-4" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Plan detail panel ────────────────────────────────────────────────────

function PlanDetail({
  plan,
  onUpdate,
  onArchive,
  onDelete,
}: {
  plan: MeetingPlan
  onUpdate: (p: MeetingPlan) => void
  onArchive: () => void
  onDelete: () => void
}) {
  const [showSpecialDialog, setShowSpecialDialog] = useState(false)
  const [showReadingForm, setShowReadingForm] = useState(false)
  const [editingPlan, setEditingPlan] = useState(false)

  const sortedMeetings = useMemo(() => sortMeetings(plan.meetings), [plan.meetings])

  function updateMeetingDesc(id: string, desc: string) {
    onUpdate({ ...plan, meetings: plan.meetings.map(m => m.id === id ? { ...m, description: desc } : m) })
  }

  function removeReadingFromMeeting(meetingId: string) {
    onUpdate({ ...plan, meetings: plan.meetings.map(m => m.id === meetingId ? { ...m, readingId: undefined } : m) })
  }

  function deleteSpecialMeeting(id: string) {
    onUpdate({ ...plan, meetings: plan.meetings.filter(m => m.id !== id) })
  }

  function addSpecialMeeting(m: PlannedMeeting) {
    onUpdate({ ...plan, meetings: [...plan.meetings, m] })
  }

  function addReading(r: PlanReading) {
    onUpdate({ ...plan, readings: [...plan.readings, r] })
  }

  function deleteReading(id: string) {
    onUpdate({
      ...plan,
      readings: plan.readings.filter(r => r.id !== id),
      meetings: plan.meetings.map(m => m.readingId === id ? { ...m, readingId: undefined } : m),
    })
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination) return
    const srcId = result.source.droppableId
    const dstId = result.destination.droppableId
    if (result.type !== 'reading') return

    // dragging from pool → meeting
    if (srcId === 'readings-pool' && dstId.startsWith('meeting-')) {
      const readingId = plan.readings[result.source.index]?.id
      const meetingId = dstId.replace('meeting-', '')
      if (!readingId) return
      onUpdate({ ...plan, meetings: plan.meetings.map(m => m.id === meetingId ? { ...m, readingId } : m) })
    }
    // dragging between meetings
    if (srcId.startsWith('meeting-') && dstId.startsWith('meeting-')) {
      const srcMeetingId = srcId.replace('meeting-', '')
      const dstMeetingId = dstId.replace('meeting-', '')
      const srcMeeting = plan.meetings.find(m => m.id === srcMeetingId)
      if (!srcMeeting?.readingId) return
      onUpdate({
        ...plan,
        meetings: plan.meetings.map(m => {
          if (m.id === srcMeetingId) return { ...m, readingId: undefined }
          if (m.id === dstMeetingId) return { ...m, readingId: srcMeeting.readingId }
          return m
        }),
      })
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{plan.name}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {fmtDate(plan.startDate)} – {fmtDate(plan.endDate)} · {WEEKDAYS_FULL[plan.weekday]}s{plan.intervalWeeks > 1 ? `, a cada ${plan.intervalWeeks} semanas` : ', semanais'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setEditingPlan(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-amber-400 hover:text-amber-600 transition-colors">
              <Edit2 className="w-3 h-3" /> Editar
            </button>
            <button onClick={() => setShowSpecialDialog(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-amber-400 hover:text-amber-600 transition-colors">
              <Star className="w-3 h-3" /> Reunião especial
            </button>
            <button onClick={onArchive}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 transition-colors">
              <Archive className="w-3 h-3" /> {plan.archived ? 'Desarquivar' : 'Arquivar'}
            </button>
            <button onClick={onDelete}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-6 p-6">
          {/* Meetings column */}
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Reuniões <span className="text-gray-400 font-normal">({sortedMeetings.length})</span>
            </h2>
            <Droppable droppableId="meetings-list" type="meeting">
              {(listProvided) => (
                <div ref={listProvided.innerRef} {...listProvided.droppableProps}>
                  {sortedMeetings.map((meeting, index) => (
                    <Draggable key={meeting.id} draggableId={`drag-meeting-${meeting.id}`} index={index}>
                      {(dragProvided) => (
                        <MeetingCard
                          meeting={meeting}
                          readings={plan.readings}
                          provided={{
                            innerRef: dragProvided.innerRef,
                            draggableProps: dragProvided.draggableProps as Record<string, unknown>,
                            dragHandleProps: dragProvided.dragHandleProps as Record<string, unknown> | null,
                          }}
                          onDescChange={desc => updateMeetingDesc(meeting.id, desc)}
                          onRemoveReading={() => removeReadingFromMeeting(meeting.id)}
                          onDeleteMeeting={() => deleteSpecialMeeting(meeting.id)}
                        />
                      )}
                    </Draggable>
                  ))}
                  {listProvided.placeholder}
                </div>
              )}
            </Droppable>
          </div>

          {/* Readings pool column */}
          <div className="w-64 shrink-0">
            <div className="sticky top-[88px]">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <BookOpen className="w-4 h-4" /> Acervo
                </h2>
                <button onClick={() => setShowReadingForm(true)}
                  className="p-1 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <Droppable droppableId="readings-pool" type="reading">
                {(poolProvided) => (
                  <div ref={poolProvided.innerRef} {...poolProvided.droppableProps} className="space-y-2 min-h-[4rem]">
                    {plan.readings.length === 0 && (
                      <p className="text-xs text-gray-400 dark:text-gray-600 text-center py-4">Adicione leituras ao acervo</p>
                    )}
                    {plan.readings.map((reading, index) => (
                      <Draggable key={reading.id} draggableId={`drag-reading-${reading.id}`} index={index}>
                        {(dragProvided, snapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={`rounded-lg border p-2.5 bg-white dark:bg-gray-900 ${snapshot.isDragging ? 'shadow-lg border-amber-400' : 'border-gray-200 dark:border-gray-700'}`}
                          >
                            <div className="flex items-start gap-1.5">
                              <div {...dragProvided.dragHandleProps} className="mt-0.5 cursor-grab text-gray-300 hover:text-gray-500">
                                <GripVertical className="w-3.5 h-3.5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-800 dark:text-gray-200 leading-snug">{reading.title}</p>
                                {reading.authors && <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">{reading.authors}{reading.year ? `, ${reading.year}` : ''}</p>}
                              </div>
                              <button onClick={() => deleteReading(reading.id)}
                                className="shrink-0 text-gray-300 hover:text-red-500 transition-colors">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {poolProvided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          </div>
        </div>
      </DragDropContext>

      {/* Dialogs */}
      {showSpecialDialog && <SpecialMeetingDialog onAdd={addSpecialMeeting} onClose={() => setShowSpecialDialog(false)} />}
      {showReadingForm && <ReadingForm onAdd={addReading} onClose={() => setShowReadingForm(false)} />}
      {editingPlan && (
        <PlanFormDialog
          initial={plan}
          onSave={data => {
            const newMeetings = generateMeetings(data)
            onUpdate({ ...plan, ...data, meetings: [...newMeetings, ...plan.meetings.filter(m => m.isSpecial)] })
            setEditingPlan(false)
          }}
          onClose={() => setEditingPlan(false)}
        />
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function PlanejamentoPage() {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const { toasts, toast, dismiss } = useToast()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNewPlan, setShowNewPlan] = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(false)

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['meeting-plans'],
    queryFn: loadMeetingPlans,
  })

  const saveMutation = useMutation({
    mutationFn: saveMeetingPlan,
    onSuccess: (_, plan) => {
      queryClient.setQueryData(['meeting-plans'], (prev: MeetingPlan[] = []) => {
        const idx = prev.findIndex(p => p.id === plan.id)
        return idx >= 0 ? prev.map(p => p.id === plan.id ? plan : p) : [plan, ...prev]
      })
    },
    onError: () => toast({ title: 'Erro ao salvar', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteMeetingPlan,
    onSuccess: (_, id) => {
      queryClient.setQueryData(['meeting-plans'], (prev: MeetingPlan[] = []) => prev.filter(p => p.id !== id))
      if (selectedId === id) setSelectedId(null)
    },
    onError: () => toast({ title: 'Erro ao excluir', variant: 'destructive' }),
  })

  const activePlans = useMemo(() => plans.filter(p => !p.archived), [plans])
  const archivedPlans = useMemo(() => plans.filter(p => p.archived), [plans])
  const selectedPlan = useMemo(() => plans.find(p => p.id === selectedId) ?? null, [plans, selectedId])

  const handleCreate = useCallback((data: Pick<MeetingPlan, 'name' | 'startDate' | 'endDate' | 'weekday' | 'intervalWeeks'>) => {
    const meetings = generateMeetings(data)
    const plan: MeetingPlan = {
      id: generateId(),
      ...data,
      meetings,
      readings: [],
      archived: false,
      createdAt: new Date().toISOString(),
      createdBy: session?.email ?? '',
    }
    saveMutation.mutate(plan)
    setSelectedId(plan.id)
    setShowNewPlan(false)
    toast({ title: 'Plano criado' })
  }, [session, saveMutation, toast])

  const handleUpdate = useCallback((updated: MeetingPlan) => {
    saveMutation.mutate(updated)
  }, [saveMutation])

  const handleArchive = useCallback((plan: MeetingPlan) => {
    const updated = { ...plan, archived: !plan.archived }
    saveMutation.mutate(updated)
    toast({ title: updated.archived ? 'Plano arquivado' : 'Plano restaurado' })
  }, [saveMutation, toast])

  const handleDelete = useCallback((id: string) => {
    if (!window.confirm('Excluir este plano permanentemente?')) return
    deleteMutation.mutate(id)
    toast({ title: 'Plano excluído' })
  }, [deleteMutation, toast])

  function sidebarItemCls(id: string) {
    const base = 'w-full text-left flex items-center justify-between px-4 py-2.5 text-sm transition-colors border-l-2 rounded-r-lg'
    return selectedId === id
      ? `${base} border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium`
      : `${base} border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200`
  }

  return (
    <div className="flex -mx-6 -mt-6 lg:-mx-8 lg:-mt-8 h-[calc(100dvh-3.5rem)] lg:h-dvh overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 shrink-0">
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-800">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Planos</span>
          <button onClick={() => setShowNewPlan(true)}
            className="p-1 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {isLoading && <p className="text-xs text-gray-400 px-4 py-3">Carregando…</p>}
          {!isLoading && activePlans.length === 0 && (
            <p className="text-xs text-gray-400 px-4 py-3">Nenhum plano ativo. Crie um novo.</p>
          )}
          {activePlans.map(plan => (
            <button key={plan.id} onClick={() => setSelectedId(plan.id)} className={sidebarItemCls(plan.id)}>
              <span className="truncate">{plan.name}</span>
              <span className="text-[10px] text-gray-400 shrink-0 ml-1">{plan.meetings.length}</span>
            </button>
          ))}

          {/* Archived section */}
          {archivedPlans.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setArchivedOpen(o => !o)}
                className="w-full flex items-center gap-2 px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                {archivedOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <Archive className="w-3 h-3" /> Arquivados ({archivedPlans.length})
              </button>
              {archivedOpen && archivedPlans.map(plan => (
                <button key={plan.id} onClick={() => setSelectedId(plan.id)} className={`${sidebarItemCls(plan.id)} opacity-60`}>
                  <span className="truncate">{plan.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-gray-200 dark:border-gray-800">
          <button onClick={() => setShowNewPlan(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors">
            <Plus className="w-4 h-4" /> Novo plano
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {selectedPlan ? (
          <PlanDetail
            key={selectedPlan.id}
            plan={selectedPlan}
            onUpdate={handleUpdate}
            onArchive={() => handleArchive(selectedPlan)}
            onDelete={() => handleDelete(selectedPlan.id)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 gap-4 p-8">
            <Calendar className="w-12 h-12 opacity-30" />
            <div className="text-center">
              <p className="text-sm font-medium">Selecione um plano</p>
              <p className="text-xs mt-1">ou crie um novo para começar</p>
            </div>
            <button onClick={() => setShowNewPlan(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors">
              <Plus className="w-4 h-4" /> Novo plano
            </button>
            {/* Mobile plan list */}
            <div className="lg:hidden w-full max-w-sm mt-4 space-y-2">
              {activePlans.map(plan => (
                <button key={plan.id} onClick={() => setSelectedId(plan.id)}
                  className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-amber-400 transition-colors">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{plan.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{fmtDate(plan.startDate)} – {fmtDate(plan.endDate)}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {showNewPlan && <PlanFormDialog onSave={handleCreate} onClose={() => setShowNewPlan(false)} />}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
