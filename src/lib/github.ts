// ─── GitHub REST API client ────────────────────────────────────────────────

export interface GitHubConfig {
  token: string
  owner: string
  repo: string
  branch: string
}

const CONFIG_KEY = 'colab_github_config'

export function getGitHubConfig(): GitHubConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return null
    const cfg = JSON.parse(raw) as GitHubConfig
    return cfg.token && cfg.owner && cfg.repo ? cfg : null
  } catch {
    return null
  }
}

export function saveGitHubConfig(cfg: Omit<GitHubConfig, 'branch'> & { branch?: string }): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ branch: 'main', ...cfg }))
}

export function clearGitHubConfig(): void {
  localStorage.removeItem(CONFIG_KEY)
}

export function isGitHubConfigured(): boolean {
  return getGitHubConfig() !== null
}

async function ghFetch<T>(cfg: GitHubConfig, path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { message?: string }).message ?? `GitHub API error ${res.status}`)
  }
  return res.json() as Promise<T>
}

export interface GHFileContent {
  name: string
  path: string
  sha: string
  content: string
  encoding: string
}

export interface GHDirEntry {
  name: string
  path: string
  sha: string
  type: 'file' | 'dir'
}

export async function listDirectory(cfg: GitHubConfig, dirPath: string, bypassCache = false): Promise<GHDirEntry[]> {
  const cb = bypassCache ? `&_ts=${Date.now()}` : ''
  try {
    return await ghFetch<GHDirEntry[]>(
      cfg,
      `/repos/${cfg.owner}/${cfg.repo}/contents/${dirPath}?ref=${cfg.branch}${cb}`
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Not Found') || msg.includes('empty')) return []
    throw err
  }
}

export async function readFile(cfg: GitHubConfig, filePath: string, bypassCache = false): Promise<GHFileContent> {
  const cb = bypassCache ? `&_ts=${Date.now()}` : ''
  const file = await ghFetch<GHFileContent>(
    cfg,
    `/repos/${cfg.owner}/${cfg.repo}/contents/${filePath}?ref=${cfg.branch}${cb}`
  )
  // GitHub returns content:"" encoding:"none" for files > 1 MB.
  // Fall back to the Blobs API (addressed by SHA, which is immutable)
  // to retrieve the actual content as plain text.
  if (file.encoding === 'none' && !file.content) {
    const res = await fetch(
      `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/git/blobs/${file.sha}`,
      {
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: 'application/vnd.github.v3.raw',
        },
      }
    )
    if (!res.ok) throw new Error(`GitHub blob fetch failed: HTTP ${res.status}`)
    // Use a custom encoding marker so consumers can skip the base64 decode step.
    return { ...file, content: await res.text(), encoding: 'raw-text' }
  }
  return file
}

export async function writeTextFile(
  cfg: GitHubConfig,
  filePath: string,
  content: string,
  message: string,
  sha?: string
): Promise<{ content: { sha: string } }> {
  const bytes = new TextEncoder().encode(content)
  const binStr = Array.from(bytes, (b) => String.fromCodePoint(b)).join('')
  const b64 = btoa(binStr)

  const body: Record<string, string> = { message, content: b64, branch: cfg.branch }
  if (sha) body.sha = sha

  return ghFetch<{ content: { sha: string } }>(
    cfg,
    `/repos/${cfg.owner}/${cfg.repo}/contents/${filePath}`,
    { method: 'PUT', body: JSON.stringify(body) }
  )
}

export async function writeBinaryFile(
  cfg: GitHubConfig,
  filePath: string,
  file: File,
  message: string,
  sha?: string
): Promise<{ content: { sha: string } }> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const binStr = Array.from(bytes, b => String.fromCodePoint(b)).join('')
  const b64 = btoa(binStr)
  const body: Record<string, string> = { message, content: b64, branch: cfg.branch }
  if (sha) body.sha = sha
  return ghFetch<{ content: { sha: string } }>(
    cfg,
    `/repos/${cfg.owner}/${cfg.repo}/contents/${filePath}`,
    { method: 'PUT', body: JSON.stringify(body) }
  )
}

export function getRawUrl(cfg: GitHubConfig, filePath: string): string {
  return `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${filePath}`
}

// Fetch a file's raw binary via the Git Blobs API (no 1 MB size limit, CORS-safe).
export async function readRawBlob(cfg: GitHubConfig, filePath: string): Promise<Blob> {
  // Step 1: get the blob SHA from the Contents API (works even for large files)
  const meta = await ghFetch<{ sha: string }>(
    cfg,
    `/repos/${cfg.owner}/${cfg.repo}/contents/${filePath}?ref=${cfg.branch}`
  )
  // Step 2: fetch raw bytes via the Blobs API with the raw accept header
  const res = await fetch(
    `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/git/blobs/${meta.sha}`,
    {
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github.v3.raw',
      },
    }
  )
  if (!res.ok) throw new Error(`GitHub blob fetch failed: HTTP ${res.status}`)
  return res.blob()
}

export async function deleteFile(
  cfg: GitHubConfig,
  filePath: string,
  sha: string,
  message: string
): Promise<void> {
  await ghFetch(cfg, `/repos/${cfg.owner}/${cfg.repo}/contents/${filePath}`, {
    method: 'DELETE',
    body: JSON.stringify({ message, sha, branch: cfg.branch }),
  })
}

export function decodeContent(content: string): string {
  const clean = content.replace(/\n/g, '')
  const binStr = atob(clean)
  const bytes = new Uint8Array(binStr.length)
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export async function testConnection(
  cfg: GitHubConfig
): Promise<{ ok: boolean; error?: string }> {
  try {
    await ghFetch(cfg, `/repos/${cfg.owner}/${cfg.repo}`)
    return { ok: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

/** Returns the GitHub login (username) of the authenticated PAT owner. */
export async function getAuthenticatedUser(cfg: GitHubConfig): Promise<{ login: string }> {
  return ghFetch<{ login: string }>(cfg, '/user')
}

// ─── Commit history ───────────────────────────────────────────────────────

export interface GHCommit {
  sha: string
  commit: { message: string; author: { name: string; date: string } }
}

export async function getFileCommits(cfg: GitHubConfig, filePath: string): Promise<GHCommit[]> {
  return ghFetch<GHCommit[]>(
    cfg,
    `/repos/${cfg.owner}/${cfg.repo}/commits?path=${encodeURIComponent(filePath)}&sha=${cfg.branch}&per_page=30`
  )
}

export async function getFileAtCommit(cfg: GitHubConfig, filePath: string, sha: string): Promise<GHFileContent> {
  return ghFetch<GHFileContent>(
    cfg,
    `/repos/${cfg.owner}/${cfg.repo}/contents/${filePath}?ref=${sha}`
  )
}
