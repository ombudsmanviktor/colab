// ─── In-memory demo store ──────────────────────────────────────────────────

import type { UsersIndex, UserTasks, UserProfile, OrdemDoDia, AtaDecisao, Leitura, Producao, SugestaoMessage, Orientacao, TarefaOrientacao, TimelineData, TimelineEvent, TimelineCategory, CalloutData, WikiEntry } from '@/types'

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

const DEMO_PRODUCOES: Producao[] = [
  {
    id: 'demo-producao-1',
    title: 'Memória coletiva e identidade social: perspectivas teóricas',
    authors: ['Silva, João Pedro', 'Oliveira, Fernanda'],
    year: '2024',
    source: 'Revista Brasileira de Ciências Sociais',
    meetingDate: '2026-05-15',
    addedBy: DEMO_EMAIL,
    createdAt: NOW,
  },
  {
    id: 'demo-producao-2',
    title: 'Comunicação digital e democracia: desafios contemporâneos',
    authors: ['Costa, Maria Clara'],
    year: '2023',
    source: 'Comunicação & Sociedade',
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

const DEMO_ORIENTACOES: Orientacao[] = [
  {
    id: 'demo-ori-1',
    nome_orientando: 'Ana Silva',
    curso: 'Doutorado',
    titulo_provisorio: 'Memória e identidade digital em comunidades virtuais',
    ano_ingresso: 2022,
    previsao_conclusao: '2026/1',
    exame_qualificacao: true,
    leituras: ['Halbwachs, Maurice — A memória coletiva', 'Castells, Manuel — A sociedade em rede'],
    links_documentos: ['https://drive.google.com/exemplo-ana'],
    reunioes: [
      { id: 'r1', data: '2026-07-10', texto: 'Discussão do terceiro capítulo. Ana apresentou revisão metodológica com bons avanços. Próximo passo: análise dos dados coletados.' },
      { id: 'r2', data: '2026-05-20', texto: 'Revisão do capítulo 2. Ajustes no referencial teórico necessários.' },
    ],
    created_at: new Date(Date.now() - 200 * 86400000).toISOString(),
    updated_at: NOW,
  },
  {
    id: 'demo-ori-2',
    nome_orientando: 'Carlos Mendes',
    curso: 'Mestrado',
    titulo_provisorio: 'Discurso político nas redes sociais durante eleições',
    ano_ingresso: 2024,
    previsao_conclusao: '2026/2',
    exame_qualificacao: false,
    leituras: ['Van Dijk, Teun — Discurso e poder'],
    reunioes: [
      { id: 'r3', data: '2026-07-05', texto: 'Carlos apresentou o projeto de qualificação. Recomendei expandir o corpus de análise.' },
    ],
    created_at: new Date(Date.now() - 80 * 86400000).toISOString(),
    updated_at: NOW,
  },
  {
    id: 'demo-ori-3',
    nome_orientando: 'Beatriz Santos',
    curso: 'Iniciação Científica',
    titulo_provisorio: 'Representações de gênero no jornalismo esportivo',
    ano_ingresso: 2025,
    leituras: [],
    reunioes: [],
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    updated_at: NOW,
  },
  {
    id: 'demo-ori-4',
    nome_orientando: 'Roberto Lima',
    curso: 'Doutorado',
    titulo_provisorio: 'Plataformização da comunicação científica',
    ano_ingresso: 2019,
    previsao_conclusao: '2024/2',
    exame_qualificacao: true,
    arquivada: true,
    leituras: [],
    reunioes: [],
    created_at: new Date(Date.now() - 600 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 60 * 86400000).toISOString(),
  },
]

const DEMO_TAREFAS_ORIENTACAO: TarefaOrientacao[] = [
  { id: 'to1', orientacao_id: 'demo-ori-1', descricao: 'Enviar capítulo 3 revisado', concluida: false, created_at: NOW },
  { id: 'to2', orientacao_id: 'demo-ori-1', descricao: 'Agendar reunião de qualificação', concluida: true, created_at: NOW },
  { id: 'to3', orientacao_id: 'demo-ori-2', descricao: 'Definir corpus de análise', concluida: false, created_at: NOW },
  { id: 'to4', orientacao_id: 'demo-ori-2', descricao: 'Ler Van Dijk capítulos 3-5', concluida: false, created_at: NOW },
]

const DEMO_TIMELINE_CATEGORIES: TimelineCategory[] = [
  { id: 'tc1', name: 'Publicação', color: 'indigo' },
  { id: 'tc2', name: 'Evento', color: 'violet' },
  { id: 'tc3', name: 'Projeto', color: 'teal' },
  { id: 'tc4', name: 'Premiação', color: 'amber' },
  { id: 'tc5', name: 'Parceria', color: 'sky' },
]

const DEMO_TIMELINE_EVENTS: TimelineEvent[] = [
  {
    id: 'te1', title: 'Fundação do grupo coLAB/UFF',
    description: 'O grupo de pesquisa coLAB foi fundado com foco em comunicação digital e cultura de plataformas.',
    year: 2019, month: 3, category_ids: ['tc3'],
    created_at: NOW, updated_at: NOW,
  },
  {
    id: 'te2', title: 'Publicação do primeiro artigo coletivo',
    description: 'Artigo "Plataformas e mediação algorítmica" publicado na Revista de Comunicação.',
    year: 2019, month: 8, category_ids: ['tc1'],
    created_at: NOW, updated_at: NOW,
  },
  {
    id: 'te3', title: 'Parceria com Universidade de Coimbra',
    description: 'Início da colaboração internacional para projeto sobre desinformação.',
    year: 2020, month: 6, category_ids: ['tc5'],
    created_at: NOW, updated_at: NOW,
  },
  {
    id: 'te4', title: 'Seminário Internacional de Comunicação Digital',
    description: 'Organização do evento com 12 palestrantes de 6 países.',
    year: 2021, month: 4, category_ids: ['tc2'],
    created_at: NOW, updated_at: NOW,
  },
  {
    id: 'te5', title: 'Prêmio COMPÓS de Pesquisa',
    description: 'Reconhecimento pela contribuição à área de comunicação e tecnologia.',
    year: 2021, month: 11, category_ids: ['tc4'],
    created_at: NOW, updated_at: NOW,
  },
  {
    id: 'te6', title: 'Lançamento do projeto PesquisaLAB',
    description: 'Plataforma digital para gestão colaborativa de projetos de pesquisa.',
    year: 2022, month: 2, category_ids: ['tc3', 'tc5'],
    created_at: NOW, updated_at: NOW,
  },
  {
    id: 'te7', title: 'Artigo no Journal of Communication',
    description: 'Publicação em periódico internacional Qualis A1 sobre cultura de memes.',
    year: 2023, month: 5, category_ids: ['tc1'],
    created_at: NOW, updated_at: NOW,
  },
  {
    id: 'te8', title: 'Jornada de Pesquisa 2024',
    description: 'Evento anual do grupo com apresentação dos projetos em andamento.',
    year: 2024, month: 10, category_ids: ['tc2'],
    created_at: NOW, updated_at: NOW,
  },
  {
    id: 'te9', title: 'Edital CNPq aprovado',
    description: 'Projeto "Plataformização da esfera pública" aprovado com bolsas de pesquisa.',
    year: 2025, month: 1, category_ids: ['tc3'],
    created_at: NOW, updated_at: NOW,
  },
  {
    id: 'te10', title: 'Coletânea publicada pela EdUFF',
    description: 'Livro "Comunicação em rede: perspectivas críticas" com capítulos do grupo.',
    year: 2026, month: 3, category_ids: ['tc1', 'tc2'],
    created_at: NOW, updated_at: NOW,
  },
]

const DEMO_WIKI: WikiEntry[] = [
  {
    id: 'wiki-sobre',
    title: 'Sobre o coLAB',
    order: 0,
    created_at: NOW,
    updated_at: NOW,
    created_by: DEMO_EMAIL,
    updated_by: DEMO_EMAIL,
    content: `## Sobre o coLAB

O **coLAB** é um grupo de pesquisa vinculado à Universidade Federal Fluminense (UFF), dedicado ao estudo de comunicação, laboratório e metodologias colaborativas.

### Objetivos

- Desenvolver pesquisas sobre comunicação e tecnologia
- Promover encontros e seminários acadêmicos
- Publicar resultados em periódicos indexados

---

> "A pesquisa colaborativa começa com a escuta ativa."

Para dúvidas, contate o coordenador do grupo.`,
  },
  {
    id: 'wiki-regras',
    title: 'Regras de funcionamento',
    order: 1,
    created_at: NOW,
    updated_at: NOW,
    created_by: DEMO_EMAIL,
    updated_by: DEMO_EMAIL,
    content: `## Regras de funcionamento

### Reuniões

As reuniões ordinárias acontecem **quinzenalmente**, às sextas-feiras, das 14h às 16h.

### Comunicação

1. Usar o canal oficial do grupo para comunicações formais
2. Respostas em até **48 horas**
3. Documentar decisões nas atas

### Produções

Toda produção acadêmica deve ser registrada no módulo **Produções Recentes** do coLAB.`,
  },
]

const DEMO_CALLOUT: CalloutData = { content: '', updated_at: NOW, updated_by: '' }

// ─── Mutable store ─────────────────────────────────────────────────────────

interface DemoStore {
  usersIndex: UsersIndex
  userTasks: UserTasks[]
  userProfiles: UserProfile[]
  ordens: OrdemDoDia[]
  atas: AtaDecisao[]
  leituras: Leitura[]
  producoes: Producao[]
  sugestoes: SugestaoMessage[]
  orientacoes: Orientacao[]
  tarefasOrientacao: TarefaOrientacao[]
  timeline: TimelineData
  callout: CalloutData
  wiki: WikiEntry[]
}

function buildStore(): DemoStore {
  return {
    usersIndex: JSON.parse(JSON.stringify(DEMO_USERS_INDEX)),
    userTasks: JSON.parse(JSON.stringify(DEMO_USER_TASKS)),
    userProfiles: JSON.parse(JSON.stringify(DEMO_USER_PROFILES)),
    ordens: JSON.parse(JSON.stringify(DEMO_ORDENS)),
    atas: JSON.parse(JSON.stringify(DEMO_ATAS)),
    leituras: JSON.parse(JSON.stringify(DEMO_LEITURAS)),
    producoes: JSON.parse(JSON.stringify(DEMO_PRODUCOES)),
    sugestoes: JSON.parse(JSON.stringify(DEMO_SUGESTOES)),
    orientacoes: JSON.parse(JSON.stringify(DEMO_ORIENTACOES)),
    tarefasOrientacao: JSON.parse(JSON.stringify(DEMO_TAREFAS_ORIENTACAO)),
    timeline: JSON.parse(JSON.stringify({ events: DEMO_TIMELINE_EVENTS, categories: DEMO_TIMELINE_CATEGORIES })),
    callout: JSON.parse(JSON.stringify(DEMO_CALLOUT)),
    wiki: JSON.parse(JSON.stringify(DEMO_WIKI)),
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

export function demoLoadProducoes(): Producao[] { return JSON.parse(JSON.stringify(_store.producoes)) }
export function demoSaveProducao(p: Producao): void {
  const idx = _store.producoes.findIndex(x => x.id === p.id)
  if (idx >= 0) _store.producoes[idx] = JSON.parse(JSON.stringify(p))
  else _store.producoes.push(JSON.parse(JSON.stringify(p)))
}
export function demoDeleteProducao(id: string): void { _store.producoes = _store.producoes.filter(x => x.id !== id) }

export function demoLoadSugestoes(): SugestaoMessage[] { return JSON.parse(JSON.stringify(_store.sugestoes)) }
export function demoSaveSugestao(msg: SugestaoMessage): void {
  const idx = _store.sugestoes.findIndex(x => x.id === msg.id)
  if (idx >= 0) _store.sugestoes[idx] = JSON.parse(JSON.stringify(msg))
  else _store.sugestoes.push(JSON.parse(JSON.stringify(msg)))
}
export function demoDeleteSugestao(id: string): void { _store.sugestoes = _store.sugestoes.filter(x => x.id !== id) }

export function demoLoadOrientacoes(): { orientacoes: Orientacao[]; tarefas: TarefaOrientacao[] } {
  return {
    orientacoes: JSON.parse(JSON.stringify(_store.orientacoes)),
    tarefas: JSON.parse(JSON.stringify(_store.tarefasOrientacao)),
  }
}
export function demoSaveOrientacao(o: Orientacao, allTarefas: TarefaOrientacao[]): void {
  _store.orientacoes = _store.orientacoes.some(x => x.id === o.id)
    ? _store.orientacoes.map(x => x.id === o.id ? JSON.parse(JSON.stringify(o)) : x)
    : [JSON.parse(JSON.stringify(o)), ..._store.orientacoes]
  _store.tarefasOrientacao = [
    ..._store.tarefasOrientacao.filter(t => t.orientacao_id !== o.id),
    ...allTarefas.filter(t => t.orientacao_id === o.id).map(t => JSON.parse(JSON.stringify(t))),
  ]
}
export function demoDeleteOrientacao(id: string): void {
  _store.orientacoes = _store.orientacoes.filter(x => x.id !== id)
  _store.tarefasOrientacao = _store.tarefasOrientacao.filter(t => t.orientacao_id !== id)
}

export function demoLoadTimeline(): TimelineData {
  return JSON.parse(JSON.stringify(_store.timeline))
}
export function demoSaveTimeline(data: TimelineData): void {
  _store.timeline = JSON.parse(JSON.stringify(data))
}

export function demoLoadCallout(): CalloutData { return JSON.parse(JSON.stringify(_store.callout)) }
export function demoSaveCallout(c: CalloutData): void { _store.callout = JSON.parse(JSON.stringify(c)) }

export function demoLoadWikiEntries(): WikiEntry[] { return JSON.parse(JSON.stringify(_store.wiki)) }
export function demoSaveWikiEntry(e: WikiEntry): void {
  const idx = _store.wiki.findIndex(x => x.id === e.id)
  if (idx >= 0) _store.wiki[idx] = JSON.parse(JSON.stringify(e))
  else _store.wiki.push(JSON.parse(JSON.stringify(e)))
}
export function demoDeleteWikiEntry(id: string): void { _store.wiki = _store.wiki.filter(x => x.id !== id) }
