import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { saveGitHubConfig, type GitHubConfig } from '@/lib/github'
import { loadAllUserTasks, loadAllProfiles, loadUsersIndex } from '@/lib/storage'
import { emailInitials, formatDate, todayISO } from '@/lib/utils'
import type { UserTasks, UserProfile } from '@/types'

function parseEmbedPayload(raw: string): GitHubConfig | null {
  try {
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(padded)
    return JSON.parse(json) as GitHubConfig
  } catch {
    return null
  }
}

export function VisaoGeralEmbed() {
  const { data } = useParams<{ data: string }>()
  const [allTasks, setAllTasks] = useState<UserTasks[]>([])
  const [profiles, setProfiles] = useState<UserProfile[]>([])
  const [emails, setEmails] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!data) { setError('Parâmetro de incorporação ausente.'); setLoading(false); return }

    const cfg = parseEmbedPayload(data)
    if (!cfg?.token || !cfg.owner || !cfg.repo) {
      setError('Parâmetro inválido.'); setLoading(false); return
    }

    saveGitHubConfig(cfg)

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
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [data])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-amber-50">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-amber-50 text-red-500 text-sm p-4">
        {error}
      </div>
    )
  }

  const taskMap = new Map(allTasks.map(ut => [ut.email, ut]))
  const profileMap = new Map(profiles.map(p => [p.email, p]))
  const allEmails = [...new Set([...emails, ...allTasks.map(ut => ut.email)])]

  return (
    <div className="bg-amber-50 min-h-screen p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" className="w-full h-full">
              <defs><linearGradient id="cl-emb" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#fbbf24"/><stop offset="100%" stopColor="#d97706"/></linearGradient></defs>
              <rect width="32" height="32" rx="9" fill="url(#cl-emb)"/>
              <circle cx="16" cy="12" r="5" fill="white" opacity="0.9"/>
              <ellipse cx="16" cy="24" rx="8" ry="4.5" fill="white" opacity="0.7"/>
            </svg>
          </div>
          <span className="text-sm font-semibold text-amber-700">coLAB · Visão Geral</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allEmails.map(email => {
            const ut = taskMap.get(email) ?? { email, tasks: [], lastAccess: '' }
            const profile = profileMap.get(email)
            const pending = ut.tasks.filter(t => !t.completed).sort((a, b) => a.order - b.order)
            const done = ut.tasks.filter(t => t.completed)

            return (
              <div key={email} className="bg-white border border-gray-200 rounded-xl shadow-sm">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                  {profile?.imagemBase64 ? (
                    <img src={profile.imagemBase64} className="w-8 h-8 rounded-full object-cover" alt="" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-amber-700">{emailInitials(email)}</span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{profile?.nome || email}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                    pending.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {pending.length}
                  </span>
                </div>
                <div className="px-3 py-2 space-y-1">
                  {pending.map(task => (
                    <div key={task.id} className="flex items-center gap-2 py-1">
                      <div className="w-3.5 h-3.5 rounded border border-gray-300 flex-shrink-0" />
                      <span className="text-sm text-gray-700 flex-1 truncate">{task.title}</span>
                      {task.dueDate && (
                        <span className={`text-xs flex-shrink-0 ${task.dueDate < todayISO() ? 'text-red-400' : 'text-gray-400'}`}>
                          {formatDate(task.dueDate)}
                        </span>
                      )}
                    </div>
                  ))}
                  {done.map(task => (
                    <div key={task.id} className="flex items-center gap-2 py-1 opacity-40">
                      <div className="w-3.5 h-3.5 rounded border border-amber-400 bg-amber-400 flex-shrink-0 flex items-center justify-center">
                        <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                      </div>
                      <span className="text-sm text-gray-400 line-through flex-1 truncate">{task.title}</span>
                    </div>
                  ))}
                  {pending.length === 0 && done.length === 0 && (
                    <p className="text-xs text-gray-300 italic py-1">Nenhuma tarefa.</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
