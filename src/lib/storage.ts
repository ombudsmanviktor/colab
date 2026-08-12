// ─── GitHub YAML storage for coLAB ────────────────────────────────────────

import yaml from 'js-yaml'
import {
  getGitHubConfig,
  readFile,
  writeTextFile,
  writeBinaryFile,
  deleteFile,
  listDirectory,
  decodeContent,
  getRawUrl,
  type GitHubConfig,
} from './github'
import type { UsersIndex, UserTasks, UserProfile, OrdemDoDia, AtaDecisao, Leitura, Producao, SugestaoMessage, Orientacao, TarefaOrientacao, Anexo, TimelineData } from '@/types'
import type { AppRepoConfig } from '@/lib/appConfig'
import { emailSlug, generateId } from './utils'
import {
  isDemoMode,
  demoLoadUsersIndex, demoSaveUsersIndex,
  demoLoadAllUserTasks, demoSaveUserTasks,
  demoLoadUserProfile, demoSaveUserProfile, demoLoadAllProfiles,
  demoLoadOrdens, demoSaveOrdem, demoDeleteOrdem,
  demoLoadAtas, demoSaveAta, demoDeleteAta,
  demoLoadLeituras, demoSaveLeitura, demoDeleteLeitura,
  demoLoadProducoes, demoSaveProducao, demoDeleteProducao,
  demoLoadSugestoes, demoSaveSugestao, demoDeleteSugestao,
  demoLoadOrientacoes, demoSaveOrientacao, demoDeleteOrientacao,
  demoLoadTimeline, demoSaveTimeline,
} from './demoStore'

// ─── SHA cache ────────────────────────────────────────────────────────────

const shaCache = new Map<string, string>()

function cfg(): GitHubConfig {
  const c = getGitHubConfig()
  if (!c) throw new Error('GitHub não configurado')
  return c
}

// ─── YAML helpers ─────────────────────────────────────────────────────────

async function readYaml<T>(path: string): Promise<T | null> {
  try {
    const file = await readFile(cfg(), path)
    shaCache.set(path, file.sha)
    try {
      return yaml.load(decodeContent(file.content)) as T
    } catch {
      // Malformed YAML — treat as missing
      return null
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Not Found') || msg.includes('404')) return null
    // Other API errors (rate limit, permission, branch missing) — treat as missing
    return null
  }
}

// ─── Write queue ──────────────────────────────────────────────────────────
// Serialises concurrent writes to the same path so they never race on SHA.
const writeQueue = new Map<string, Promise<void>>()

async function writeYaml<T>(path: string, data: T, message: string): Promise<void> {
  const prev = writeQueue.get(path) ?? Promise.resolve()
  const next = prev.then(() => _doWrite(path, data, message))
  // Store without error so the queue keeps draining even if this write fails
  writeQueue.set(path, next.catch(() => {}))
  return next
}

async function _doWrite<T>(path: string, data: T, message: string): Promise<void> {
  const text = yaml.dump(data, { lineWidth: -1 })
  const MAX = 5
  for (let attempt = 0; attempt < MAX; attempt++) {
    // Always fetch the live SHA from GitHub before each attempt.
    // bypassCache=true forces a cache-miss on GitHub's CDN so we get the
    // SHA from origin, not a stale edge-cached response.
    try {
      const current = await readFile(cfg(), path, true)
      shaCache.set(path, current.sha)
    } catch {
      shaCache.delete(path) // File doesn't exist yet — write will create it
    }
    try {
      const sha = shaCache.get(path)
      const res = await writeTextFile(cfg(), path, text, message, sha)
      shaCache.set(path, res.content.sha)
      return
    } catch (err: unknown) {
      if (attempt < MAX - 1) {
        // Brief back-off before next attempt
        await new Promise(r => setTimeout(r, 150 * (attempt + 1)))
      } else {
        throw err
      }
    }
  }
}

async function removeYaml(path: string, message: string): Promise<void> {
  const sha = shaCache.get(path)
  if (!sha) {
    try {
      const file = await readFile(cfg(), path)
      await deleteFile(cfg(), path, file.sha, message)
    } catch { return }
    return
  }
  await deleteFile(cfg(), path, sha, message)
  shaCache.delete(path)
}

// ─── Users Index ──────────────────────────────────────────────────────────

export async function loadUsersIndex(): Promise<UsersIndex> {
  if (isDemoMode()) return demoLoadUsersIndex()
  const data = await readYaml<UsersIndex>('users/index.yaml')
  return data ?? { emails: [], admins: [] }
}

export async function saveUsersIndex(idx: UsersIndex): Promise<void> {
  if (isDemoMode()) { demoSaveUsersIndex(idx); return }
  await writeYaml('users/index.yaml', idx, 'Update users index')
}

export async function addUser(email: string): Promise<void> {
  const idx = await loadUsersIndex()
  if (!idx.emails.includes(email)) {
    idx.emails.push(email)
    await saveUsersIndex(idx)
  }
}

/**
 * Called at login when the authenticated GitHub user's login matches the
 * repo owner. Ensures that email is registered and has admin rights.
 * Idempotent — safe to call on every login.
 */
export async function ensureOwnerAdmin(email: string): Promise<void> {
  if (isDemoMode()) return
  try {
    const idx = await loadUsersIndex()
    let changed = false
    if (!idx.emails.includes(email)) { idx.emails.push(email); changed = true }
    if (!idx.admins.includes(email)) { idx.admins.push(email); changed = true }
    if (changed) await saveUsersIndex(idx)
  } catch { /* silent — don't break login */ }
}

export async function removeUser(email: string): Promise<void> {
  const idx = await loadUsersIndex()
  idx.emails = idx.emails.filter(e => e !== email)
  idx.admins = idx.admins.filter(e => e !== email)
  await saveUsersIndex(idx)
  // Clean up all data files for this user (best-effort; errors are silenced)
  await Promise.allSettled([
    removeYaml(`tasks/${emailSlug(email)}.yaml`, `Delete tasks for ${email}`),
    removeYaml(`users/profiles/${emailSlug(email)}.yaml`, `Delete profile for ${email}`),
  ])
}

// ─── User Tasks ───────────────────────────────────────────────────────────

export async function loadAllUserTasks(): Promise<UserTasks[]> {
  if (isDemoMode()) return demoLoadAllUserTasks()
  try {
    const entries = await listDirectory(cfg(), 'tasks')
    const files = entries.filter(e => e.type === 'file' && e.name.endsWith('.yaml'))
    const results = await Promise.all(
      files.map(f => readYaml<UserTasks>(`tasks/${f.name}`))
    )
    return results.filter((x): x is UserTasks => x !== null)
  } catch {
    return []
  }
}

export async function loadUserTasks(email: string): Promise<UserTasks> {
  if (isDemoMode()) {
    const all = demoLoadAllUserTasks()
    return all.find(x => x.email === email) ?? { email, tasks: [], lastAccess: new Date().toISOString() }
  }
  const path = `tasks/${emailSlug(email)}.yaml`
  const data = await readYaml<UserTasks>(path)
  return data ?? { email, tasks: [], lastAccess: new Date().toISOString() }
}

export async function saveUserTasks(ut: UserTasks): Promise<void> {
  if (isDemoMode()) { demoSaveUserTasks(ut); return }
  const path = `tasks/${emailSlug(ut.email)}.yaml`
  await writeYaml(path, ut, `Update tasks for ${ut.email}`)
}

// ─── User Profiles ────────────────────────────────────────────────────────

export async function loadAllProfiles(): Promise<UserProfile[]> {
  if (isDemoMode()) return demoLoadAllProfiles()
  try {
    const entries = await listDirectory(cfg(), 'users/profiles')
    const files = entries.filter(e => e.type === 'file' && e.name.endsWith('.yaml'))
    const results = await Promise.all(
      files.map(f => readYaml<UserProfile>(`users/profiles/${f.name}`))
    )
    return results.filter((x): x is UserProfile => x !== null)
  } catch {
    return []
  }
}

export async function loadUserProfile(email: string): Promise<UserProfile | null> {
  if (isDemoMode()) return demoLoadUserProfile(email)
  const path = `users/profiles/${emailSlug(email)}.yaml`
  return readYaml<UserProfile>(path)
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  if (isDemoMode()) { demoSaveUserProfile(profile); return }
  const path = `users/profiles/${emailSlug(profile.email)}.yaml`
  await writeYaml(path, profile, `Update profile for ${profile.email}`)
}

// ─── Ordem do Dia ─────────────────────────────────────────────────────────

export async function loadOrdemDoDias(): Promise<OrdemDoDia[]> {
  if (isDemoMode()) return demoLoadOrdens()
  try {
    const entries = await listDirectory(cfg(), 'agenda')
    const files = entries.filter(e => e.type === 'file' && e.name.endsWith('.yaml'))
    const results = await Promise.all(
      files.map(f => readYaml<OrdemDoDia>(`agenda/${f.name}`))
    )
    return results
      .filter((x): x is OrdemDoDia => x !== null)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  } catch {
    return []
  }
}

export async function saveOrdemDoDia(o: OrdemDoDia): Promise<void> {
  if (isDemoMode()) { demoSaveOrdem(o); return }
  await writeYaml(`agenda/${o.id}.yaml`, { ...o, updated_at: new Date().toISOString() }, `Save ordem do dia ${o.id}`)
}

export async function deleteOrdemDoDia(id: string): Promise<void> {
  if (isDemoMode()) { demoDeleteOrdem(id); return }
  await removeYaml(`agenda/${id}.yaml`, `Delete ordem do dia ${id}`)
}

// ─── Atas e Decisões ──────────────────────────────────────────────────────

export async function loadAtas(): Promise<AtaDecisao[]> {
  if (isDemoMode()) return demoLoadAtas()
  try {
    const entries = await listDirectory(cfg(), 'atas')
    const files = entries.filter(e => e.type === 'file' && e.name.endsWith('.yaml'))
    const results = await Promise.all(
      files.map(f => readYaml<AtaDecisao>(`atas/${f.name}`))
    )
    return results
      .filter((x): x is AtaDecisao => x !== null)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  } catch {
    return []
  }
}

export async function saveAta(a: AtaDecisao): Promise<void> {
  if (isDemoMode()) { demoSaveAta(a); return }
  await writeYaml(`atas/${a.id}.yaml`, a, `Save ata ${a.id}`)
}

export async function deleteAta(id: string): Promise<void> {
  if (isDemoMode()) { demoDeleteAta(id); return }
  await removeYaml(`atas/${id}.yaml`, `Delete ata ${id}`)
}

// ─── Leituras Recomendadas ────────────────────────────────────────────────

export async function loadLeituras(): Promise<Leitura[]> {
  if (isDemoMode()) return demoLoadLeituras()
  try {
    const entries = await listDirectory(cfg(), 'leituras')
    const files = entries.filter(e => e.type === 'file' && e.name.endsWith('.yaml'))
    const results = await Promise.all(
      files.map(f => readYaml<Leitura>(`leituras/${f.name}`))
    )
    return results
      .filter((x): x is Leitura => x !== null)
      .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate))
  } catch {
    return []
  }
}

export async function saveLeitura(l: Leitura): Promise<void> {
  if (isDemoMode()) { demoSaveLeitura(l); return }
  await writeYaml(`leituras/${l.id}.yaml`, l, `Save leitura ${l.id}`)
}

export async function deleteLeitura(id: string): Promise<void> {
  if (isDemoMode()) { demoDeleteLeitura(id); return }
  await removeYaml(`leituras/${id}.yaml`, `Delete leitura ${id}`)
}

export { generateId }

// ─── Produções Recentes ───────────────────────────────────────────────────

export async function loadProducoes(): Promise<Producao[]> {
  if (isDemoMode()) return demoLoadProducoes()
  try {
    const entries = await listDirectory(cfg(), 'producoes')
    const files = entries.filter(e => e.type === 'file' && e.name.endsWith('.yaml'))
    const results = await Promise.all(
      files.map(f => readYaml<Producao>(`producoes/${f.name}`))
    )
    return results
      .filter((x): x is Producao => x !== null)
      .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate))
  } catch {
    return []
  }
}

export async function saveProducao(p: Producao): Promise<void> {
  if (isDemoMode()) { demoSaveProducao(p); return }
  await writeYaml(`producoes/${p.id}.yaml`, p, `Save producao ${p.id}`)
}

export async function deleteProducao(id: string): Promise<void> {
  if (isDemoMode()) { demoDeleteProducao(id); return }
  await removeYaml(`producoes/${id}.yaml`, `Delete producao ${id}`)
}

// ─── Sugestões ────────────────────────────────────────────────────────────

export async function loadSugestoes(): Promise<SugestaoMessage[]> {
  if (isDemoMode()) return demoLoadSugestoes()
  try {
    const entries = await listDirectory(cfg(), 'sugestoes')
    const files = entries.filter(e => e.type === 'file' && e.name.endsWith('.yaml'))
    const results = await Promise.all(
      files.map(f => readYaml<SugestaoMessage>(`sugestoes/${f.name}`))
    )
    return results
      .filter((x): x is SugestaoMessage => x !== null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  } catch {
    return []
  }
}

export async function saveSugestao(msg: SugestaoMessage): Promise<void> {
  if (isDemoMode()) { demoSaveSugestao(msg); return }
  await writeYaml(`sugestoes/${msg.id}.yaml`, msg, `Sugestão ${msg.id}`)
}

export async function deleteSugestao(id: string): Promise<void> {
  if (isDemoMode()) { demoDeleteSugestao(id); return }
  await removeYaml(`sugestoes/${id}.yaml`, `Delete sugestão ${id}`)
}

// ─── Orientações ──────────────────────────────────────────────────────────

type StoredAnexo = { id: string; name: string; size: number; type: string; path: string }

type StoredOrientacao = Omit<Orientacao, 'projeto_original'> & {
  projeto_original?: StoredAnexo
  tarefas: Omit<TarefaOrientacao, 'orientacao_id'>[]
}

function storedToAnexo(sa: StoredAnexo): Anexo {
  return { ...sa, url: getRawUrl(cfg(), sa.path) }
}

function anexoToStored(a: Anexo): StoredAnexo {
  return { id: a.id, name: a.name, size: a.size, type: a.type, path: a.path ?? '' }
}

export async function loadOrientacoes(): Promise<{ orientacoes: Orientacao[]; tarefas: TarefaOrientacao[] }> {
  if (isDemoMode()) return demoLoadOrientacoes()
  try {
    const entries = await listDirectory(cfg(), 'orientacoes')
    const files = entries.filter(e => e.type === 'file' && e.name.endsWith('.yaml'))
    const docs = await Promise.all(files.map(f => readYaml<StoredOrientacao>(`orientacoes/${f.name}`)))
    const orientacoes: Orientacao[] = []
    const tarefas: TarefaOrientacao[] = []
    for (const doc of docs) {
      if (!doc) continue
      const { tarefas: docTarefas, projeto_original, ...rest } = doc
      orientacoes.push({ ...rest, projeto_original: projeto_original ? storedToAnexo(projeto_original) : undefined })
      for (const t of docTarefas ?? []) {
        tarefas.push({ ...t, orientacao_id: doc.id })
      }
    }
    return { orientacoes, tarefas }
  } catch {
    return { orientacoes: [], tarefas: [] }
  }
}

export async function saveOrientacaoFile(orientacao: Orientacao, allTarefas: TarefaOrientacao[]): Promise<void> {
  if (isDemoMode()) { demoSaveOrientacao(orientacao, allTarefas); return }
  const myTarefas = allTarefas.filter(t => t.orientacao_id === orientacao.id)
  const { projeto_original, ...rest } = orientacao
  const doc: StoredOrientacao = {
    ...rest,
    ...(projeto_original ? { projeto_original: anexoToStored(projeto_original) } : {}),
    tarefas: myTarefas.map(({ orientacao_id: _oid, ...t }) => t),
  }
  await writeYaml(`orientacoes/${orientacao.id}.yaml`, doc, `Update orientação ${orientacao.id}`)
}

export async function deleteOrientacaoFile(id: string): Promise<void> {
  if (isDemoMode()) { demoDeleteOrientacao(id); return }
  await removeYaml(`orientacoes/${id}.yaml`, `Delete orientação ${id}`)
}

export async function uploadAnexo(entityType: string, entityId: string, file: File): Promise<Anexo> {
  const c = cfg()
  const filePath = `attachments/${entityType}/${entityId}/${file.name}`
  let existingSha: string | undefined
  try {
    const existing = await readFile(c, filePath)
    existingSha = existing.sha
  } catch { /* new file */ }
  const result = await writeBinaryFile(c, filePath, file, `Upload ${file.name}`, existingSha)
  shaCache.set(filePath, result.content.sha)
  return {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    type: file.type,
    path: filePath,
    url: getRawUrl(c, filePath),
  }
}

// ─── Linha do Tempo ───────────────────────────────────────────────────────

const TIMELINE_PATH = 'timeline/data.yaml'
const EMPTY_TIMELINE: TimelineData = { events: [], categories: [] }

export async function loadTimeline(): Promise<TimelineData> {
  if (isDemoMode()) return demoLoadTimeline()
  const data = await readYaml<TimelineData>(TIMELINE_PATH)
  return data ?? EMPTY_TIMELINE
}

export async function saveTimeline(data: TimelineData): Promise<void> {
  if (isDemoMode()) { demoSaveTimeline(data); return }
  await writeYaml(TIMELINE_PATH, data, 'Update linha do tempo')
}

// ─── App config (users/app-config.yaml in data repo) ─────────────────────

export async function saveAppConfig(config: AppRepoConfig): Promise<void> {
  if (isDemoMode()) return
  await writeYaml('users/app-config.yaml', config, 'Update app config')
}
