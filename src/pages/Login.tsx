import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, Github, GitBranch, FlaskConical, Sun, Moon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { loadStaticConfig, type AppRepoConfig } from '@/lib/appConfig'
import { getGitHubConfig } from '@/lib/github'
import type { GitHubConfig } from '@/lib/github'

const AppLogo = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" className="w-full h-full drop-shadow-lg">
    <defs>
      <linearGradient id="cl-login" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#d97706" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="18" fill="url(#cl-login)" />
    <circle cx="32" cy="22" r="10" fill="white" opacity="0.9" />
    <ellipse cx="32" cy="46" rx="16" ry="9" fill="white" opacity="0.7" />
    <circle cx="14" cy="26" r="6" fill="white" opacity="0.6" />
    <circle cx="50" cy="26" r="6" fill="white" opacity="0.6" />
    <ellipse cx="14" cy="46" rx="9" ry="6" fill="white" opacity="0.35" />
    <ellipse cx="50" cy="46" rx="9" ry="6" fill="white" opacity="0.35" />
  </svg>
)

export function Login() {
  const { signIn, signInDemo, session } = useAuth()
  const navigate = useNavigate()
  const { isDark, toggle } = useTheme()

  const [appConfig, setAppConfig] = useState<AppRepoConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(true)

  const [email, setEmail] = useState('')
  const [pat, setPat] = useState('')
  const [repo, setRepo] = useState('')
  const [branch, setBranch] = useState('main')
  const [showPat, setShowPat] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (session) navigate('/app/visao-geral', { replace: true })
  }, [session, navigate])

  useEffect(() => {
    loadStaticConfig().then(cfg => {
      if (cfg) {
        setAppConfig(cfg)
      } else {
        // Fallback: if this device has a previously saved GitHub config in localStorage,
        // use its owner/repo/branch so returning users only need email + PAT.
        const saved = getGitHubConfig()
        if (saved?.owner && saved?.repo && saved?.branch) {
          setAppConfig({ owner: saved.owner, repo: saved.repo, branch: saved.branch })
        }
      }
      setConfigLoading(false)
    })
  }, [])

  const simplified = appConfig !== null  // true = show email+PAT only

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!email.trim() || !email.includes('@')) {
      setError('Informe um email válido.')
      return
    }

    if (!pat.trim()) {
      setError('Informe o Personal Access Token do GitHub.')
      return
    }

    let owner: string, repoName: string, branchName: string

    if (simplified && appConfig) {
      owner = appConfig.owner
      repoName = appConfig.repo
      branchName = appConfig.branch
    } else {
      const parts = repo.trim().split('/')
      if (!parts[0] || !parts[1]) {
        setError('Repositório deve estar no formato: proprietário/repositório')
        return
      }
      owner = parts[0].trim()
      repoName = parts[1].trim()
      branchName = branch.trim() || 'main'
    }

    setLoading(true)

    const githubConfig: GitHubConfig = {
      token: pat.trim(),
      owner,
      repo: repoName,
      branch: branchName,
    }

    const result = await signIn(email.trim(), githubConfig)
    setLoading(false)

    if (!result.ok) {
      setError(result.error ?? 'Falha ao conectar ao GitHub. Verifique suas credenciais.')
      return
    }

    navigate('/app/visao-geral', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-yellow-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4 relative">
      <button
        onClick={toggle}
        className="absolute top-4 right-4 p-2 rounded-lg bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 shadow-sm transition-colors"
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-4">
            <AppLogo />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">coLAB</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Gestão de grupos de pesquisa · coLAB/UFF
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-8">
          {configLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            {/* PAT */}
            <div className="space-y-1.5">
              <Label htmlFor="pat">GitHub Personal Access Token</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="pat"
                  type={showPat ? 'text' : 'password'}
                  placeholder="ghp_xxxxxxxxxxxx"
                  value={pat}
                  onChange={e => setPat(e.target.value)}
                  className="pl-9 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPat(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPat ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Repo + Branch — only shown when no static config */}
            {!simplified && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="repo">Repositório GitHub</Label>
                  <div className="relative">
                    <Github className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="repo"
                      placeholder="proprietário/repositório"
                      value={repo}
                      onChange={e => setRepo(e.target.value)}
                      className="pl-9"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="branch">Branch</Label>
                  <div className="relative">
                    <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="branch"
                      placeholder="main"
                      value={branch}
                      onChange={e => setBranch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Repo hint when simplified */}
            {simplified && appConfig && (
              <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
                <Github className="w-3 h-3 flex-shrink-0" />
                {appConfig.owner}/{appConfig.repo} · {appConfig.branch}
              </p>
            )}

            {error && (
              <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 text-white" disabled={loading}>
              {loading ? 'Verificando conexão…' : 'Entrar'}
            </Button>
          </form>
          )}

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-100 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white dark:bg-gray-800 px-3 text-xs text-gray-400">ou</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full gap-2 text-amber-700 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-950/30"
            onClick={() => {
              signInDemo()
              navigate('/app/visao-geral', { replace: true })
            }}
          >
            <FlaskConical className="w-4 h-4" />
            Modo demonstração
          </Button>
          <p className="text-center text-xs text-gray-400 mt-2">
            Dados de exemplo — sem persistência, sem GitHub necessário.
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Dados armazenados no seu repositório GitHub privado.
        </p>
      </div>
    </div>
  )
}
