import emailjs from '@emailjs/browser'

export interface EmailJSConfig {
  serviceId: string
  templateId: string
  publicKey: string
}

const EMAILJS_KEY = 'colab_emailjs_config'

export function getEmailJSConfig(): EmailJSConfig | null {
  try {
    const raw = localStorage.getItem(EMAILJS_KEY)
    if (!raw) return null
    const cfg = JSON.parse(raw) as EmailJSConfig
    return cfg.serviceId && cfg.templateId && cfg.publicKey ? cfg : null
  } catch {
    return null
  }
}

export function saveEmailJSConfig(cfg: EmailJSConfig): void {
  localStorage.setItem(EMAILJS_KEY, JSON.stringify(cfg))
}

export function clearEmailJSConfig(): void {
  localStorage.removeItem(EMAILJS_KEY)
}

// ─── Generic send (uses the same template variables as leitura) ───────────

async function sendEmail(params: {
  toEmail: string
  fromEmail: string
  moduleName: string
  excerpt: string
  meetingDate: string
  notificationType: string
}): Promise<void> {
  const cfg = getEmailJSConfig()
  if (!cfg) return
  try {
    await emailjs.send(
      cfg.serviceId,
      cfg.templateId,
      {
        to_email: params.toEmail,
        from_email: params.fromEmail,
        sender_email: params.fromEmail,
        module_name: params.moduleName,
        excerpt: params.excerpt,
        meeting_date: params.meetingDate,
        notification_type: params.notificationType,
      },
      cfg.publicKey,
    )
  } catch (err) {
    console.error('EmailJS send failed:', err)
  }
}

// ─── Task notifications ────────────────────────────────────────────────────

type TaskEventType = 'created' | 'edited' | 'completed' | 'date_set' | 'deadline_approaching'

const TASK_EVENT_LABELS: Record<TaskEventType, string> = {
  created:              'Nova tarefa criada',
  edited:               'Tarefa editada',
  completed:            'Tarefa concluída',
  date_set:             'Prazo definido',
  deadline_approaching: 'Prazo se aproximando (amanhã)',
}

function formatDue(dueDate?: string): string {
  if (!dueDate) return '—'
  return new Date(dueDate + 'T12:00:00').toLocaleDateString('pt-BR')
}

export async function notifyTaskEvent(params: {
  eventType: TaskEventType
  taskTitle: string
  taskOwnerEmail: string
  dueDate?: string
  adminEmails: string[]
}): Promise<void> {
  if (!getEmailJSConfig()) return
  const { eventType, taskTitle, taskOwnerEmail, dueDate, adminEmails } = params

  const recipients = [...new Set([taskOwnerEmail, ...adminEmails])]
  const excerpt = `${TASK_EVENT_LABELS[eventType]}: "${taskTitle}" — Responsável: ${taskOwnerEmail}`
  const meetingDate = dueDate ? `Prazo: ${formatDue(dueDate)}` : ''

  await Promise.allSettled(recipients.map(to =>
    sendEmail({
      toEmail: to,
      fromEmail: taskOwnerEmail,
      moduleName: 'Visão Geral — Tarefas',
      excerpt: excerpt.slice(0, 300),
      meetingDate,
      notificationType: eventType,
    }),
  ))
}

// ─── Sugestões mention notification ──────────────────────────────────────

export async function notifySugestaoMention(params: {
  senderEmail: string
  recipientEmails: string[]
  messageExcerpt: string
}): Promise<void> {
  if (!getEmailJSConfig()) return
  await Promise.allSettled(
    params.recipientEmails.map(to =>
      sendEmail({
        toEmail: to,
        fromEmail: params.senderEmail,
        moduleName: 'Sugestões',
        excerpt: params.messageExcerpt.slice(0, 300),
        meetingDate: '',
        notificationType: 'mention',
      })
    )
  )
}

// ─── Leitura notification ─────────────────────────────────────────────────

export async function sendLeituraNotification(params: {
  senderEmail: string
  recipientEmails: string[]
  leituraTitle: string
  leituraAuthors: string
  leituraYear?: string
  leituraSource?: string
  meetingDate: string
}): Promise<void> {
  if (!getEmailJSConfig()) return
  const excerpt = [
    params.leituraAuthors,
    params.leituraYear ? `(${params.leituraYear})` : '',
    params.leituraTitle,
    params.leituraSource ? `— ${params.leituraSource}` : '',
  ].filter(Boolean).join(' ').slice(0, 300)

  await Promise.allSettled(
    params.recipientEmails.map(to =>
      sendEmail({
        toEmail: to,
        fromEmail: params.senderEmail,
        moduleName: 'Leituras Recomendadas',
        excerpt,
        meetingDate: params.meetingDate,
        notificationType: 'leitura',
      }),
    ),
  )
}
