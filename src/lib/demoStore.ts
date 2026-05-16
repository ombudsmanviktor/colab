// ─── In-memory demo store ──────────────────────────────────────────────────

import type { UsersIndex, UserTasks, UserProfile, OrdemDoDia, AtaDecisao, Leitura, SugestaoMessage } from '@/types'

export const DEMO_EMAIL = 'demo@colab.app'
export const DEMO_EMAIL2 = 'ana@grupo.edu.br'
export const DEMO_EMAIL3 = 'carlos@grupo.edu.br'

const NOW = new Date().toISOString()
const TODAY = NOW.split('T')[0]

const DEMO_USERS_INDEX: UsersIndex = {
  emails: [DEMO_EMAIL, DEMO_EMAIL2, DEMO_EMAIL3],
  admins: [DEMO_EMAIL],
}

const DEMO_USER_TASKS: UserTasks[] = [
  {
    email: DEMO_EMAIL,
    lastAccess: NOW,
    tasks: [
      { id: 't1', title: 'Revisar capítulo 2 da dissertação', dueDate: TODAY, completed: false, order: 0, createdAt: NOW, front: 'Escrita' },
      { id: 't2', title: 'Preparar apresentação para próxima reunião', completed: false, order: 1, createdAt: NOW, front: 'Apresentações' },
      { id: 't3', title: 'Enviar relatório de qualificação', dueDate: '2026-05-15', completed: false, order: 2, createdAt: NOW, front: 'Escrita' },
      { id: 't4', title: 'Leitura: Bourdieu — Campo Científico', completed: true, completedAt: NOW, order: 3, createdAt: NOW },
    ],
  },
  {
    email: DEMO_EMAIL2,
    lastAccess: new Date(Date.now() - 86400000).toISOString(),
    tasks: [
      { id: 't5', title: 'Fichamento do artigo sobre metodologia qualitativa', dueDate: '2026-05-10', completed: false, order: 0, createdAt: NOW, front: 'Coleta de Dados' },
      { id: 't6', title: 'Submeter resumo para congresso ANPOCS', completed: false, order: 1, createdAt: NOW, front: 'Organização de Evento' },
    ],
  },
  {
    email: DEMO_EMAIL3,
    lastAccess: new Date(Date.now() - 172800000).toISOString(),
    tasks: [
      { id: 't7', title: 'Transcrever entrevistas do campo', completed: false, order: 0, createdAt: NOW, front: 'Coleta de Dados' },
      { id: 't8', title: 'Organizar referências no Zotero', completed: true, completedAt: NOW, order: 1, createdAt: NOW, front: 'Codificação' },
    ],
  },
]

const DEMO_USER_PROFILES: UserProfile[] = [
  {
    email: DEMO_EMAIL,
    nome: 'Usuário Demo',
    status: 'lider',
    minibio: 'Líder do grupo de pesquisa coLAB/UFF. Pesquisador em comunicação e cultura.',
    lattes: 'http://lattes.cnpq.br',
    updatedAt: NOW,
  },
  {
    email: DEMO_EMAIL2,
    nome: 'Ana Silva',
    status: 'doutorando',
    minibio: 'Doutoranda em Comunicação. Pesquisa sobre memória e identidade digital.',
    updatedAt: NOW,
  },
  {
    email: DEMO_EMAIL3,
    nome: '',
    updatedAt: NOW,
  },
]

const DEMO_ORDENS: OrdemDoDia[] = [
  {
    id: 'demo-ordem-1',
    title: 'Reunião ordinária do grupo — maio',
    meeting_date: '2026-05-15',
    pautas: [
      { id: 'p1', title: 'Apresentação dos andamentos de pesquisa', order: 0 },
      { id: 'p2', title: 'Discussão do artigo de Bourdieu', order: 1 },
      { id: 'p3', title: 'Planejamento do evento de fim de semestre', order: 2 },
    ],
    ata: { content: '', updated_at: '' },
    archived: false,
    created_at: NOW,
    updated_at: NOW,
  },
]

const DEMO_ATAS: AtaDecisao[] = [
  {
    id: 'demo-ata-1',
    title: 'Normas de funcionamento do grupo',
    body: '## Reuniões\n\nAs reuniões ordinárias do grupo ocorrem **quinzenalmente**, às sextas-feiras, das 14h às 16h.\n\n## Leituras\n\nCada membro fica responsável por indicar pelo menos **uma leitura por mês** para discussão coletiva.\n\n## Comunicação\n\nO canal oficial de comunicação do grupo é o email institucional.',
    order: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
]

const DEMO_LEITURAS: Leitura[] = [
  {
    id: 'demo-leitura-1',
    title: 'Os usos sociais da ciência',
    authors: ['Bourdieu, Pierre'],
    year: '2004',
    source: 'Editora UNESP',
    meetingDate: '2026-05-15',
    addedBy: DEMO_EMAIL,
    createdAt: NOW,
  },
  {
    id: 'demo-leitura-2',
    title: 'Comunicação e poder',
    authors: ['Castells, Manuel'],
    year: '2009',
    source: 'Paz e Terra',
    meetingDate: '2026-04-17',
    addedBy: DEMO_EMAIL2,
    createdAt: NOW,
  },
]

const DEMO_SUGESTOES: SugestaoMessage[] = [
  {
    id: 'demo-sugestao-1',
    authorEmail: DEMO_EMAIL,
    content: 'Olá pessoal! Sugiro que discutamos na próxima reunião a possibilidade de organizar um seminário interno sobre metodologias qualitativas. O que acham?',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    mentions: [],
  },
  {
    id: 'demo-sugestao-2',
    authorEmail: DEMO_EMAIL2,
    content: 'Ótima ideia, @Usuário Demo! Poderia também incluir uma sessão sobre análise de conteúdo. Tenho um artigo interessante sobre o tema.',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    mentions: [DEMO_EMAIL],
    attachments: [
      {
        name: 'artigo-analise-conteudo.pdf',
        base64: 'JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDMgMCBSL0ZpbHRlci9GbGF0ZURlY29kZT4+CnN0cmVhbQp4nCtUMlQyVLJUslIqS60oKU0tLi5WSMsvyklRslIqLU4tykvMTQUA',
        mimeType: 'application/pdf',
        size: 48320,
      },
    ],
  },
  {
    id: 'demo-sugestao-3',
    authorEmail: DEMO_EMAIL,
    content: 'Mensagem privada: precisamos conversar sobre o prazo de entrega do relatório antes da reunião.',
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    private: true,
    privateRecipient: DEMO_EMAIL2,
    mentions: [],
  },
  {
    id: 'demo-sugestao-4',
    authorEmail: DEMO_EMAIL3,
    content: 'Também concordo com o seminário. @Ana Silva poderia coordenar? Ela tem bastante experiência com esse tipo de evento.',
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    mentions: [DEMO_EMAIL2],
  },
]

// ─── Mutable store ─────────────────────────────────────────────────────────

interface DemoStore {
  usersIndex: UsersIndex
  userTasks: UserTasks[]
  userProfiles: UserProfile[]
  ordens: OrdemDoDia[]
  atas: AtaDecisao[]
  leituras: Leitura[]
  sugestoes: SugestaoMessage[]
}

function buildStore(): DemoStore {
  return {
    usersIndex: JSON.parse(JSON.stringify(DEMO_USERS_INDEX)),
    userTasks: JSON.parse(JSON.stringify(DEMO_USER_TASKS)),
    userProfiles: JSON.parse(JSON.stringify(DEMO_USER_PROFILES)),
    ordens: JSON.parse(JSON.stringify(DEMO_ORDENS)),
    atas: JSON.parse(JSON.stringify(DEMO_ATAS)),
    leituras: JSON.parse(JSON.stringify(DEMO_LEITURAS)),
    sugestoes: JSON.parse(JSON.stringify(DEMO_SUGESTOES)),
  }
}

let _isDemoMode = false
let _store: DemoStore = buildStore()

export function isDemoMode(): boolean { return _isDemoMode }

export function setDemoMode(enabled: boolean): void {
  _isDemoMode = enabled
  if (enabled) _store = buildStore()
}

export function demoLoadUsersIndex(): UsersIndex { return JSON.parse(JSON.stringify(_store.usersIndex)) }
export function demoSaveUsersIndex(idx: UsersIndex): void { _store.usersIndex = JSON.parse(JSON.stringify(idx)) }

export function demoLoadAllUserTasks(): UserTasks[] { return JSON.parse(JSON.stringify(_store.userTasks)) }
export function demoSaveUserTasks(ut: UserTasks): void {
  const idx = _store.userTasks.findIndex(x => x.email === ut.email)
  if (idx >= 0) _store.userTasks[idx] = JSON.parse(JSON.stringify(ut))
  else _store.userTasks.push(JSON.parse(JSON.stringify(ut)))
}

export function demoLoadUserProfile(email: string): UserProfile | null {
  return _store.userProfiles.find(p => p.email === email) ?? null
}
export function demoSaveUserProfile(profile: UserProfile): void {
  const idx = _store.userProfiles.findIndex(p => p.email === profile.email)
  if (idx >= 0) _store.userProfiles[idx] = JSON.parse(JSON.stringify(profile))
  else _store.userProfiles.push(JSON.parse(JSON.stringify(profile)))
}
export function demoLoadAllProfiles(): UserProfile[] { return JSON.parse(JSON.stringify(_store.userProfiles)) }

export function demoLoadOrdens(): OrdemDoDia[] { return JSON.parse(JSON.stringify(_store.ordens)) }
export function demoSaveOrdem(o: OrdemDoDia): void {
  const idx = _store.ordens.findIndex(x => x.id === o.id)
  if (idx >= 0) _store.ordens[idx] = JSON.parse(JSON.stringify(o))
  else _store.ordens.push(JSON.parse(JSON.stringify(o)))
}
export function demoDeleteOrdem(id: string): void { _store.ordens = _store.ordens.filter(x => x.id !== id) }

export function demoLoadAtas(): AtaDecisao[] { return JSON.parse(JSON.stringify(_store.atas)) }
export function demoSaveAta(a: AtaDecisao): void {
  const idx = _store.atas.findIndex(x => x.id === a.id)
  if (idx >= 0) _store.atas[idx] = JSON.parse(JSON.stringify(a))
  else _store.atas.push(JSON.parse(JSON.stringify(a)))
}
export function demoDeleteAta(id: string): void { _store.atas = _store.atas.filter(x => x.id !== id) }

export function demoLoadLeituras(): Leitura[] { return JSON.parse(JSON.stringify(_store.leituras)) }
export function demoSaveLeitura(l: Leitura): void {
  const idx = _store.leituras.findIndex(x => x.id === l.id)
  if (idx >= 0) _store.leituras[idx] = JSON.parse(JSON.stringify(l))
  else _store.leituras.push(JSON.parse(JSON.stringify(l)))
}
export function demoDeleteLeitura(id: string): void { _store.leituras = _store.leituras.filter(x => x.id !== id) }

export function demoLoadSugestoes(): SugestaoMessage[] { return JSON.parse(JSON.stringify(_store.sugestoes)) }
export function demoSaveSugestao(msg: SugestaoMessage): void {
  const idx = _store.sugestoes.findIndex(x => x.id === msg.id)
  if (idx >= 0) _store.sugestoes[idx] = JSON.parse(JSON.stringify(msg))
  else _store.sugestoes.push(JSON.parse(JSON.stringify(msg)))
}
export function demoDeleteSugestao(id: string): void { _store.sugestoes = _store.sugestoes.filter(x => x.id !== id) }
