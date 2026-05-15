// ─── App-level repo configuration ────────────────────────────────────────
// Loaded from public/config.json (static, bundled with the app).
// Contains only owner/repo/branch — no PAT, no sensitive data.

export interface AppRepoConfig {
  owner: string
  repo: string
  branch: string
}

// undefined = not yet attempted; null = attempted but not found/invalid
let _cache: AppRepoConfig | null | undefined = undefined

export async function loadStaticConfig(): Promise<AppRepoConfig | null> {
  if (_cache !== undefined) return _cache
  try {
    const res = await fetch('./config.json', { cache: 'no-store' })
    if (!res.ok) { _cache = null; return null }
    const data = await res.json() as Partial<AppRepoConfig>
    if (data.owner?.trim() && data.repo?.trim() && data.branch?.trim()) {
      _cache = {
        owner: data.owner.trim(),
        repo: data.repo.trim(),
        branch: data.branch.trim(),
      }
      return _cache
    }
    _cache = null
    return null
  } catch {
    _cache = null
    return null
  }
}

export function clearStaticConfigCache(): void {
  _cache = undefined
}
