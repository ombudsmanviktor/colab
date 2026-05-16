import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import {
  saveGitHubConfig,
  clearGitHubConfig,
  testConnection,
  getAuthenticatedUser,
  type GitHubConfig,
} from '@/lib/github'
import { saveEmailJSConfig, clearEmailJSConfig, type EmailJSConfig } from '@/lib/emailjs'
import { setDemoMode, DEMO_EMAIL } from '@/lib/demoStore'
import { loadUsersIndex, ensureOwnerAdmin } from '@/lib/storage'

const SESSION_KEY = 'colab_session'
const DEMO_KEY = 'colab_demo'

const DEMO_GITHUB_CONFIG: GitHubConfig = { token: '', owner: '', repo: '', branch: 'main' }

export interface AuthSession {
  email: string
  githubConfig: GitHubConfig
  emailJSConfig?: EmailJSConfig
  isDemo?: boolean
  isAdmin?: boolean
}

interface AuthContextType {
  session: AuthSession | null
  loading: boolean
  isDemoMode: boolean
  signIn: (email: string, githubConfig: GitHubConfig, emailJSConfig?: EmailJSConfig) => Promise<{ ok: boolean; error?: string }>
  signInDemo: () => void
  signOut: () => void
  updateEmailJSConfig: (cfg: EmailJSConfig | null) => void
  refreshAdminStatus: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      if (localStorage.getItem(DEMO_KEY) === 'true') {
        setDemoMode(true)
        setSession({ email: DEMO_EMAIL, githubConfig: DEMO_GITHUB_CONFIG, isDemo: true, isAdmin: true })
        setLoading(false)
        return
      }
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) {
        const s = JSON.parse(raw) as AuthSession
        if (s.email && s.githubConfig?.token) {
          setSession(s)
        }
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  async function resolveAdminStatus(email: string): Promise<boolean> {
    try {
      const idx = await loadUsersIndex()
      return idx.admins.includes(email)
    } catch {
      return false
    }
  }

  async function signIn(
    email: string,
    githubConfig: GitHubConfig,
    emailJSConfig?: EmailJSConfig
  ): Promise<{ ok: boolean; error?: string }> {
    const result = await testConnection(githubConfig)
    if (!result.ok) return result

    saveGitHubConfig(githubConfig)
    if (emailJSConfig) saveEmailJSConfig(emailJSConfig)

    // If the PAT belongs to the repo owner, auto-grant admin on first login
    try {
      const ghUser = await getAuthenticatedUser(githubConfig)
      if (ghUser.login.toLowerCase() === githubConfig.owner.toLowerCase()) {
        await ensureOwnerAdmin(email)
      }
    } catch { /* ignore — don't block login */ }

    const isAdmin = await resolveAdminStatus(email)
    const s: AuthSession = { email, githubConfig, emailJSConfig, isAdmin }
    localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    setSession(s)
    return { ok: true }
  }

  function signInDemo() {
    setDemoMode(true)
    localStorage.setItem(DEMO_KEY, 'true')
    const s: AuthSession = { email: DEMO_EMAIL, githubConfig: DEMO_GITHUB_CONFIG, isDemo: true, isAdmin: true }
    setSession(s)
  }

  function signOut() {
    setDemoMode(false)
    clearGitHubConfig()
    clearEmailJSConfig()
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(DEMO_KEY)
    setSession(null)
  }

  function updateEmailJSConfig(cfg: EmailJSConfig | null) {
    if (cfg) saveEmailJSConfig(cfg)
    else clearEmailJSConfig()
    setSession(prev => {
      if (!prev) return prev
      const updated = { ...prev, emailJSConfig: cfg ?? undefined }
      if (!prev.isDemo) localStorage.setItem(SESSION_KEY, JSON.stringify(updated))
      return updated
    })
  }

  async function refreshAdminStatus() {
    if (!session || session.isDemo) return
    const isAdmin = await resolveAdminStatus(session.email)
    setSession(prev => {
      if (!prev) return prev
      const updated = { ...prev, isAdmin }
      localStorage.setItem(SESSION_KEY, JSON.stringify(updated))
      return updated
    })
  }

  return (
    <AuthContext.Provider value={{
      session, loading,
      isDemoMode: session?.isDemo === true,
      signIn, signInDemo, signOut,
      updateEmailJSConfig, refreshAdminStatus,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
