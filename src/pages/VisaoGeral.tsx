import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import {
  Plus, GripVertical, Check, Trash2, Tag, Code2,
  LayoutDashboard, Layers, CalendarDays, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { loadAllUserTasks, loadAllProfiles, saveUserTasks, loadUsersIndex, generateId } from '@/lib/storage'
import { emailInitials, emailSlug, todayISO } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/toast'
import type { Task, UserTasks, UserProfile } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────

type ViewMode = 'user' | 'front' | 'deadline'

interface EnrichedTask { task: Task; email: string; profile: UserProfile | undefined }

type FakeProvided = {
  innerRef: (el: HTMLElement | null) => void
  draggableProps: React.HTMLAttributes<HTMLElement>
  dragHandleProps: React.HTMLAttributes<HTMLElement> | null
}

// ─── Front color system ───────────────────────────────────────────────────

const FRONT_COLORS = [
  { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-500', borderL: 'border-l-blue-500' },
  { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400', dot: 'bg-purple-500', borderL: 'border-l-purple-500' },
  { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', dot: 'bg-green-500', borderL: 'border-l-green-500' },
  { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-700 dark:text-teal-400', dot: 'bg-teal-500', borderL: 'border-l-teal-500' },
  { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', dot: 'bg-orange-500', borderL: 'border-l-orange-500' },
  { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-400', dot: 'bg-pink-500', borderL: 'border-l-pink-500' },
  { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-400', dot: 'bg-indigo-500', borderL: 'border-l-indigo-500' },
  { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-400', dot: 'bg-rose-500', borderL: 'border-l-rose-500' },
  { bg: 'bg-lime-100 dark:bg-lime-900/30', text: 'text-lime-700 dark:text-lime-400', dot: 'bg-lime-500', borderL: 'border-l-lime-500' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-400', dot: 'bg-cyan-500', borderL: 'border-l-cyan-500' },
] as const

function frontColor(front: string) {
  const hash = front.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return FRONT_COLORS[hash % FRONT_COLORS.length]
}

// ─── Date helpers ─────────────────────────────────────────────────────────

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
  return `${d.getDate()} ${months[d.getMonth()]}`
}

function datePillClass(dueDate: string | undefined, today: string): string {
  if (!dueDate) return ''
  if (dueDate < today) return 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
  if (dueDate === today) return 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
  return 'bg-gray-100 text-gray-500 dark:bg-gray-700/60 dark:text-gray-400'
}

function addDays(n: number): string {
  return new Date(Date.now() + n * 86400000).toISOString().split('T')[0]
}

// ─── Embed Dialog ─────────────────────────────────────────────────────────

function EmbedDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session } = useAuth()
  const [copied, setCopied] = useState(false)

  const embedCode = (() => {
    if (!session?.githubConfig) return ''
    const { owner, repo, branch, token } = session.githubConfig
    const payload = JSON.stringify({ owner, repo, branch, token })
    const b64 = btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const base = window.location.href.split('#')[0]
    return `<iframe src="${base}#/embed/visao-geral/${b64}" width="100%" height="600" frameborder="0" style="border-radius:12px;border:1px solid #e5e7eb"></iframe>`
  })()

  function copy() {
    navigator.clipboard.writeText(embedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Código de incorporação — Visão Geral</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Cole este código em qualquer página HTML. O token do GitHub está embutido — use apenas em ambientes confiáveis.
          </p>
          <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 font-mono text-xs text-gray-700 dark:text-gray-300 break-all select-all">
            {embedCode}
          </div>
          <Button onClick={copy} className="bg-amber-500 hover:bg-amber-600 text-white">
            {copied ? 'Copiado!' : 'Copiar código'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── User Pill (for FrontView / DeadlineView) ─────────────────────────────

function UserPill({ email, profile }: { email: string; profile: UserProfile | undefined }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 flex-shrink-0">
      {profile?.imagemBase64
        ? <img src={profile.imagemBase64} className="w-3 h-3 rounded-full object-cover" alt="" />
        : <span className="font-bold text-[10px]">{emailInitials(email)}</span>
      }
      <span>{profile?.nome?.split(' ')[0] || email.split('@')[0]}</span>
    </span>
  )
}

// ─── Task Row ─────────────────────────────────────────────────────────────

function TaskRow({
  task, canEdit, provided, isDragging,
  onToggle, onChangeTitle, onChangeDate, onChangeFront, onDelete, onBlur, autoFocus,
  allFronts,
}: {
  task: Task
  canEdit: boolean
  provided: FakeProvided
  isDragging: boolean
  onToggle: () => void
  onChangeTitle: (v: string) => void
  onChangeDate: (v: string) => void
  onChangeFront: (v: string) => void
  onDelete: () => void
  onBlur: () => void
  autoFocus: boolean
  allFronts: string[]
}) {
  const titleRef = useRef<HTMLInputElement>(null)
  const frontRef = useRef<HTMLInputElement>(null)
  const [editingDate, setEditingDate] = useState(false)
  const [editingFront, setEditingFront] = useState(false)
  const [frontDraft, setFrontDraft] = useState(task.front ?? '')

  useEffect(() => { if (autoFocus) titleRef.current?.focus() }, [autoFocus])
  useEffect(() => { if (editingFront) frontRef.current?.select() }, [editingFront])
  useEffect(() => { if (!editingFront) setFrontDraft(task.front ?? '') }, [task.front, editingFront])

  const today = todayISO()
  const dateClass = datePillClass(task.dueDate, today)
  const fc = task.front ? frontColor(task.front) : null
  const showGhosts = canEdit && !task.completed
  const showSubLine = !!task.dueDate || !!task.front || showGhosts

  function commitFront() {
    setEditingFront(false)
    onChangeFront(frontDraft.trim())
  }

  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      className={`group py-1.5 px-2 rounded-md transition-colors ${isDragging ? 'bg-amber-50 shadow-md' : ''} ${task.completed ? 'opacity-50' : ''}`}
    >
      {/* Main line */}
      <div className="flex items-center gap-2">
        {/* Grip or spacer */}
        <div
          {...(provided.dragHandleProps ?? {})}
          className={`w-3.5 flex-shrink-0 ${canEdit ? 'opacity-0 group-hover:opacity-40 cursor-grab' : ''}`}
        >
          {canEdit && <GripVertical className="w-3.5 h-3.5 text-gray-400" />}
        </div>

        {/* Checkbox */}
        <button
          onClick={onToggle}
          disabled={!canEdit}
          className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
            task.completed
              ? 'bg-amber-500 border-amber-500 text-white'
              : 'border-gray-300 dark:border-gray-600 hover:border-amber-400'
          } ${!canEdit ? 'cursor-default' : ''}`}
        >
          {task.completed && <Check className="w-2.5 h-2.5" />}
        </button>

        {/* Title */}
        <input
          ref={titleRef}
          readOnly={!canEdit}
          className={`flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 outline-none min-w-0 ${
            task.completed ? 'line-through text-gray-400' : ''
          } ${canEdit ? 'focus:bg-amber-50 dark:focus:bg-amber-950/20 rounded px-1 -mx-1' : ''}`}
          value={task.title}
          onChange={e => onChangeTitle(e.target.value)}
          onBlur={onBlur}
          placeholder="Tarefa…"
        />

        {/* Delete */}
        {canEdit && (
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all flex-shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Sub-line: date pill + front pill */}
      {showSubLine && (
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5 pl-[46px]">
          {/* Date pill */}
          {editingDate ? (
            <input
              type="date"
              autoFocus
              value={task.dueDate ?? ''}
              onChange={e => { onChangeDate(e.target.value || ''); setEditingDate(false) }}
              onBlur={() => setEditingDate(false)}
              className="text-xs px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 outline-none"
            />
          ) : task.dueDate ? (
            <button
              onClick={() => { if (canEdit) setEditingDate(true) }}
              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${dateClass} ${canEdit ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
            >
              <CalendarDays className="w-3 h-3" />
              {formatDateShort(task.dueDate)}
            </button>
          ) : showGhosts ? (
            <button
              onClick={() => setEditingDate(true)}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-gray-300 dark:text-gray-600 hover:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <CalendarDays className="w-3 h-3" />
              + Data
            </button>
          ) : null}

          {/* Front pill */}
          {editingFront ? (
            <>
              <input
                ref={frontRef}
                type="text"
                list={`fronts-${task.id}`}
                value={frontDraft}
                onChange={e => setFrontDraft(e.target.value)}
                onBlur={commitFront}
                onKeyDown={e => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') { setFrontDraft(task.front ?? ''); setEditingFront(false) }
                }}
                className="text-xs px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 outline-none w-32"
                placeholder="Nome da frente…"
              />
              <datalist id={`fronts-${task.id}`}>
                {allFronts.map(f => <option key={f} value={f} />)}
              </datalist>
            </>
          ) : fc ? (
            <button
              onClick={() => { if (canEdit) setEditingFront(true) }}
              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${fc.bg} ${fc.text} ${canEdit ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
            >
              <Tag className="w-2.5 h-2.5" />
              {task.front}
            </button>
          ) : showGhosts ? (
            <button
              onClick={() => setEditingFront(true)}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-gray-300 dark:text-gray-600 hover:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Tag className="w-2.5 h-2.5" />
              + Frente
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

// ─── User Block ───────────────────────────────────────────────────────────

function UserBlock({
  userTasks, profile, canEdit, allFronts, onSave,
}: {
  userTasks: UserTasks
  profile: UserProfile | undefined
  canEdit: boolean
  allFronts: string[]
  onSave: (ut: UserTasks) => void
}) {
  const [current, setCurrent] = useState<UserTasks>(userTasks)
  const [newTaskId, setNewTaskId] = useState<string | null>(null)
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setCurrent(userTasks) }, [userTasks])

  const scheduleSave = useCallback((ut: UserTasks) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => onSave(ut), 800)
  }, [onSave])

  function update(ut: UserTasks) { setCurrent(ut); scheduleSave(ut) }

  function handleToggle(id: string) {
    if (!canEdit) return
    const now = new Date().toISOString()
    const tasks = current.tasks.map(t =>
      t.id === id ? { ...t, completed: !t.completed, completedAt: !t.completed ? now : undefined } : t
    )
    update({ ...current, tasks })
  }

  function handleChangeTitle(id: string, title: string) {
    setCurrent(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === id ? { ...t, title } : t) }))
  }

  function handleChangeDate(id: string, dueDate: string) {
    const tasks = current.tasks.map(t => t.id === id ? { ...t, dueDate: dueDate || undefined } : t)
    update({ ...current, tasks })
  }

  function handleChangeFront(id: string, front: string) {
    const tasks = current.tasks.map(t => t.id === id ? { ...t, front: front || undefined } : t)
    update({ ...current, tasks })
  }

  function handleDelete(id: string) {
    const tasks = current.tasks.filter(t => t.id !== id).map((t, i) => ({ ...t, order: i }))
    update({ ...current, tasks })
  }

  function handleBlur() {
    const tasks = current.tasks.filter(t => t.title.trim()).map((t, i) => ({ ...t, order: i }))
    const ut = { ...current, tasks }
    setCurrent(ut)
    onSave(ut)
    setNewTaskId(null)
  }

  function handleAddTask() {
    if (!canEdit) return
    const id = generateId()
    const newTask: Task = { id, title: '', completed: false, order: current.tasks.length, createdAt: new Date().toISOString() }
    setCurrent(prev => ({ ...prev, tasks: [...prev.tasks, newTask] }))
    setNewTaskId(id)
  }

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return
    const pending = current.tasks.filter(t => !t.completed)
    const done = current.tasks.filter(t => t.completed)
    const [moved] = pending.splice(result.source.index, 1)
    pending.splice(result.destination.index, 0, moved)
    update({ ...current, tasks: [...pending.map((t, i) => ({ ...t, order: i })), ...done] })
  }

  const pending = current.tasks.filter(t => !t.completed).sort((a, b) => a.order - b.order)
  const done = current.tasks.filter(t => t.completed)

  const fakeProvided: FakeProvided = { innerRef: () => {}, draggableProps: {}, dragHandleProps: null }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        {profile?.imagemBase64
          ? <img src={profile.imagemBase64} className="w-9 h-9 rounded-full object-cover flex-shrink-0" alt="" />
          : (
            <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">{emailInitials(current.email)}</span>
            </div>
          )
        }
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{profile?.nome || current.email}</p>
          {profile?.nome && <p className="text-xs text-gray-400 truncate">{current.email}</p>}
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
          pending.length > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' : 'bg-gray-100 text-gray-400'
        }`}>
          {pending.length} {pending.length === 1 ? 'pendência' : 'pendências'}
        </span>
      </div>

      <div className="px-2 py-2">
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId={`tasks-${emailSlug(current.email)}`} isDropDisabled={!canEdit}>
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                {pending.map((task, index) => (
                  <Draggable key={task.id} draggableId={task.id} index={index} isDragDisabled={!canEdit}>
                    {(prov, snap) => (
                      <TaskRow
                        task={task} canEdit={canEdit}
                        provided={prov} isDragging={snap.isDragging}
                        onToggle={() => handleToggle(task.id)}
                        onChangeTitle={v => handleChangeTitle(task.id, v)}
                        onChangeDate={v => handleChangeDate(task.id, v)}
                        onChangeFront={v => handleChangeFront(task.id, v)}
                        onDelete={() => handleDelete(task.id)}
                        onBlur={handleBlur}
                        autoFocus={task.id === newTaskId}
                        allFronts={allFronts}
                      />
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        {pending.length === 0 && done.length === 0 && (
          <p className="text-xs text-gray-300 dark:text-gray-600 italic px-2 py-1 select-none">Nenhuma tarefa.</p>
        )}

        {canEdit && (
          <button
            onClick={handleAddTask}
            className="flex items-center gap-1.5 mt-1 text-xs text-amber-500 hover:text-amber-700 px-2 py-1 rounded-md hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Nova tarefa
          </button>
        )}

        {done.length > 0 && (
          <div className="mt-2 border-t border-gray-100 dark:border-gray-700 pt-2">
            {done.map(task => (
              <TaskRow
                key={task.id} task={task} canEdit={canEdit}
                provided={fakeProvided} isDragging={false}
                onToggle={() => handleToggle(task.id)}
                onChangeTitle={v => handleChangeTitle(task.id, v)}
                onChangeDate={v => handleChangeDate(task.id, v)}
                onChangeFront={v => handleChangeFront(task.id, v)}
                onDelete={() => handleDelete(task.id)}
                onBlur={handleBlur}
                autoFocus={false}
                allFronts={allFronts}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Front View ───────────────────────────────────────────────────────────

function FrontCard({
  front, tasks, canCreate, onCreateTask,
}: {
  front: string
  tasks: EnrichedTask[]
  canCreate: boolean
  onCreateTask: (title: string) => void
}) {
  const [showDone, setShowDone] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const addInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (isAdding) addInputRef.current?.focus() }, [isAdding])

  const pending = [...tasks.filter(et => !et.task.completed)].sort((a, b) => {
    if (!a.task.dueDate && !b.task.dueDate) return 0
    if (!a.task.dueDate) return 1
    if (!b.task.dueDate) return -1
    return a.task.dueDate.localeCompare(b.task.dueDate)
  })
  const done = tasks.filter(et => et.task.completed)
  const fc = front !== 'Sem frente' ? frontColor(front) : null
  const today = todayISO()

  function commitAdd() {
    if (newTitle.trim()) onCreateTask(newTitle.trim())
    setNewTitle('')
    setIsAdding(false)
  }

  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden border-l-4 ${fc ? fc.borderL : 'border-l-gray-300 dark:border-l-gray-600'}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2 min-w-0">
          {fc && <div className={`w-2 h-2 rounded-full flex-shrink-0 ${fc.dot}`} />}
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{front}</h3>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${
          pending.length > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' : 'bg-gray-100 text-gray-400'
        }`}>
          {pending.length}
        </span>
      </div>

      <div className="px-3 py-2 space-y-1">
        {pending.map(({ task, email, profile }) => (
          <div key={task.id} className="flex items-start gap-2 py-1.5">
            <div className="w-3.5 h-3.5 rounded border border-gray-300 dark:border-gray-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">{task.title}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <UserPill email={email} profile={profile} />
                {task.dueDate && (
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${datePillClass(task.dueDate, today)}`}>
                    <CalendarDays className="w-3 h-3" />
                    {formatDateShort(task.dueDate)}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}

        {pending.length === 0 && done.length === 0 && !isAdding && (
          <p className="text-xs text-gray-300 dark:text-gray-600 italic py-1">Nenhuma tarefa pendente.</p>
        )}

        {done.length > 0 && (
          <div className="border-t border-gray-100 dark:border-gray-700 mt-1 pt-1">
            <button
              onClick={() => setShowDone(v => !v)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
            >
              {showDone ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {done.length} {done.length === 1 ? 'concluída' : 'concluídas'}
            </button>
            {showDone && done.map(({ task, email, profile }) => (
              <div key={task.id} className="flex items-center gap-2 py-1 opacity-40">
                <div className="w-3.5 h-3.5 rounded border border-amber-400 bg-amber-400 flex-shrink-0 flex items-center justify-center">
                  <Check className="w-2 h-2 text-white" />
                </div>
                <span className="text-sm text-gray-400 line-through flex-1 truncate">{task.title}</span>
                <UserPill email={email} profile={profile} />
              </div>
            ))}
          </div>
        )}

        {/* Inline new task */}
        {canCreate && (
          isAdding ? (
            <div className="flex items-center gap-2 pt-1">
              <div className="w-3.5 h-3.5 rounded border border-gray-300 dark:border-gray-600 flex-shrink-0" />
              <input
                ref={addInputRef}
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onBlur={commitAdd}
                onKeyDown={e => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') { setNewTitle(''); setIsAdding(false) }
                }}
                placeholder="Nova tarefa…"
                className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 outline-none border-b border-amber-300 dark:border-amber-600 pb-0.5"
              />
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-1.5 mt-1 text-xs text-amber-500 hover:text-amber-700 px-1 py-1 rounded-md hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Nova tarefa
            </button>
          )
        )}
      </div>
    </div>
  )
}

function FrontView({
  allTasks, profileMap, canCreate, onCreateTask,
}: {
  allTasks: UserTasks[]
  profileMap: Map<string, UserProfile>
  canCreate: boolean
  onCreateTask: (front: string, title: string) => void
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, EnrichedTask[]>()
    for (const ut of allTasks) {
      for (const task of ut.tasks) {
        const key = task.front?.trim() || 'Sem frente'
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push({ task, email: ut.email, profile: profileMap.get(ut.email) })
      }
    }
    const entries = [...map.entries()].sort(([a], [b]) => {
      if (a === 'Sem frente') return 1
      if (b === 'Sem frente') return -1
      return a.localeCompare(b, 'pt-BR')
    })
    return entries
  }, [allTasks, profileMap])

  if (grouped.length === 0) return (
    <p className="text-center text-gray-400 py-16">Nenhuma tarefa cadastrada ainda.</p>
  )

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {grouped.map(([front, tasks]) => (
        <FrontCard
          key={front}
          front={front}
          tasks={tasks}
          canCreate={canCreate}
          onCreateTask={title => onCreateTask(front, title)}
        />
      ))}
    </div>
  )
}

// ─── Deadline View ────────────────────────────────────────────────────────

type DeadlineBucket = 'overdue' | 'today' | 'week' | 'upcoming' | 'none'

const BUCKET_CONFIG: Record<DeadlineBucket, { label: string; headerClass: string; dotClass: string }> = {
  overdue: { label: 'Atrasadas', headerClass: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/30', dotClass: 'bg-red-500' },
  today:   { label: 'Hoje',      headerClass: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900/30', dotClass: 'bg-amber-500' },
  week:    { label: 'Esta semana', headerClass: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/30', dotClass: 'bg-blue-500' },
  upcoming:{ label: 'Próximas',  headerClass: 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700', dotClass: 'bg-gray-400' },
  none:    { label: 'Sem prazo', headerClass: 'text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700', dotClass: 'bg-gray-300' },
}

function getDeadlineBucket(dueDate: string | undefined, today: string, in7: string): DeadlineBucket {
  if (!dueDate) return 'none'
  if (dueDate < today) return 'overdue'
  if (dueDate === today) return 'today'
  if (dueDate <= in7) return 'week'
  return 'upcoming'
}

function DeadlineView({ allTasks, profileMap }: { allTasks: UserTasks[]; profileMap: Map<string, UserProfile> }) {
  const today = todayISO()
  const in7 = addDays(7)

  const bucketed = useMemo(() => {
    const buckets: Record<DeadlineBucket, EnrichedTask[]> = { overdue: [], today: [], week: [], upcoming: [], none: [] }
    for (const ut of allTasks) {
      for (const task of ut.tasks.filter(t => !t.completed)) {
        const bucket = getDeadlineBucket(task.dueDate, today, in7)
        buckets[bucket].push({ task, email: ut.email, profile: profileMap.get(ut.email) })
      }
    }
    // Sort each bucket by dueDate asc (none bucket: by email then order)
    for (const key of Object.keys(buckets) as DeadlineBucket[]) {
      if (key === 'none') {
        buckets[key].sort((a, b) => a.email.localeCompare(b.email) || a.task.order - b.task.order)
      } else {
        buckets[key].sort((a, b) => (a.task.dueDate ?? '').localeCompare(b.task.dueDate ?? ''))
      }
    }
    return buckets
  }, [allTasks, profileMap, today, in7])

  const orderedBuckets: DeadlineBucket[] = ['overdue', 'today', 'week', 'upcoming', 'none']
  const hasAny = orderedBuckets.some(b => bucketed[b].length > 0)

  if (!hasAny) return (
    <p className="text-center text-gray-400 py-16">Nenhuma tarefa pendente.</p>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {orderedBuckets.map(bucket => {
        const tasks = bucketed[bucket]
        if (tasks.length === 0) return null
        const cfg = BUCKET_CONFIG[bucket]
        return (
          <div key={bucket}>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border mb-3 ${cfg.headerClass}`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dotClass}`} />
              <span className="text-sm font-semibold">{cfg.label}</span>
              <span className="text-xs opacity-70">({tasks.length})</span>
            </div>
            <div className="space-y-1 pl-2">
              {tasks.map(({ task, email, profile }) => {
                const fc = task.front ? frontColor(task.front) : null
                return (
                  <div key={`${email}-${task.id}`} className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors group">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${cfg.dotClass}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">{task.title}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <UserPill email={email} profile={profile} />
                        {task.dueDate && bucket !== 'none' && (
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${datePillClass(task.dueDate, today)}`}>
                            <CalendarDays className="w-3 h-3" />
                            {formatDateShort(task.dueDate)}
                          </span>
                        )}
                        {fc && (
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${fc.bg} ${fc.text}`}>
                            <Tag className="w-2.5 h-2.5" />
                            {task.front}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export function VisaoGeral() {
  const { session } = useAuth()
  const { toasts, toast, dismiss } = useToast()
  const [allTasks, setAllTasks] = useState<UserTasks[]>([])
  const [profiles, setProfiles] = useState<UserProfile[]>([])
  const [emails, setEmails] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [embedOpen, setEmbedOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('user')
  const savingRef = useRef<Map<string, Promise<void>>>(new Map())

  useEffect(() => {
    async function load() {
      try {
        const [idx, tasks, profs] = await Promise.all([
          loadUsersIndex(),
          loadAllUserTasks(),
          loadAllProfiles(),
        ])
        setEmails(idx.emails)
        setAllTasks(tasks)
        setProfiles(profs)
        if (session?.email) {
          const existing = tasks.find(t => t.email === session.email)
          const ut = existing ?? { email: session.email, tasks: [], lastAccess: new Date().toISOString() }
          saveUserTasks({ ...ut, lastAccess: new Date().toISOString() }).catch(() => {})
        }
      } catch {
        toast({ title: 'Erro ao carregar dados', variant: 'destructive' })
      } finally {
        setLoading(false)
      }
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSave(ut: UserTasks) {
    setAllTasks(prev => {
      const exists = prev.find(x => x.email === ut.email)
      return exists ? prev.map(x => x.email === ut.email ? ut : x) : [...prev, ut]
    })
    const inFlight = savingRef.current.get(ut.email)
    const promise = (inFlight ?? Promise.resolve())
      .then(() => saveUserTasks(ut))
      .catch(() => toast({ title: 'Erro ao salvar tarefas', variant: 'destructive' }))
      .finally(() => { if (savingRef.current.get(ut.email) === promise) savingRef.current.delete(ut.email) })
    savingRef.current.set(ut.email, promise)
  }

  const userTasksMap = new Map(allTasks.map(ut => [ut.email, ut]))
  const allEmails = [...new Set([...emails, ...allTasks.map(ut => ut.email)])]
  const sortedEmails = [...allEmails].sort((a, b) => {
    if (a === session?.email) return -1
    if (b === session?.email) return 1
    const la = userTasksMap.get(a)?.lastAccess ?? ''
    const lb = userTasksMap.get(b)?.lastAccess ?? ''
    return lb.localeCompare(la) || a.localeCompare(b)
  })
  const profileMap = new Map(profiles.map(p => [p.email, p]))

  const allFronts = useMemo(() => {
    const fronts = new Set<string>()
    allTasks.forEach(ut => ut.tasks.forEach(t => { if (t.front) fronts.add(t.front) }))
    return [...fronts].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [allTasks])

  function handleCreateTaskInFront(front: string, title: string) {
    if (!session?.email || !title.trim()) return
    const email = session.email
    const existing = allTasks.find(ut => ut.email === email) ?? { email, tasks: [], lastAccess: new Date().toISOString() }
    const newTask: Task = {
      id: generateId(),
      title: title.trim(),
      completed: false,
      order: existing.tasks.filter(t => !t.completed).length,
      createdAt: new Date().toISOString(),
      front: front !== 'Sem frente' ? front : undefined,
    }
    handleSave({ ...existing, tasks: [...existing.tasks, newTask] })
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const VIEW_MODES: { mode: ViewMode; icon: React.ElementType; title: string }[] = [
    { mode: 'user',     icon: LayoutDashboard, title: 'Por Usuário' },
    { mode: 'front',    icon: Layers,          title: 'Por Frente de Trabalho' },
    { mode: 'deadline', icon: CalendarDays,    title: 'Por Prazos' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Visão Geral</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Tarefas do grupo de pesquisa</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View mode icon buttons */}
          <div className="flex items-center gap-0.5">
            {VIEW_MODES.map(({ mode, icon: Icon, title }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={title}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === mode
                    ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400'
                }`}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEmbedOpen(true)}
            className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400"
          >
            <Code2 className="w-4 h-4" />
            Incorporar
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="animate-fade-in">
        {viewMode === 'user' && (
          sortedEmails.length === 0 ? (
            <p className="text-center text-gray-400 py-16">Nenhum usuário cadastrado. Adicione membros no módulo Usuários.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {sortedEmails.map(email => {
                const ut = userTasksMap.get(email) ?? { email, tasks: [], lastAccess: '' }
                const canEdit = session?.email === email || session?.isAdmin === true
                return (
                  <UserBlock
                    key={email}
                    userTasks={ut}
                    profile={profileMap.get(email)}
                    canEdit={canEdit}
                    allFronts={allFronts}
                    onSave={handleSave}
                  />
                )
              })}
            </div>
          )
        )}

        {viewMode === 'front' && (
          <FrontView
            allTasks={allTasks}
            profileMap={profileMap}
            canCreate={!!session?.email}
            onCreateTask={handleCreateTaskInFront}
          />
        )}

        {viewMode === 'deadline' && (
          <DeadlineView allTasks={allTasks} profileMap={profileMap} />
        )}
      </div>

      <EmbedDialog open={embedOpen} onClose={() => setEmbedOpen(false)} />
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
