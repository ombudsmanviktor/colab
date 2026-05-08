import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, ExternalLink, AlertCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  loadUsersIndex, saveUsersIndex, addUser, removeUser,
  loadAllProfiles, saveUserProfile,
} from '@/lib/storage'
import { emailInitials, emailSlug } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/toast'
import type { UserProfile, UserStatus, UsersIndex } from '@/types'

const STATUS_OPTIONS: { value: UserStatus; label: string; color: string }[] = [
  { value: 'graduando', label: 'Graduando', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'mestrando', label: 'Mestrando', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  { value: 'doutorando', label: 'Doutorando', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  { value: 'doutor', label: 'Doutor', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'pos-doutorando', label: 'Pós-doutorando', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
  { value: 'lider', label: 'Líder do Grupo', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
]

function statusColor(status?: UserStatus) {
  return STATUS_OPTIONS.find(o => o.value === status)?.color ?? 'bg-gray-100 text-gray-500'
}
function statusLabel(status?: UserStatus) {
  return STATUS_OPTIONS.find(o => o.value === status)?.label ?? ''
}

function LinkRow({ href, label }: { href: string; label: string }) {
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 hover:underline">
      <ExternalLink className="w-3 h-3" />
      {label}
    </a>
  )
}

function NewUserDialog({ open, onOpenChange, existingEmails, onSave }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  existingEmails: string[]
  onSave: (nome: string, email: string) => Promise<void>
}) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  function reset() { setNome(''); setEmail('') }

  async function handleSave() {
    const trimEmail = email.trim().toLowerCase()
    const trimNome = nome.trim()
    if (!trimEmail || !trimEmail.includes('@')) { toast({ title: 'Email inválido' }); return }
    if (existingEmails.includes(trimEmail)) { toast({ title: 'Usuário já cadastrado' }); return }
    setSaving(true)
    await onSave(trimNome, trimEmail)
    setSaving(false)
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Novo Usuário</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Nome completo</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do membro" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="email@instituicao.edu.br"
              type="email"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !email.trim()} className="bg-amber-500 hover:bg-amber-600 text-white">
            {saving ? 'Adicionando…' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface ProfileDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  email: string
  profile: UserProfile | null
  isAdmin: boolean
  isAdminUser: boolean
  isSelf: boolean
  onSaved: (profile: UserProfile) => void
  onToggleAdmin: (checked: boolean) => void
}

function ProfileDialog({ open, onOpenChange, email, profile, isAdmin, isAdminUser, isSelf, onSaved, onToggleAdmin }: ProfileDialogProps) {
  const [nome, setNome] = useState(profile?.nome ?? '')
  const [status, setStatus] = useState<UserStatus | ''>(profile?.status ?? '')
  const [minibio, setMinibio] = useState(profile?.minibio ?? '')
  const [lattes, setLattes] = useState(profile?.lattes ?? '')
  const [googleScholar, setGoogleScholar] = useState(profile?.googleScholar ?? '')
  const [orcid, setOrcid] = useState(profile?.orcid ?? '')
  const [academiaedu, setAcademiaedu] = useState(profile?.academiaedu ?? '')
  const [researchgate, setResearchgate] = useState(profile?.researchgate ?? '')
  const [instagram, setInstagram] = useState(profile?.instagram ?? '')
  const [x, setX] = useState(profile?.x ?? '')
  const [telefone, setTelefone] = useState(profile?.telefone ?? '')
  const [cpf, setCpf] = useState(profile?.cpf ?? '')
  const [imagemBase64, setImagemBase64] = useState(profile?.imagemBase64 ?? '')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setImagemBase64(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const updated: UserProfile = {
        email,
        nome: nome.trim(),
        status: status || undefined,
        minibio: minibio.trim() || undefined,
        lattes: lattes.trim() || undefined,
        googleScholar: googleScholar.trim() || undefined,
        orcid: orcid.trim() || undefined,
        academiaedu: academiaedu.trim() || undefined,
        researchgate: researchgate.trim() || undefined,
        instagram: instagram.trim() || undefined,
        x: x.trim() || undefined,
        telefone: telefone.trim() || undefined,
        ...(isAdmin ? { cpf: cpf.trim() || undefined } : {}),
        imagemBase64: imagemBase64 || undefined,
        updatedAt: now,
      }
      await saveUserProfile(updated)
      onSaved(updated)
      onOpenChange(false)
    } catch (err) {
      toast({ title: 'Erro ao salvar', description: String(err), variant: 'destructive' })
    }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Perfil</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative">
              {imagemBase64 ? (
                <img src={imagemBase64} className="w-16 h-16 rounded-full object-cover border-2 border-amber-200" alt="" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center border-2 border-amber-200">
                  <span className="text-xl font-bold text-amber-600">{emailInitials(email)}</span>
                </div>
              )}
            </div>
            <div>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                {imagemBase64 ? 'Trocar foto' : 'Adicionar foto'}
              </Button>
              {imagemBase64 && (
                <Button variant="ghost" size="sm" className="ml-2 text-red-500" onClick={() => setImagemBase64('')}>
                  Remover
                </Button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              <p className="text-xs text-gray-400 mt-1">{email}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nome completo</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as UserStatus | '')}
                className="w-full h-9 px-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Selecionar...</option>
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Minibio <span className="text-gray-400 font-normal">({minibio.length}/280)</span></Label>
            <Textarea
              value={minibio}
              onChange={e => setMinibio(e.target.value.slice(0, 280))}
              rows={3}
              placeholder="Uma breve apresentação..."
            />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Links Acadêmicos</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Currículo Lattes', value: lattes, set: setLattes },
                { label: 'Google Scholar', value: googleScholar, set: setGoogleScholar },
                { label: 'ORCID', value: orcid, set: setOrcid },
                { label: 'Academia.edu', value: academiaedu, set: setAcademiaedu },
                { label: 'ResearchGate', value: researchgate, set: setResearchgate },
              ].map(({ label, value, set }) => (
                <div key={label} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <Input value={value} onChange={e => set(e.target.value)} placeholder="https://" className="text-xs" />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Redes Sociais & Contato</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Instagram', value: instagram, set: setInstagram, placeholder: '@usuario' },
                { label: 'X (Twitter)', value: x, set: setX, placeholder: '@usuario' },
                { label: 'Telefone', value: telefone, set: setTelefone, placeholder: '+55 21 99999-9999' },
              ].map(({ label, value, set, placeholder }) => (
                <div key={label} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <Input value={value} onChange={e => set(e.target.value)} placeholder={placeholder} className="text-xs" />
                </div>
              ))}
            </div>
          </div>

          {/* Admin-only fields */}
          {isAdmin && (
            <div className="space-y-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-lg">
              <div className="space-y-1.5">
                <Label className="text-xs text-amber-700 dark:text-amber-400">CPF (visível apenas para administradores)</Label>
                <Input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00" className="text-xs" />
              </div>
              {!isSelf && (
                <label className="flex items-center gap-2 cursor-pointer w-fit">
                  <input
                    type="checkbox"
                    checked={isAdminUser}
                    onChange={e => onToggleAdmin(e.target.checked)}
                    className="w-3.5 h-3.5 accent-amber-500 cursor-pointer"
                  />
                  <span className="text-xs text-amber-700 dark:text-amber-400">Administrador do grupo</span>
                </label>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-white">
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProfileCard({
  email, profile, isAdmin, isAdminUser, canEdit, isSelf,
  onEdit, onRemove, onToggleAdmin,
}: {
  email: string
  profile: UserProfile | undefined
  isAdmin: boolean
  isAdminUser: boolean
  canEdit: boolean
  isSelf: boolean
  onEdit: () => void
  onRemove: () => void
  onToggleAdmin: (checked: boolean) => void
}) {
  const awaiting = !profile?.nome

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden group">
      {/* Header */}
      <div className="relative px-5 pt-5 pb-4">
        <div className="flex items-start gap-4">
          {profile?.imagemBase64 ? (
            <img src={profile.imagemBase64} className="w-14 h-14 rounded-full object-cover flex-shrink-0 border-2 border-amber-200" alt="" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0 border-2 border-amber-200 dark:border-amber-800">
              <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{emailInitials(email)}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            {awaiting ? (
              <div className="flex items-center gap-1.5 mb-1">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">Aguardando preenchimento</span>
              </div>
            ) : (
              <h3 className="font-semibold text-gray-900 dark:text-white truncate">{profile.nome}</h3>
            )}
            <p className="text-xs text-gray-400 truncate mt-0.5">{email}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {profile?.status && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(profile.status)}`}>
                  {statusLabel(profile.status)}
                </span>
              )}
              {isAdminUser && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  admin
                </span>
              )}
            </div>
          </div>
          {/* Action buttons — visible on hover */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {canEdit && (
              <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="Editar perfil">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {isAdmin && !isSelf && (
              <button onClick={onRemove} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-gray-400 hover:text-red-500 transition-colors" title="Remover usuário">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Body */}
      {!awaiting && (
        <div className="px-5 pb-4 space-y-3 border-t border-gray-50 dark:border-gray-700 pt-3">
          {profile?.minibio && (
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-3">{profile.minibio}</p>
          )}

          {/* Academic links */}
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {profile?.lattes && <LinkRow href={profile.lattes} label="Lattes" />}
            {profile?.googleScholar && <LinkRow href={profile.googleScholar} label="Scholar" />}
            {profile?.orcid && <LinkRow href={profile.orcid} label="ORCID" />}
            {profile?.academiaedu && <LinkRow href={profile.academiaedu} label="Academia" />}
            {profile?.researchgate && <LinkRow href={profile.researchgate} label="ResearchGate" />}
          </div>

          {/* Social + contact */}
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {profile?.instagram && <LinkRow href={`https://instagram.com/${profile.instagram.replace('@', '')}`} label={profile.instagram} />}
            {profile?.x && <LinkRow href={`https://x.com/${profile.x.replace('@', '')}`} label={profile.x} />}
            {profile?.telefone && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{profile.telefone}</span>
            )}
          </div>

          {/* CPF — only in DOM for admins */}
          {isAdmin && profile?.cpf && (
            <div className="text-xs text-gray-400 dark:text-gray-500">
              CPF: <span className="font-mono">{profile.cpf}</span>
            </div>
          )}
        </div>
      )}

      {/* Edit CTA for awaiting */}
      {awaiting && canEdit && (
        <div className="px-5 pb-4">
          <Button size="sm" variant="outline" className="w-full border-amber-200 text-amber-600 hover:bg-amber-50" onClick={onEdit}>
            Preencher perfil
          </Button>
        </div>
      )}
    </div>
  )
}

export function Usuarios() {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const { toasts, toast, dismiss } = useToast()

  const [newUserOpen, setNewUserOpen] = useState(false)
  const [editEmail, setEditEmail] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const isAdmin = session?.isAdmin ?? false
  const myEmail = session?.email ?? ''

  const { data: index, isLoading: loadingIndex } = useQuery<UsersIndex>({
    queryKey: ['users-index'],
    queryFn: loadUsersIndex,
  })

  const { data: profiles = [], isLoading: loadingProfiles } = useQuery<UserProfile[]>({
    queryKey: ['all-profiles'],
    queryFn: loadAllProfiles,
  })

  const emails = index?.emails ?? []
  const profileMap = new Map(profiles.map(p => [p.email, p]))

  // Sort: lider first, then by status order, then alphabetical
  const statusOrder: Record<string, number> = {
    lider: 0, 'pos-doutorando': 1, doutor: 2, doutorando: 3, mestrando: 4, graduando: 5,
  }
  const sortedEmails = [...emails].sort((a, b) => {
    const pa = profileMap.get(a)
    const pb = profileMap.get(b)
    const sa = pa?.status ? (statusOrder[pa.status] ?? 9) : 10
    const sb = pb?.status ? (statusOrder[pb.status] ?? 9) : 10
    if (sa !== sb) return sa - sb
    const na = pa?.nome || a
    const nb = pb?.nome || b
    return na.localeCompare(nb, 'pt-BR')
  })

  const admins = index?.admins ?? []

  async function handleRemoveUser(email: string) {
    if (!confirm(`Remover ${email} do grupo?`)) return
    try {
      await removeUser(email)
      queryClient.invalidateQueries({ queryKey: ['users-index'] })
      toast({ title: 'Usuário removido' })
    } catch (err) {
      toast({ title: 'Erro', description: String(err), variant: 'destructive' })
    }
  }

  async function handleToggleAdmin(email: string, checked: boolean) {
    if (!index) return
    const updated: UsersIndex = {
      ...index,
      admins: checked
        ? [...index.admins, email]
        : index.admins.filter(a => a !== email),
    }
    try {
      await saveUsersIndex(updated)
      queryClient.setQueryData(['users-index'], updated)
    } catch (err) {
      toast({ title: 'Erro', description: String(err), variant: 'destructive' })
    }
  }

  async function handleNewUser(nome: string, email: string) {
    if (emails.includes(email)) { toast({ title: 'Usuário já cadastrado' }); return }
    try {
      const updated = await addUser(email)
      queryClient.setQueryData(['users-index'], updated)
      const now = new Date().toISOString()
      const profile: UserProfile = { email, nome: nome.trim(), updatedAt: now }
      await saveUserProfile(profile)
      queryClient.setQueryData(['all-profiles'], (prev: UserProfile[] = []) => [...prev, profile])
      toast({ title: 'Usuário adicionado' })
    } catch (err) {
      toast({ title: 'Erro', description: String(err), variant: 'destructive' })
    }
  }

  function openEdit(email: string) {
    setEditEmail(email)
    setDialogOpen(true)
  }

  function handleProfileSaved(profile: UserProfile) {
    queryClient.setQueryData(['all-profiles'], (prev: UserProfile[] = []) => {
      const exists = prev.some(p => p.email === profile.email)
      return exists ? prev.map(p => p.email === profile.email ? profile : p) : [...prev, profile]
    })
    toast({ title: 'Perfil atualizado' })
  }

  const isLoading = loadingIndex || loadingProfiles

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  void emailSlug

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Usuários</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Membros do grupo de pesquisa</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setNewUserOpen(true)} className="bg-amber-500 hover:bg-amber-600 text-white">
            <Plus className="w-4 h-4" />
            Novo Usuário
          </Button>
        )}
      </div>

      {/* Profile cards */}
      {sortedEmails.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <p>Nenhum usuário cadastrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedEmails.map((email) => (
            <ProfileCard
              key={email}
              email={email}
              profile={profileMap.get(email)}
              isAdmin={isAdmin}
              isAdminUser={admins.includes(email)}
              canEdit={isAdmin || email === myEmail}
              isSelf={email === myEmail}
              onEdit={() => openEdit(email)}
              onRemove={() => handleRemoveUser(email)}
              onToggleAdmin={(checked) => handleToggleAdmin(email, checked)}
            />
          ))}
        </div>
      )}

      {/* New user dialog */}
      <NewUserDialog
        open={newUserOpen}
        onOpenChange={setNewUserOpen}
        existingEmails={emails}
        onSave={handleNewUser}
      />

      {/* Edit dialog */}
      {editEmail && (
        <ProfileDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          email={editEmail}
          profile={profileMap.get(editEmail) ?? null}
          isAdmin={isAdmin}
          isAdminUser={admins.includes(editEmail)}
          isSelf={editEmail === myEmail}
          onSaved={handleProfileSaved}
          onToggleAdmin={(checked) => handleToggleAdmin(editEmail, checked)}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
