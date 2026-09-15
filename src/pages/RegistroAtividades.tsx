import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, LogIn, FilePlus, FileText, Trash2, UserPlus, UserMinus, Archive, RefreshCw, Search, X } from 'lucide-react'
import { loadActivityLog } from '@/lib/storage'
import { useAuth } from '@/contexts/AuthContext'
import type { ActivityEntry } from '@/types'

const ACTION_META: Record<ActivityEntry['action'], { label: string; icon: React.ElementType; color: string }> = {
  login:   { label: 'Login',    icon: LogIn,    color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/40' },
  create:  { label: 'Criou',    icon: FilePlus, color: 'text-green-600 bg-green-50 dark:bg-green-950/40' },
  update:  { label: 'Atualizou', icon: FileText, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' },
  delete:  { label: 'Removeu',  icon: Trash2,   color: 'text-red-500 bg-red-50 dark:bg-red-950/40' },
  add:     { label: 'Adicionou', icon: UserPlus, color: 'text-green-600 bg-green-50 dark:bg-green-950/40' },
  remove:  { label: 'Removeu',  icon: UserMinus, color: 'text-red-500 bg-red-50 dark:bg-red-950/40' },
  archive: { label: 'Arquivou', icon: Archive,  color: 'text-gray-500 bg-gray-100 dark:bg-gray-800' },
}

const MODULE_COLORS: Record<string, string> = {
  'Login':           'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Wiki':            'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'Orientações':     'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'Usuários':        'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'Ordem do Dia':    'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  'Atas e Decisões': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  'Leituras':        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'Produções':       'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
}

function moduleColor(module: string): string {
  return MODULE_COLORS[module] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'agora mesmo'
  if (mins < 60) return `há ${mins} min`
  if (hours < 24) return `há ${hours}h`
  if (days < 7) return `há ${days} dia${days > 1 ? 's' : ''}`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatFull(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function actorInitial(email: string): string {
  return email[0]?.toUpperCase() ?? '?'
}

function actorShort(email: string): string {
  return email.split('@')[0]
}

// Group entries by date
function groupByDate(entries: ActivityEntry[]): Array<{ date: string; items: ActivityEntry[] }> {
  const map = new Map<string, ActivityEntry[]>()
  for (const e of entries) {
    const d = new Date(e.timestamp)
    const key = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(e)
  }
  return Array.from(map.entries()).map(([date, items]) => ({ date, items }))
}

export function RegistroAtividades() {
  const { session } = useAuth()
  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [actorFilter, setActorFilter] = useState('')

  const { data: log = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['activity-log'],
    queryFn: loadActivityLog,
    staleTime: 30_000,
  })

  if (!session?.isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Activity className="w-10 h-10 text-gray-200 dark:text-gray-700 mb-4" />
        <p className="text-gray-500 dark:text-gray-400 text-sm">Acesso restrito a administradores.</p>
      </div>
    )
  }

  // Derive filter options from log
  const allModules = [...new Set(log.map(e => e.module))].sort()
  const allActors = [...new Set(log.map(e => e.actor))].sort()

  const filtered = log.filter(e => {
    if (moduleFilter && e.module !== moduleFilter) return false
    if (actorFilter && e.actor !== actorFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        e.description.toLowerCase().includes(q) ||
        e.actor.toLowerCase().includes(q) ||
        e.module.toLowerCase().includes(q)
      )
    }
    return true
  })

  const groups = groupByDate(filtered)
  const hasFilters = search || moduleFilter || actorFilter

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-amber-500" />
            Registro de Atividades
          </h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            {log.length} {log.length === 1 ? 'entrada' : 'entradas'} · visível apenas para administradores
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-1 min-w-48">
          <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar nas atividades…"
            className="flex-1 text-sm bg-transparent outline-none text-gray-700 dark:text-gray-300 placeholder:text-gray-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Module filter */}
        <select
          value={moduleFilter}
          onChange={e => setModuleFilter(e.target.value)}
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 outline-none focus:border-amber-400"
        >
          <option value="">Todos os módulos</option>
          {allModules.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        {/* Actor filter */}
        <select
          value={actorFilter}
          onChange={e => setActorFilter(e.target.value)}
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 outline-none focus:border-amber-400"
        >
          <option value="">Todos os usuários</option>
          {allActors.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setModuleFilter(''); setActorFilter('') }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 border border-gray-200 dark:border-gray-700 transition-colors"
          >
            <X className="w-3 h-3" /> Limpar filtros
          </button>
        )}
      </div>

      {/* Log */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Activity className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-gray-500 text-sm">
            {hasFilters ? 'Nenhuma atividade corresponde aos filtros.' : 'Nenhuma atividade registrada ainda.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(({ date, items }) => (
            <section key={date}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 capitalize whitespace-nowrap">
                  {date}
                </span>
                <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
              </div>

              <div className="space-y-2">
                {items.map(entry => {
                  const meta = ACTION_META[entry.action] ?? ACTION_META.update
                  const Icon = meta.icon
                  return (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 transition-colors"
                    >
                      {/* Action icon */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${meta.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">
                          {entry.description}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {/* Module badge */}
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${moduleColor(entry.module)}`}>
                            {entry.module}
                          </span>
                          {/* Actor */}
                          <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                            <span className="w-4 h-4 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-[9px] font-bold text-amber-700 dark:text-amber-300 flex-shrink-0">
                              {actorInitial(entry.actor)}
                            </span>
                            {actorShort(entry.actor)}
                          </span>
                          {/* Time */}
                          <span className="text-xs text-gray-300 dark:text-gray-600" title={formatFull(entry.timestamp)}>
                            {formatRelative(entry.timestamp)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
