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

// ─── Generic send ─────────────────────────────────────────────────────────

async function sendEmail(toEmail: string, subject: string, body: string): Promise<void> {
  const cfg = getEmailJSConfig()
  if (!cfg) return
  try {
    await emailjs.send(
      cfg.serviceId,
      cfg.templateId,
      { to_email: toEmail, from_email: 'coLAB', subject, body },
      cfg.publicKey,
    )
  } catch (err) {
    console.error('EmailJS send failed:', err)
  }
}

// ─── Task notifications ────────────────────────────────────────────────────

type TaskEventType = 'created' | 'edited' | 'completed' | 'date_set' | 'deadline_approaching'

function formatDue(dueDate?: string): string {
  if (!dueDate) return ''
  return new Date(dueDate + 'T12:00:00').toLocaleDateString('pt-BR')
}

function buildTaskEmail(
  eventType: TaskEventType,
  taskTitle: string,
  taskOwnerEmail: string,
  dueDate?: string,
): { subject: string; body: string } {
  const due = dueDate ? `\nPrazo: ${formatDue(dueDate)}` : ''
  const owner = `Responsável: ${taskOwnerEmail}`

  switch (eventType) {
    case 'created':
      return {
        subject: '[coLAB] Nova tarefa criada',
        body: `Uma nova tarefa foi criada:\n\n"${taskTitle}"\n\n${owner}${due}`,
      }
    case 'edited':
      return {
        subject: '[coLAB] Tarefa editada',
        body: `Uma tarefa foi editada:\n\n"${taskTitle}"\n\n${owner}${due}`,
      }
    case 'completed':
      return {
        subject: '[coLAB] Tarefa concluída',
        body: `A seguinte tarefa foi marcada como concluída:\n\n"${taskTitle}"\n\n${owner}`,
      }
    case 'date_set':
      return {
        subject: '[coLAB] Prazo definido',
        body: `Um prazo foi definido para a tarefa:\n\n"${taskTitle}"\n\n${owner}${due}`,
      }
    case 'deadline_approaching':
      return {
        subject: '[coLAB] Prazo se aproximando',
        body: `O prazo da seguinte tarefa é amanhã:\n\n"${taskTitle}"\n\n${owner}${due}`,
      }
  }
}

export async function notifyTaskEvent(params: {
  eventType: TaskEventType
  taskTitle: string
  taskOwnerEmail: string
  dueDate?: string
  adminEmails: string[]
}): Promise<void> {
  if (!getEmailJSConfig()) return
  const { subject, body } = buildTaskEmail(
    params.eventType, params.taskTitle, params.taskOwnerEmail, params.dueDate,
  )
  // Recipients: task owner + admins, deduplicated
  const recipients = [...new Set([params.taskOwnerEmail, ...params.adminEmails])]
  await Promise.allSettled(recipients.map(to => sendEmail(to, subject, body)))
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

  const subject = '[coLAB] Nova leitura recomendada'
  const body = `Uma nova leitura foi adicionada ao coLAB por ${params.senderEmail}:\n\n${excerpt}\n\nReunião: ${params.meetingDate}`

  await Promise.allSettled(
    params.recipientEmails.map(to => sendEmail(to, subject, body)),
  )
}
