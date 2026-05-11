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

export async function sendLeituraNotification(params: {
  senderEmail: string
  recipientEmails: string[]
  leituraTitle: string
  leituraAuthors: string
  leituraYear?: string
  leituraSource?: string
  meetingDate: string
}): Promise<void> {
  const cfg = getEmailJSConfig()
  if (!cfg) return

  const excerpt = [
    params.leituraAuthors,
    params.leituraYear ? `(${params.leituraYear})` : '',
    params.leituraTitle,
    params.leituraSource ? `— ${params.leituraSource}` : '',
  ].filter(Boolean).join(' ')

  for (const to of params.recipientEmails) {
    try {
      await emailjs.send(
        cfg.serviceId,
        cfg.templateId,
        {
          from_email: params.senderEmail,
          sender_email: params.senderEmail,
          to_email: to,
          module_name: 'Leituras Recomendadas',
          excerpt: excerpt.slice(0, 300),
          meeting_date: params.meetingDate,
          notification_type: 'leitura',
        },
        cfg.publicKey
      )
    } catch (err) {
      console.error('EmailJS leitura notification failed:', err)
    }
  }
}
