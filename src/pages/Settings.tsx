import { useState, useEffect } from 'react'
import { Save, Eye, EyeOff, Trash2 } from 'lucide-react'
import { getEmailJSConfig, saveEmailJSConfig, clearEmailJSConfig, type EmailJSConfig } from '@/lib/emailjs'
import { getGitHubConfig, saveGitHubConfig, clearGitHubConfig, testConnection, type GitHubConfig } from '@/lib/github'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/toast'

export function Settings() {
  const { session, signOut } = useAuth()
  const { toasts, toast, dismiss } = useToast()

  // GitHub config
  const [ghToken, setGhToken] = useState('')
  const [ghOwner, setGhOwner] = useState('')
  const [ghRepo, setGhRepo] = useState('')
  const [ghBranch, setGhBranch] = useState('main')
  const [showToken, setShowToken] = useState(false)
  const [testing, setTesting] = useState(false)

  // EmailJS config
  const [ejServiceId, setEjServiceId] = useState('')
  const [ejTemplateId, setEjTemplateId] = useState('')
  const [ejPublicKey, setEjPublicKey] = useState('')

  useEffect(() => {
    const gh = getGitHubConfig()
    if (gh) {
      setGhToken(gh.token)
      setGhOwner(gh.owner)
      setGhRepo(gh.repo)
      setGhBranch(gh.branch)
    }
    const ej = getEmailJSConfig()
    if (ej) {
      setEjServiceId(ej.serviceId)
      setEjTemplateId(ej.templateId)
      setEjPublicKey(ej.publicKey)
    }
  }, [])

  async function handleTestGitHub() {
    const cfg: GitHubConfig = { token: ghToken, owner: ghOwner, repo: ghRepo, branch: ghBranch }
    setTesting(true)
    try {
      const ok = await testConnection(cfg)
      if (ok) {
        saveGitHubConfig(cfg)
        toast({ title: 'Conexão bem-sucedida', description: `${ghOwner}/${ghRepo}` })
      } else {
        toast({ title: 'Falha na conexão', description: 'Verifique o token e o repositório.', variant: 'destructive' })
      }
    } catch (err) {
      toast({ title: 'Erro', description: String(err), variant: 'destructive' })
    }
    setTesting(false)
  }

  function handleSaveEmailJS() {
    if (!ejServiceId.trim() || !ejTemplateId.trim() || !ejPublicKey.trim()) {
      toast({ title: 'Preencha todos os campos do EmailJS', variant: 'destructive' })
      return
    }
    const cfg: EmailJSConfig = { serviceId: ejServiceId.trim(), templateId: ejTemplateId.trim(), publicKey: ejPublicKey.trim() }
    saveEmailJSConfig(cfg)
    toast({ title: 'Configuração EmailJS salva' })
  }

  function handleClearEmailJS() {
    clearEmailJSConfig()
    setEjServiceId(''); setEjTemplateId(''); setEjPublicKey('')
    toast({ title: 'Configuração EmailJS removida' })
  }

  function handleLogout() {
    signOut()
  }

  function handleDisconnectGitHub() {
    clearGitHubConfig()
    setGhToken(''); setGhOwner(''); setGhRepo(''); setGhBranch('main')
    toast({ title: 'Configuração GitHub removida' })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Configurações</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Conta e integrações</p>
      </div>

      {/* Session info */}
      <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-gray-800 dark:text-white text-sm">Conta</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-700 dark:text-gray-300">{session?.email}</p>
            {session?.isAdmin && (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Administrador</span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} className="text-red-500 border-red-200 hover:bg-red-50">
            Sair
          </Button>
        </div>
      </section>

      {/* GitHub */}
      <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-gray-800 dark:text-white text-sm">Repositório GitHub</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Owner</Label>
            <Input value={ghOwner} onChange={e => setGhOwner(e.target.value)} placeholder="usuario-ou-org" />
          </div>
          <div className="space-y-1.5">
            <Label>Repositório</Label>
            <Input value={ghRepo} onChange={e => setGhRepo(e.target.value)} placeholder="colab-data" />
          </div>
          <div className="space-y-1.5">
            <Label>Branch</Label>
            <Input value={ghBranch} onChange={e => setGhBranch(e.target.value)} placeholder="main" />
          </div>
          <div className="space-y-1.5">
            <Label>Token (PAT)</Label>
            <div className="relative">
              <Input
                type={showToken ? 'text' : 'password'}
                value={ghToken}
                onChange={e => setGhToken(e.target.value)}
                placeholder="ghp_..."
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowToken(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleTestGitHub}
            disabled={testing || !ghToken || !ghOwner || !ghRepo}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {testing ? 'Testando…' : 'Testar e Salvar'}
          </Button>
          {getGitHubConfig() && (
            <Button variant="outline" onClick={handleDisconnectGitHub} className="text-red-500 border-red-200 hover:bg-red-50">
              <Trash2 className="w-4 h-4" /> Desconectar
            </Button>
          )}
        </div>
      </section>

      {/* EmailJS */}
      <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-white text-sm">EmailJS</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Para notificações de novas leituras.{' '}
            <a href="https://www.emailjs.com/" target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline">emailjs.com</a>
          </p>
        </div>
        <div className="space-y-3">
          {[
            { label: 'Service ID', value: ejServiceId, set: setEjServiceId, placeholder: 'service_xxxxxxx' },
            { label: 'Template ID', value: ejTemplateId, set: setEjTemplateId, placeholder: 'template_xxxxxxx' },
            { label: 'Public Key', value: ejPublicKey, set: setEjPublicKey, placeholder: 'xxxxxxxxxxxxxxxxxxxxxx' },
          ].map(({ label, value, set, placeholder }) => (
            <div key={label} className="space-y-1.5">
              <Label>{label}</Label>
              <Input value={value} onChange={e => set(e.target.value)} placeholder={placeholder} />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSaveEmailJS} className="bg-amber-500 hover:bg-amber-600 text-white">
            <Save className="w-4 h-4" /> Salvar
          </Button>
          {getEmailJSConfig() && (
            <Button variant="outline" onClick={handleClearEmailJS} className="text-red-500 border-red-200 hover:bg-red-50">
              <Trash2 className="w-4 h-4" /> Remover
            </Button>
          )}
        </div>
      </section>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
