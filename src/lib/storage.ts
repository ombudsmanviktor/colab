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
  readRawBlob,
  getFileCommits,
  getFileAtCommit,
  type GitHubConfig,
} from './github'
import type { UsersIndex, UserTasks, UserProfile, OrdemDoDia, AtaDecisao, Leitura, Producao, SugestaoMessage, Orientacao, Anexo, TimelineData, CalloutData, WikiEntry, MeetingPlan } from '@/types'
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
  demoLoadCallout, demoSaveCallout,
  demoLoadWikiEntries, demoSaveWikiEntry, demoDeleteWikiEntry,
  demoLoadMeetingPlans, demoSaveMeetingPlan, demoDeleteMeetingPlan,
} from './demoStore'

// ─── SHA cache ────────────────────────────────────────────────────────────

const shaCache = new Map<string, string>()

function cfg(): GitHubConfig {
  const c = getGitHubConfig()
  if (!c) throw new Error('GitHub não configurado')
  return c
}

// ─── YAML helpers ─────────────────────────────────────────────────────────

async function readYaml<T>(path: string, bypassCache = false): Promise<T | null> {
  try {
    const file = await readFile(cfg(), path, bypassCache)
    shaCache.set(path, file.sha)
    try {
      // 'raw-text' encoding is set by readFile() for files > 1 MB that were
      // fetched via the Blobs API — content is already plain text, skip decode.
      const text = file.encoding === 'raw-text' ? file.content : decodeContent(file.content)
      const parsed = yaml.load(text)
      if (parsed == null || typeof parsed !== 'object') return null
      return parsed as T
    } catch {
      return null
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('Not Found') && !msg.includes('404')) {
      console.error(`[storage] readYaml(${path}) failed:`, err)
    }
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

// Read-fresh-then-write: reads the current file content with bypassCache,
// applies a merge function, and writes only if the function returns a new value.
// Runs inside the write queue to prevent SHA races.
async function mergeYaml<T>(
  path: string,
  merge: (current: T) => T | null,
  message: string,
  empty: T,
): Promise<void> {
  const prev = writeQueue.get(path) ?? Promise.resolve()
  const next = prev.then(() => _doMerge(path, merge, message, empty))
  writeQueue.set(path, next.catch(() => {}))
  return next
}

async function _doMerge<T>(
  path: string,
  merge: (current: T) => T | null,
  message: string,
  empty: T,
): Promise<void> {
  const MAX = 5
  for (let attempt = 0; attempt < MAX; attempt++) {
    // Read fresh content AND sha from origin
    let current: T = empty
    try {
      const file = await readFile(cfg(), path, true)
      shaCache.set(path, file.sha)
      const text = file.encoding === 'raw-text' ? file.content : decodeContent(file.content)
      current = (yaml.load(text) as T) ?? empty
    } catch {
      shaCache.delete(path)
    }
    const updated = merge(current)
    if (updated === null) return // no change needed
    const text = yaml.dump(updated, { lineWidth: -1 })
    try {
      const sha = shaCache.get(path)
      const res = await writeTextFile(cfg(), path, text, message, sha)
      shaCache.set(path, res.content.sha)
      return
    } catch (err: unknown) {
      if (attempt < MAX - 1) {
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

const USERS_INDEX_PATH = 'users/index.yaml'
const EMPTY_INDEX: UsersIndex = { emails: [], admins: [] }

export async function loadUsersIndex(): Promise<UsersIndex> {
  if (isDemoMode()) return demoLoadUsersIndex()
  // bypassCache=true: GitHub's CDN can cache GET responses for up to 60 s.
  // Without bypass, a page reload after an add/remove may return stale data
  // making it appear the change was lost.
  const data = await readYaml<UsersIndex>(USERS_INDEX_PATH, true)
  return data ?? { emails: [], admins: [] }
}

export async function saveUsersIndex(idx: UsersIndex): Promise<void> {
  if (isDemoMode()) { demoSaveUsersIndex(idx); return }
  await writeYaml(USERS_INDEX_PATH, idx, 'Update users index')
}

export async function addUser(email: string): Promise<void> {
  if (isDemoMode()) {
    const idx = demoLoadUsersIndex()
    if (!idx.emails.includes(email)) { idx.emails.push(email); demoSaveUsersIndex(idx) }
    return
  }
  // mergeYaml reads fresh content inside the write queue — prevents stale-data
  // overwrites when multiple writes to the same file happen in quick succession.
  await mergeYaml<UsersIndex>(
    USERS_INDEX_PATH,
    idx => idx.emails.includes(email) ? null : { ...idx, emails: [...idx.emails, email] },
    `Add user ${email}`,
    EMPTY_INDEX,
  )
}

export async function ensureOwnerAdmin(email: string): Promise<void> {
  if (isDemoMode()) return
  try {
    await mergeYaml<UsersIndex>(
      USERS_INDEX_PATH,
      idx => {
        const hasEmail = idx.emails.includes(email)
        const hasAdmin = idx.admins.includes(email)
        if (hasEmail && hasAdmin) return null
        return {
          emails: hasEmail ? idx.emails : [...idx.emails, email],
          admins: hasAdmin ? idx.admins : [...idx.admins, email],
        }
      },
      `Ensure owner admin ${email}`,
      EMPTY_INDEX,
    )
  } catch { /* silent — don't break login */ }
}

export async function removeUser(email: string): Promise<void> {
  if (isDemoMode()) {
    const idx = demoLoadUsersIndex()
    demoSaveUsersIndex({ emails: idx.emails.filter(e => e !== email), admins: idx.admins.filter(e => e !== email) })
    return
  }
  await mergeYaml<UsersIndex>(
    USERS_INDEX_PATH,
    idx => ({ emails: idx.emails.filter(e => e !== email), admins: idx.admins.filter(e => e !== email) }),
    `Remove user ${email}`,
    EMPTY_INDEX,
  )
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
    const entries = await listDirectory(cfg(), 'tasks', true)
    const files = entries.filter(e => e.type === 'file' && e.name.endsWith('.yaml'))
    const results = await Promise.all(
      files.map(f => readYaml<UserTasks>(`tasks/${f.name}`, true))
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
  const data = await readYaml<UserTasks>(path, true)
  return data ?? { email, tasks: [], lastAccess: new Date().toISOString() }
}

export async function saveUserTasks(ut: UserTasks): Promise<void> {
  if (isDemoMode()) { demoSaveUserTasks(ut); return }
  const path = `tasks/${emailSlug(ut.email)}.yaml`
  await writeYaml(path, ut, `Update tasks for ${ut.email}`)
}

// ─── User Profiles ────────────────────────────────────────────────────────

// Load profiles directly by known email list — avoids directory listing whose
// CDN-cached results may not include a newly created profile file.
export async function loadProfilesByEmails(emails: string[]): Promise<UserProfile[]> {
  if (isDemoMode()) return demoLoadAllProfiles().filter(p => emails.includes(p.email))
  if (emails.length === 0) return []
  const results = await Promise.all(
    emails.map(email => readYaml<UserProfile>(`users/profiles/${emailSlug(email)}.yaml`, true))
  )
  return results.filter((x): x is UserProfile => x !== null)
}

export async function loadAllProfiles(): Promise<UserProfile[]> {
  if (isDemoMode()) return demoLoadAllProfiles()
  try {
    const entries = await listDirectory(cfg(), 'users/profiles', true)
    const files = entries.filter(e => e.type === 'file' && e.name.endsWith('.yaml'))
    const results = await Promise.all(
      files.map(f => readYaml<UserProfile>(`users/profiles/${f.name}`, true))
    )
    return results.filter((x): x is UserProfile => x !== null)
  } catch {
    return []
  }
}

export async function loadUserProfile(email: string): Promise<UserProfile | null> {
  if (isDemoMode()) return demoLoadUserProfile(email)
  const path = `users/profiles/${emailSlug(email)}.yaml`
  return readYaml<UserProfile>(path, true)
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
    const entries = await listDirectory(cfg(), 'agenda', true)
    const files = entries.filter(e => e.type === 'file' && e.name.endsWith('.yaml'))
    const results = await Promise.all(
      files.map(f => readYaml<OrdemDoDia>(`agenda/${f.name}`, true))
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
    const entries = await listDirectory(cfg(), 'atas', true)
    const files = entries.filter(e => e.type === 'file' && e.name.endsWith('.yaml'))
    const results = await Promise.all(
      files.map(f => readYaml<AtaDecisao>(`atas/${f.name}`, true))
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
    const entries = await listDirectory(cfg(), 'leituras', true)
    const files = entries.filter(e => e.type === 'file' && e.name.endsWith('.yaml'))
    const results = await Promise.all(
      files.map(f => readYaml<Leitura>(`leituras/${f.name}`, true))
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
    const entries = await listDirectory(cfg(), 'producoes', true)
    const files = entries.filter(e => e.type === 'file' && e.name.endsWith('.yaml'))
    const results = await Promise.all(
      files.map(f => readYaml<Producao>(`producoes/${f.name}`, true))
    )
    return results
      .filter((x): x is Producao => x !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
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
    const entries = await listDirectory(cfg(), 'sugestoes', true)
    const files = entries.filter(e => e.type === 'file' && e.name.endsWith('.yaml'))
    const results = await Promise.all(
      files.map(f => readYaml<SugestaoMessage>(`sugestoes/${f.name}`, true))
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
}

function storedToAnexo(sa: StoredAnexo): Anexo {
  return { ...sa, url: getRawUrl(cfg(), sa.path) }
}

function anexoToStored(a: Anexo): StoredAnexo {
  return { id: a.id, name: a.name, size: a.size, type: a.type, path: a.path ?? '' }
}

export async function loadOrientacoes(): Promise<Orientacao[]> {
  if (isDemoMode()) return demoLoadOrientacoes()
  try {
    const entries = await listDirectory(cfg(), 'orientacoes', true)
    const files = entries.filter(e => e.type === 'file' && e.name.endsWith('.yaml'))
    const docs = await Promise.all(files.map(f => readYaml<StoredOrientacao>(`orientacoes/${f.name}`, true)))
    const orientacoes: Orientacao[] = []
    for (const doc of docs) {
      if (!doc) continue
      const { projeto_original, ...rest } = doc
      orientacoes.push({ ...rest, projeto_original: projeto_original ? storedToAnexo(projeto_original) : undefined })
    }
    return orientacoes
  } catch {
    return []
  }
}

export async function saveOrientacaoFile(orientacao: Orientacao): Promise<void> {
  if (isDemoMode()) { demoSaveOrientacao(orientacao); return }
  const { projeto_original, ...rest } = orientacao
  const doc: StoredOrientacao = {
    ...rest,
    ...(projeto_original ? { projeto_original: anexoToStored(projeto_original) } : {}),
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
  const data = await readYaml<TimelineData>(TIMELINE_PATH, true)
  return data ?? EMPTY_TIMELINE
}

export async function saveTimeline(data: TimelineData): Promise<void> {
  if (isDemoMode()) { demoSaveTimeline(data); return }
  await writeYaml(TIMELINE_PATH, data, 'Update linha do tempo')
}

// ─── Callout (recado geral) ───────────────────────────────────────────────

const CALLOUT_PATH = 'shared/callout.yaml'
const EMPTY_CALLOUT: CalloutData = { content: '', updated_at: '', updated_by: '' }

export async function loadCallout(): Promise<CalloutData> {
  if (isDemoMode()) return demoLoadCallout()
  const data = await readYaml<CalloutData>(CALLOUT_PATH, true)
  return data ?? EMPTY_CALLOUT
}

export async function saveCallout(data: CalloutData): Promise<void> {
  if (isDemoMode()) { demoSaveCallout(data); return }
  await writeYaml(CALLOUT_PATH, data, 'Update callout')
}

// ─── Wiki ─────────────────────────────────────────────────────────────────

const WIKI_DIR = 'wiki'

// Write raw text through the same write queue used by writeYaml
async function writeRawText(path: string, text: string, message: string): Promise<void> {
  const prev = writeQueue.get(path) ?? Promise.resolve()
  const next = prev.then(() => _doWriteRaw(path, text, message))
  writeQueue.set(path, next.catch(() => {}))
  return next
}

async function _doWriteRaw(path: string, text: string, message: string): Promise<void> {
  const MAX = 5
  for (let attempt = 0; attempt < MAX; attempt++) {
    try {
      const current = await readFile(cfg(), path, true)
      shaCache.set(path, current.sha)
    } catch { shaCache.delete(path) }
    try {
      const sha = shaCache.get(path)
      const res = await writeTextFile(cfg(), path, text, message, sha)
      shaCache.set(path, res.content.sha)
      return
    } catch (err: unknown) {
      if (attempt < MAX - 1) await new Promise(r => setTimeout(r, 150 * (attempt + 1)))
      else throw err
    }
  }
}

function parseWikiMd(text: string, fallbackId: string): WikiEntry {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (match) {
    try {
      const meta = yaml.load(match[1]) as Record<string, unknown>
      return {
        id: String(meta.id ?? fallbackId),
        title: String(meta.title ?? 'Sem título'),
        order: Number(meta.order ?? 0),
        created_at: String(meta.created_at ?? ''),
        updated_at: String(meta.updated_at ?? ''),
        created_by: String(meta.created_by ?? ''),
        updated_by: String(meta.updated_by ?? ''),
        content: match[2].trim(),
      }
    } catch { /* fall through */ }
  }
  return {
    id: fallbackId,
    title: 'Sem título',
    order: 0,
    created_at: '',
    updated_at: '',
    created_by: '',
    updated_by: '',
    content: text.trim(),
  }
}

function serializeWikiMd(entry: WikiEntry): string {
  const { content, ...meta } = entry
  return `---\n${yaml.dump(meta, { lineWidth: -1 }).trim()}\n---\n\n${content}`
}

export async function loadWikiEntries(): Promise<WikiEntry[]> {
  if (isDemoMode()) return demoLoadWikiEntries()
  try {
    const entries = await listDirectory(cfg(), WIKI_DIR, true)
    const files = entries.filter(e => e.type === 'file' && e.name.endsWith('.md'))
    const results = await Promise.all(
      files.map(async f => {
        const file = await readFile(cfg(), `${WIKI_DIR}/${f.name}`, true)
        shaCache.set(`${WIKI_DIR}/${f.name}`, file.sha)
        return parseWikiMd(decodeContent(file.content), f.name.replace('.md', ''))
      })
    )
    return results.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'pt-BR'))
  } catch {
    return []
  }
}

export async function saveWikiEntry(entry: WikiEntry): Promise<void> {
  if (isDemoMode()) { demoSaveWikiEntry(entry); return }
  await writeRawText(`${WIKI_DIR}/${entry.id}.md`, serializeWikiMd(entry), `Wiki: ${entry.title}`)
}

export async function deleteWikiEntry(id: string): Promise<void> {
  if (isDemoMode()) { demoDeleteWikiEntry(id); return }
  await removeYaml(`${WIKI_DIR}/${id}.md`, `Delete wiki entry ${id}`)
}

export interface WikiHistoryItem {
  sha: string
  shortSha: string
  date: string
  author: string
}

export async function getWikiEntryHistory(id: string): Promise<WikiHistoryItem[]> {
  if (isDemoMode()) return []
  try {
    const commits = await getFileCommits(cfg(), `${WIKI_DIR}/${id}.md`)
    return commits.map(c => ({
      sha: c.sha,
      shortSha: c.sha.slice(0, 7),
      date: c.commit.author.date,
      author: c.commit.author.name,
    }))
  } catch {
    return []
  }
}

export async function getWikiEntryAtVersion(id: string, sha: string): Promise<WikiEntry | null> {
  try {
    const file = await getFileAtCommit(cfg(), `${WIKI_DIR}/${id}.md`, sha)
    return parseWikiMd(decodeContent(file.content), id)
  } catch {
    return null
  }
}

// ─── Planejamento das Reuniões ────────────────────────────────────────────

export async function loadMeetingPlans(): Promise<MeetingPlan[]> {
  if (isDemoMode()) return demoLoadMeetingPlans()
  try {
    const entries = await listDirectory(cfg(), 'planejamento', true)
    const files = entries.filter(e => e.type === 'file' && e.name.endsWith('.yaml'))
    const results = await Promise.all(
      files.map(f => readYaml<MeetingPlan>(`planejamento/${f.name}`, true))
    )
    return results
      .filter((x): x is MeetingPlan => x != null)
      .map(p => ({ ...p, readings: p.readings ?? [], meetings: p.meetings ?? [] }))
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  } catch {
    return []
  }
}

export async function uploadPlanPdf(readingId: string, file: File): Promise<string | undefined> {
  if (isDemoMode()) return undefined
  const c = cfg()
  const filePath = `planejamento/pdfs/${readingId}.pdf`
  let existingSha: string | undefined
  try {
    const existing = await readFile(c, filePath)
    existingSha = existing.sha
  } catch { /* new file */ }
  const result = await writeBinaryFile(c, filePath, file, `Upload PDF for reading ${readingId}`, existingSha)
  shaCache.set(filePath, result.content.sha)
  return filePath
}

export async function deletePlanPdf(readingId: string): Promise<void> {
  if (isDemoMode()) return
  await removeYaml(`planejamento/pdfs/${readingId}.pdf`, `Delete PDF for reading ${readingId}`)
}

export async function downloadPlanPdf(pdfPath: string, filename: string): Promise<void> {
  // Git Blobs API: no 1 MB limit, CORS-safe (goes through api.github.com).
  const blob = await readRawBlob(cfg(), pdfPath)
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(objectUrl)
}

export async function openDocBlob(path: string): Promise<void> {
  const blob = await readRawBlob(cfg(), path)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

export async function saveMeetingPlan(p: MeetingPlan): Promise<void> {
  if (isDemoMode()) { demoSaveMeetingPlan(p); return }
  await writeYaml(`planejamento/${p.id}.yaml`, p, `Save plan ${p.id}`)
}

export async function deleteMeetingPlan(id: string): Promise<void> {
  if (isDemoMode()) { demoDeleteMeetingPlan(id); return }
  await removeYaml(`planejamento/${id}.yaml`, `Delete plan ${id}`)
}

// Target ≤ 500 KB binary so the base64 data URI (~667 KB) fits comfortably
// inside GitHub's 1 MB Contents API limit for the wiki entry file.
const IMAGE_INLINE_LIMIT = 500_000

function readFileAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target?.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

async function compressImageToDataUrl(file: File): Promise<string> {
  // SVG and GIF pass through unchanged (canvas would break them)
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return readFileAsDataUrl(file)
  }
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const scale = Math.sqrt(IMAGE_INLINE_LIMIT / file.size) * 0.9
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * Math.min(scale, 1)))
      canvas.height = Math.max(1, Math.round(img.height * Math.min(scale, 1)))
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('No canvas context')); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      resolve(canvas.toDataURL(mime, 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image load failed')) }
    img.src = objectUrl
  })
}

export async function uploadWikiImage(file: File): Promise<string> {
  // Always embed as a base64 data URI so images are self-contained in the
  // markdown file and work regardless of whether the data repo is public.
  if (file.size <= IMAGE_INLINE_LIMIT) {
    return readFileAsDataUrl(file)
  }
  return compressImageToDataUrl(file)
}

// ─── App config (users/app-config.yaml in data repo) ─────────────────────

export async function saveAppConfig(config: AppRepoConfig): Promise<void> {
  if (isDemoMode()) return
  await writeYaml('users/app-config.yaml', config, 'Update app config')
}
