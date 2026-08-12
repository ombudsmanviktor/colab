// ─── Auth ─────────────────────────────────────────────────────────────────

export interface UsersIndex {
  emails: string[]
  admins: string[]
}

// ─── Tasks (Visão Geral) ──────────────────────────────────────────────────

export interface Task {
  id: string
  title: string
  dueDate?: string
  completed: boolean
  completedAt?: string
  order: number
  createdAt: string
  front?: string
  private?: boolean
}

export interface UserTasks {
  email: string
  tasks: Task[]
  lastAccess: string
}

// ─── User Profiles (Usuários) ─────────────────────────────────────────────

export type UserStatus =
  | 'graduando'
  | 'mestrando'
  | 'doutorando'
  | 'doutor'
  | 'pos-doutorando'
  | 'lider'

export interface UserProfile {
  email: string
  nome: string
  status?: UserStatus
  imagemBase64?: string
  minibio?: string
  lattes?: string
  googleScholar?: string
  orcid?: string
  academiaedu?: string
  researchgate?: string
  instagram?: string
  x?: string
  telefone?: string
  cpf?: string
  updatedAt: string
}

// ─── Ordem do Dia ─────────────────────────────────────────────────────────

export interface Pauta {
  id: string
  title: string
  order: number
}

export interface Ata {
  content: string
  updated_at: string
}

export interface OrdemDoDia {
  id: string
  title: string
  meeting_date?: string
  pautas: Pauta[]
  ata: Ata
  archived?: boolean
  created_at: string
  updated_at: string
}

// ─── Atas e Decisões ──────────────────────────────────────────────────────

export interface AtaDecisao {
  id: string
  title: string
  body: string
  order: number
  createdAt: string
  updatedAt: string
}

// ─── Sugestões ────────────────────────────────────────────────────────────

export interface SugestaoAttachment {
  name: string
  base64: string
  mimeType: string
  size: number // bytes
}

export interface SugestaoMessage {
  id: string
  authorEmail: string
  content: string
  createdAt: string
  private?: boolean
  privateRecipient?: string // email — if set, message is private between author and this recipient
  attachments?: SugestaoAttachment[]
  mentions?: string[] // emails mentioned in the message
}

// ─── Orientações ──────────────────────────────────────────────────────────

export interface Anexo {
  id: string
  name: string
  size: number
  url: string
  type: string
  path?: string
}

export interface NotaReuniao {
  id: string
  data?: string
  texto: string
  anexo?: Anexo
}

export interface Orientacao {
  id: string
  nome_orientando: string
  curso: string
  titulo_provisorio?: string
  ano_ingresso?: number
  previsao_conclusao?: string
  exame_qualificacao?: boolean
  arquivada?: boolean
  leituras?: string[]
  reunioes?: NotaReuniao[]
  links_documentos?: string[]
  projeto_original?: Anexo
  created_at: string
  updated_at: string
}

export interface TarefaOrientacao {
  id: string
  orientacao_id: string
  descricao: string
  concluida: boolean
  created_at: string
}

// ─── Linha do Tempo ───────────────────────────────────────────────────────

export interface TimelineCategory {
  id: string
  name: string
  color: string
}

export interface TimelineEvent {
  id: string
  title: string
  description?: string
  year: number
  month?: number
  day?: number
  category_ids: string[]
  created_at: string
  updated_at: string
}

export interface TimelineData {
  events: TimelineEvent[]
  categories: TimelineCategory[]
}

// ─── Wiki ─────────────────────────────────────────────────────────────────

export interface WikiEntry {
  id: string
  title: string
  content: string
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
  order: number
}

// ─── Callout (recado geral) ───────────────────────────────────────────────

export interface CalloutData {
  content: string
  updated_at: string
  updated_by: string
}

// ─── Leituras Recomendadas ────────────────────────────────────────────────

export interface Leitura {
  id: string
  title: string
  authors: string[]
  year?: string
  source?: string
  meetingDate: string
  pdfBase64?: string
  pdfName?: string
  url?: string
  notes?: string
  addedBy: string
  createdAt: string
}

// ─── Produções Recentes ───────────────────────────────────────────────────

export interface Producao {
  id: string
  title: string
  authors: string[]          // canonical ABNT: "Sobrenome, Prenome"
  colabAuthors?: string[]    // subset of authors who are coLAB members
  year?: string
  source?: string
  meetingDate?: string       // kept for backward compat, no longer shown
  pdfBase64?: string
  pdfName?: string
  url?: string
  notes?: string
  addedBy: string
  createdAt: string
}

// ─── Planejamento das Reuniões ────────────────────────────────────────────

export interface PlanReading {
  id: string
  title: string
  authors?: string
  year?: string
  url?: string
  notes?: string
  pdfBase64?: string
  pdfName?: string
}

export interface PlannedMeeting {
  id: string
  date: string          // YYYY-MM-DD
  isSpecial: boolean
  description?: string
  readingId?: string    // references PlanReading.id
}

export interface MeetingPlan {
  id: string
  name: string
  startDate: string     // YYYY-MM-DD
  endDate: string       // YYYY-MM-DD
  weekday: number       // 0=Dom … 6=Sáb
  intervalWeeks: number // 1=semanal, 2=quinzenal, etc.
  meetings: PlannedMeeting[]
  readings: PlanReading[]
  archived: boolean
  createdAt: string
  createdBy: string
}
