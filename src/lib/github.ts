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

export async function listDirectory(cfg: GitHubConfig, dirPath: string): Promise<GHDirEntry[]> {
  try {
    return await ghFetch<GHDirEntry[]>(
      cfg,
      `/repos/${cfg.owner}/${cfg.repo}/contents/${dirPath}?ref=${cfg.branch}`
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Not Found') || msg.includes('empty')) return []
    throw err
  }
}

export async function readFile(cfg: GitHubConfig, filePath: string): Promise<GHFileContent> {
  return ghFetch<GHFileContent>(
    cfg,
    `/repos/${cfg.owner}/${cfg.repo}/contents/${filePath}?ref=${cfg.branch}`
  )
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
