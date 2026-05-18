import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Paperclip, Send, Lock, Trash2, MessageSquare, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { loadSugestoes, saveSugestao, deleteSugestao, loadAllProfiles, loadUsersIndex, generateId } from '@/lib/storage'
import { notifySugestaoMention } from '@/lib/emailjs'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/toast'
import type { SugestaoMessage, SugestaoAttachment, UserProfile } from '@/types'

// ─── Relative timestamp helper ────────────────────────────────────────────

function formatRelative(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  const diffH = Math.floor(diffMs / 3600000)
  const diffD = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `${diffMin} min atrás`
  if (diffH < 24) return `${diffH}h atrás`
  if (diffD === 1) return 'ontem'
  return new Intl.DateTimeFormat('pt-BR').format(new Date(isoString))
}

// ─── Format file size ─────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── Render message content with @mention highlights ─────────────────────

function renderContent(content: string): React.ReactNode[] {
  const parts = content.split(/(@\S+)/g)
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      return (
        <span key={i} className="font-semibold text-amber-600 dark:text-amber-400">
          {part}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

// ─── Avatar circle ────────────────────────────────────────────────────────

function Avatar({ email, profiles }: { email: string; profiles: UserProfile[] }) {
  const profile = profiles.find(p => p.email === email)
  const name = profile?.nome || email.split('@')[0]
  const initials = name.length >= 2
    ? (name.includes(' ') ? name.split(' ').map((p: string) => p[0]).slice(0, 2).join('') : name.slice(0, 2)).toUpperCase()
    : name.slice(0, 1).toUpperCase()
  return (
    <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center flex-shrink-0">
      <span className="text-xs font-bold text-amber-700 dark:text-amber-300">{initials}</span>
    </div>
  )
}

// ─── Attachment chip ──────────────────────────────────────────────────────

function AttachmentChip({ att }: { att: SugestaoAttachment }) {
  function handleDownload() {
    try {
      const binary = atob(att.base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: att.mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = att.name
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // ignore download errors
    }
  }

  return (
    <button
      onClick={handleDownload}
      className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/40 dark:bg-black/20 hover:bg-white/70 dark:hover:bg-black/30 text-xs transition-colors"
    >
      <Paperclip className="w-3 h-3 flex-shrink-0" />
      <span className="truncate max-w-[140px]">{att.name}</span>
      <span className="text-gray-400 flex-shrink-0">{formatSize(att.size)}</span>
    </button>
  )
}

// ─── Single message bubble ────────────────────────────────────────────────

function MessageBubble({
  msg, isMine, profiles, canDelete, onDelete,
}: {
  msg: SugestaoMessage
  isMine: boolean
  profiles: UserProfile[]
  canDelete: boolean
  onDelete: () => void
}) {
  const profile = profiles.find(p => p.email === msg.authorEmail)
  const displayName = profile?.nome || msg.authorEmail.split('@')[0]

  return (
    <div className={cn('flex gap-2 group', isMine ? 'flex-row-reverse' : 'flex-row')}>
      <Avatar email={msg.authorEmail} profiles={profiles} />
      <div className={cn('max-w-[70%] space-y-1', isMine ? 'items-end' : 'items-start')}>
        {/* Sender name + timestamp */}
        <div className={cn('flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500', isMine ? 'flex-row-reverse' : 'flex-row')}>
          <span className="font-medium text-gray-600 dark:text-gray-300">{displayName}</span>
          <span>{formatRelative(msg.createdAt)}</span>
          {msg.private && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 font-medium">
              <Lock className="w-2.5 h-2.5" />
              Privado
            </span>
          )}
        </div>
        {/* Bubble */}
        <div
          className={cn(
            'relative rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isMine
              ? 'bg-amber-500 text-white rounded-tr-sm'
              : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-tl-sm'
          )}
        >
          <p className="whitespace-pre-wrap break-words">{renderContent(msg.content)}</p>
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {msg.attachments.map((att, i) => (
                <AttachmentChip key={i} att={att} />
              ))}
            </div>
          )}
          {canDelete && (
            <button
              onClick={onDelete}
              className="absolute -top-2 -right-2 p-1 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
              title="Excluir"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── @mention autocomplete dropdown ──────────────────────────────────────

interface MentionOption {
  email: string
  displayName: string
  handle: string
}

function MentionDropdown({
  options, onSelect,
}: {
  options: MentionOption[]
  onSelect: (opt: MentionOption) => void
}) {
  if (options.length === 0) return null
  return (
    <div className="absolute bottom-full mb-1 left-0 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto min-w-[200px]">
      {options.map(opt => (
        <button
          key={opt.email}
          type="button"
          onMouseDown={e => { e.preventDefault(); onSelect(opt) }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
        >
          <span className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-xs font-bold text-amber-700 dark:text-amber-300 flex-shrink-0">
            {opt.displayName[0]?.toUpperCase() ?? '?'}
          </span>
          <div className="min-w-0">
            <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{opt.displayName}</p>
            <p className="text-xs text-gray-400 truncate">{opt.email}</p>
          </div>
        </button>
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────

export function Sugestoes() {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const { toasts, toast, dismiss } = useToast()

  // ── Queries ──
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['sugestoes'],
    queryFn: loadSugestoes,
  })

  const { data: profiles = [] } = useQuery({
    queryKey: ['all-profiles'],
    queryFn: loadAllProfiles,
  })

  const { data: usersIndex } = useQuery({
    queryKey: ['users-index'],
    queryFn: loadUsersIndex,
  })

  // ── Input state ──
  const [text, setText] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [privateRecipient, setPrivateRecipient] = useState('')
  const [showPrivateRecipientMenu, setShowPrivateRecipientMenu] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<SugestaoAttachment[]>([])
  const [sending, setSending] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // ── Mention autocomplete state ──
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStartIdx, setMentionStartIdx] = useState<number>(-1)
  const [mentionedEmails, setMentionedEmails] = useState<string[]>([])

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const privateRecipientRef = useRef<HTMLDivElement>(null)

  // ── Scroll to bottom when messages change ──
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  // ── Close private recipient dropdown on outside click ──
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (privateRecipientRef.current && !privateRecipientRef.current.contains(e.target as Node)) {
        setShowPrivateRecipientMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── Filter messages by visibility ──
  const visibleMessages = messages.filter(msg => {
    if (!msg.private) return true
    const email = session?.email ?? ''
    const isAdmin = session?.isAdmin === true
    return msg.authorEmail === email || msg.privateRecipient === email || isAdmin
  })

  // ── All user options for @mention ──
  const allUserOptions: MentionOption[] = [
    // @todos special option
    { email: '__all__', displayName: 'Todos', handle: 'todos' },
    // real users
    ...(usersIndex?.emails ?? []).map(email => {
      const profile = profiles.find(p => p.email === email)
      const displayName = profile?.nome || email.split('@')[0]
      const handle = displayName.toLowerCase().replace(/\s+/g, '')
      return { email, displayName, handle }
    }),
  ]

  // ── Handle textarea changes (mention detection) ──
  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setText(val)

    // Auto-resize
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 4 * 24 + 16) + 'px'
    }

    // Detect @mention trigger
    const cursor = e.target.selectionStart ?? val.length
    const textBefore = val.slice(0, cursor)
    const match = textBefore.match(/@(\S*)$/)
    if (match) {
      setMentionQuery(match[1].toLowerCase())
      setMentionStartIdx(cursor - match[0].length)
    } else {
      setMentionQuery(null)
      setMentionStartIdx(-1)
    }
  }

  // ── Filtered mention options ──
  const filteredMentionOptions = mentionQuery !== null
    ? allUserOptions.filter(o =>
        o.handle.includes(mentionQuery) || o.displayName.toLowerCase().includes(mentionQuery)
      )
    : []

  // ── Insert mention from dropdown ──
  function insertMention(opt: MentionOption) {
    const before = text.slice(0, mentionStartIdx)
    const after = text.slice(textareaRef.current?.selectionStart ?? text.length)
    const inserted = `@${opt.displayName} `
    setText(before + inserted + after)
    if (opt.email === '__all__') {
      setMentionedEmails(usersIndex?.emails.filter(e => e !== session?.email) ?? [])
    } else {
      setMentionedEmails(prev => prev.includes(opt.email) ? prev : [...prev, opt.email])
    }
    setMentionQuery(null)
    setMentionStartIdx(-1)
    setTimeout(() => {
      if (textareaRef.current) {
        const pos = (before + inserted).length
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(pos, pos)
      }
    }, 0)
  }

  // ── File attachment handler ──
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files)
    const results: SugestaoAttachment[] = []
    let totalBase64 = pendingAttachments.reduce((s, a) => s + a.base64.length, 0)

    for (const file of arr) {
      await new Promise<void>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result as string
          // dataUrl = "data:<mime>;base64,<data>"
          const base64 = dataUrl.split(',')[1] ?? ''
          totalBase64 += base64.length
          if (totalBase64 > 500 * 1024) {
            toast({
              title: 'Arquivo muito grande',
              description: 'O total de anexos excede 500 KB. Remova alguns arquivos.',
              variant: 'destructive',
            })
          } else {
            results.push({ name: file.name, base64, mimeType: file.type, size: file.size })
          }
          resolve()
        }
        reader.readAsDataURL(file)
      })
    }
    setPendingAttachments(prev => [...prev, ...results])
  }, [pendingAttachments, toast])

  function removeAttachment(idx: number) {
    setPendingAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Drag and drop ──
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }
  function handleDragLeave() { setIsDragging(false) }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
  }

  // ── Send mutation ──
  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!text.trim() && pendingAttachments.length === 0) return
      setSending(true)
      const msg: SugestaoMessage = {
        id: generateId(),
        authorEmail: session?.email ?? '',
        content: text.trim(),
        createdAt: new Date().toISOString(),
        mentions: mentionedEmails.length > 0 ? mentionedEmails : undefined,
        private: isPrivate || undefined,
        privateRecipient: (isPrivate && privateRecipient) ? privateRecipient : undefined,
        attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
      }
      await saveSugestao(msg)

      // Notify mentions (filter to visible recipients)
      if (mentionedEmails.length > 0) {
        const recipients = mentionedEmails.filter(e => e !== session?.email)
        if (recipients.length > 0) {
          notifySugestaoMention({
            senderEmail: session?.email ?? '',
            recipientEmails: recipients,
            messageExcerpt: msg.content,
          }).catch(() => {})
        }
      }

      return msg
    },
    onSuccess: (msg) => {
      if (!msg) return
      queryClient.setQueryData(['sugestoes'], (prev: SugestaoMessage[] = []) => [...prev, msg])
      setText('')
      setPendingAttachments([])
      setMentionedEmails([])
      setIsPrivate(false)
      setPrivateRecipient('')
      setSending(false)
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    },
    onError: (err) => {
      setSending(false)
      toast({ title: 'Erro ao enviar', description: String(err), variant: 'destructive' })
    },
  })

  // ── Delete mutation ──
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSugestao(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData(['sugestoes'], (prev: SugestaoMessage[] = []) => prev.filter(m => m.id !== id))
      toast({ title: 'Mensagem excluída' })
    },
    onError: (err) => {
      toast({ title: 'Erro ao excluir', description: String(err), variant: 'destructive' })
    },
  })

  function handleSend() {
    if (sending) return
    if (!text.trim() && pendingAttachments.length === 0) return
    sendMutation.mutate()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && filteredMentionOptions.length > 0) {
      // Let dropdown handle it — do nothing special here
      if (e.key === 'Escape') {
        setMentionQuery(null)
        e.preventDefault()
      }
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Users list for private recipient selection ──
  const otherUsers = (usersIndex?.emails ?? []).filter(e => e !== session?.email)

  return (
    <div
      className={cn(
        'flex flex-col h-full min-h-0',
        isDragging && 'ring-2 ring-amber-400 ring-inset rounded-xl'
      )}
      style={{ height: 'calc(100vh - 4rem)' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex-shrink-0 pb-4 border-b border-gray-100 dark:border-gray-800">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Bate-Papo e Sugestões</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Canal de mensagens e sugestões do grupo</p>
      </div>

      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-4 min-h-0">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-16 text-center">
            <MessageSquare className="w-10 h-10 text-gray-200 dark:text-gray-700 mb-3" />
            <p className="text-gray-400 dark:text-gray-500 text-sm">Nenhuma mensagem ainda. Seja o primeiro!</p>
          </div>
        ) : (
          visibleMessages.map(msg => {
            const isMine = msg.authorEmail === session?.email
            const canDelete = isMine || session?.isAdmin === true
            return (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isMine={isMine}
                profiles={profiles}
                canDelete={canDelete}
                onDelete={() => deleteMutation.mutate(msg.id)}
              />
            )
          })
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 pt-3 border-t border-gray-100 dark:border-gray-800">
        {/* Pending attachments */}
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {pendingAttachments.map((att, i) => (
              <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs">
                <Paperclip className="w-3 h-3 text-amber-500 flex-shrink-0" />
                <span className="truncate max-w-[120px] text-gray-700 dark:text-gray-200">{att.name}</span>
                <span className="text-gray-400">{formatSize(att.size)}</span>
                <button onClick={() => removeAttachment(i)} className="ml-1 text-gray-300 hover:text-red-400">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea + mention dropdown */}
        <div className="relative">
          {mentionQuery !== null && (
            <MentionDropdown options={filteredMentionOptions} onSelect={insertMention} />
          )}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="Escreva uma mensagem... (@ para mencionar, Enter para enviar)"
            rows={1}
            className={cn(
              'w-full resize-none rounded-xl border border-gray-200 dark:border-gray-700',
              'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100',
              'px-4 py-2.5 text-sm leading-6 outline-none',
              'focus:border-amber-400 dark:focus:border-amber-500 focus:ring-1 focus:ring-amber-400/30',
              'transition-colors placeholder:text-gray-300 dark:placeholder:text-gray-600',
              'overflow-hidden'
            )}
            style={{ minHeight: '40px', maxHeight: '112px' }}
          />
        </div>

        {/* Action row */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {/* Private toggle */}
          <div className="relative" ref={privateRecipientRef}>
            <button
              type="button"
              onClick={() => {
                if (!isPrivate) {
                  setIsPrivate(true)
                  setShowPrivateRecipientMenu(true)
                } else {
                  setIsPrivate(false)
                  setPrivateRecipient('')
                  setShowPrivateRecipientMenu(false)
                }
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                isPrivate
                  ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 border border-violet-200 dark:border-violet-700'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-violet-200 hover:text-violet-500'
              )}
            >
              <Lock className="w-3 h-3" />
              {isPrivate && privateRecipient
                ? `Privado → ${(profiles.find(p => p.email === privateRecipient)?.nome || privateRecipient.split('@')[0])}`
                : 'Privado'}
            </button>
            {showPrivateRecipientMenu && isPrivate && (
              <div className="absolute bottom-full mb-1 left-0 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[180px]">
                <p className="px-3 py-1.5 text-xs text-gray-400 font-medium uppercase tracking-wide">Enviar para</p>
                {otherUsers.map(email => {
                  const profile = profiles.find(p => p.email === email)
                  const name = profile?.nome || email.split('@')[0]
                  return (
                    <button
                      key={email}
                      type="button"
                      onMouseDown={e => { e.preventDefault(); setPrivateRecipient(email); setShowPrivateRecipientMenu(false) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"
                    >
                      <span className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center text-xs font-bold text-violet-600 dark:text-violet-300 flex-shrink-0">
                        {name[0]?.toUpperCase() ?? '?'}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 dark:text-gray-100 truncate text-xs">{name}</p>
                      </div>
                      {privateRecipient === email && (
                        <span className="ml-auto text-violet-500 text-xs">✓</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Attachment button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Anexar arquivo"
            className="p-1.5 rounded-lg text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => { if (e.target.files) handleFiles(e.target.files) }}
          />

          {/* Spacer */}
          <div className="flex-1" />

          {/* Send button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || (!text.trim() && pendingAttachments.length === 0)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
              'bg-amber-500 hover:bg-amber-600 text-white',
              'disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            {sending
              ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Send className="w-3.5 h-3.5" />
            }
            Enviar
          </button>
        </div>
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
