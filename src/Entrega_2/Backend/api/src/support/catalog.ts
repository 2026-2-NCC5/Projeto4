import type { SupportCatalog, SupportCategory, SupportHelpArticle, SupportLimits, SupportTicketPriority } from '../contracts/mobileApi.v1.js';

/**
 * Catálogo do Atendimento ASA: categorias, subcategorias, prazos (dias úteis), equipes e artigos da Central de
 * ajuda. Versionado no código, como a allow-list de intenções do assistente: mudar uma categoria é uma revisão de
 * código, e os chamados guardam só os ids. Conteúdo de demonstração — os textos de orientação devem ser validados
 * pela equipe do ASA antes do uso real.
 */

/** Equipes que podem receber um chamado (nomes públicos, exibidos ao estudante). */
export const SUPPORT_TEAMS = [
  'Atendimento ASA',
  'Secretaria Acadêmica',
  'Coordenação de Curso',
  'Financeiro',
  'Bolsas e Benefícios',
  'Carreiras e Estágios',
  'Infraestrutura',
  'Tecnologia da Informação',
] as const;

export type SupportTeam = (typeof SUPPORT_TEAMS)[number];

/** Toda solicitação nova passa pela triagem do ASA antes de ir para a equipe da categoria. */
export const TRIAGE_TEAM: SupportTeam = 'Atendimento ASA';

interface CategoryDefinition extends SupportCategory {
  defaultTeam: SupportTeam;
  defaultPriority: SupportTicketPriority;
}

const sub = (id: string, label: string) => ({ id, label });

export const SUPPORT_CATEGORIES: readonly CategoryDefinition[] = [
  {
    id: 'academic',
    label: 'Acadêmico',
    description: 'Notas, frequência, revisão de prova e aproveitamento de disciplinas.',
    subcategories: [sub('grades', 'Notas e avaliações'), sub('attendance', 'Frequência'), sub('exam_review', 'Revisão de prova'), sub('credit_transfer', 'Aproveitamento de disciplinas'), sub('complementary_activities', 'Atividades complementares'), sub('other', 'Outro')],
    slaBusinessDays: 3,
    defaultTeam: 'Coordenação de Curso',
    defaultPriority: 'normal',
  },
  {
    id: 'enrollment',
    label: 'Matrícula',
    description: 'Rematrícula, inclusão ou exclusão de disciplinas, trancamento e transferência.',
    subcategories: [sub('reenrollment', 'Rematrícula'), sub('add_drop', 'Inclusão ou exclusão de disciplina'), sub('leave', 'Trancamento'), sub('transfer', 'Transferência'), sub('other', 'Outro')],
    slaBusinessDays: 2,
    defaultTeam: 'Secretaria Acadêmica',
    defaultPriority: 'normal',
  },
  {
    id: 'financial',
    label: 'Financeiro',
    description: 'Boletos, mensalidades, negociação e pagamentos.',
    subcategories: [sub('bill', 'Boleto'), sub('tuition', 'Mensalidade'), sub('negotiation', 'Negociação'), sub('scholarship', 'Bolsa'), sub('unidentified_payment', 'Pagamento não identificado'), sub('other', 'Outro')],
    slaBusinessDays: 2,
    defaultTeam: 'Financeiro',
    defaultPriority: 'normal',
  },
  {
    id: 'documents',
    label: 'Documentos',
    description: 'Declarações, histórico escolar, certificados e diploma.',
    subcategories: [sub('enrollment_certificate', 'Declaração de matrícula'), sub('transcript', 'Histórico escolar'), sub('diploma', 'Diploma ou certificado'), sub('syllabus', 'Plano de ensino'), sub('other', 'Outro')],
    slaBusinessDays: 3,
    defaultTeam: 'Secretaria Acadêmica',
    defaultPriority: 'normal',
  },
  {
    id: 'scholarships',
    label: 'Bolsas e benefícios',
    description: 'Bolsas institucionais, programas de financiamento e auxílios.',
    subcategories: [sub('institutional', 'Bolsa institucional'), sub('government', 'Programa de financiamento'), sub('aid', 'Auxílio ao estudante'), sub('other', 'Outro')],
    slaBusinessDays: 5,
    defaultTeam: 'Bolsas e Benefícios',
    defaultPriority: 'normal',
  },
  {
    id: 'internship',
    label: 'Estágio',
    description: 'Termo de compromisso, relatórios, validação de horas e vagas.',
    subcategories: [sub('agreement', 'Termo de compromisso'), sub('report', 'Relatório de estágio'), sub('hours', 'Validação de horas'), sub('opportunities', 'Vagas e orientação'), sub('other', 'Outro')],
    slaBusinessDays: 3,
    defaultTeam: 'Carreiras e Estágios',
    defaultPriority: 'normal',
  },
  {
    id: 'infrastructure',
    label: 'Infraestrutura',
    description: 'Salas, laboratórios, biblioteca, acessibilidade e equipamentos.',
    subcategories: [sub('rooms', 'Salas e laboratórios'), sub('library', 'Biblioteca'), sub('accessibility', 'Acessibilidade'), sub('equipment', 'Equipamentos'), sub('other', 'Outro')],
    slaBusinessDays: 5,
    defaultTeam: 'Infraestrutura',
    defaultPriority: 'normal',
  },
  {
    id: 'systems_access',
    label: 'Acesso aos sistemas',
    description: 'Portal do aluno, e-mail institucional, ambiente virtual e Wi-Fi.',
    subcategories: [sub('portal', 'Portal do aluno'), sub('email', 'E-mail institucional'), sub('lms', 'Ambiente virtual de aprendizagem'), sub('wifi', 'Wi-Fi'), sub('password', 'Senha e acesso'), sub('other', 'Outro')],
    slaBusinessDays: 1,
    defaultTeam: 'Tecnologia da Informação',
    defaultPriority: 'high',
  },
  {
    id: 'asa_service',
    label: 'Atendimento ASA',
    description: 'Orientação acadêmica, apoio ao estudante e agendamentos com o ASA.',
    subcategories: [sub('guidance', 'Orientação acadêmica'), sub('support', 'Apoio ao estudante'), sub('appointment', 'Agendamento com o ASA'), sub('feedback', 'Sugestão ou elogio'), sub('other', 'Outro')],
    slaBusinessDays: 2,
    defaultTeam: 'Atendimento ASA',
    defaultPriority: 'normal',
  },
  {
    id: 'other',
    label: 'Outro',
    description: 'Não encontrou a categoria? Conte para o ASA.',
    subcategories: [],
    slaBusinessDays: 3,
    defaultTeam: 'Atendimento ASA',
    defaultPriority: 'normal',
  },
];

export const SUPPORT_ARTICLES: readonly SupportHelpArticle[] = [
  {
    id: 'financial-bill-copy',
    categoryId: 'financial',
    title: 'Como emitir a segunda via do boleto?',
    summary: 'A segunda via fica disponível na área financeira do portal do aluno.',
    steps: ['Entre no portal do aluno.', 'Abra a área Financeiro.', 'Escolha a parcela e toque em "Segunda via".'],
  },
  {
    id: 'financial-payment-time',
    categoryId: 'financial',
    title: 'Quanto tempo leva para um pagamento aparecer?',
    summary: 'Pagamentos por boleto podem levar até 3 dias úteis para serem compensados.',
    steps: ['Aguarde a compensação bancária.', 'Se o prazo passou, abra um chamado e anexe o comprovante.'],
  },
  {
    id: 'financial-negotiation',
    categoryId: 'financial',
    title: 'Como negociar mensalidades em aberto?',
    summary: 'O Financeiro analisa propostas de negociação caso a caso.',
    steps: ['Separe as parcelas em aberto.', 'Abra um chamado em Financeiro → Negociação descrevendo sua proposta.'],
  },
  {
    id: 'documents-enrollment-certificate',
    categoryId: 'documents',
    title: 'Como solicitar uma declaração de matrícula?',
    summary: 'A declaração simples pode ser emitida no portal; versões específicas são feitas pela Secretaria.',
    steps: ['Entre no portal do aluno.', 'Abra Documentos → Declarações.', 'Para um modelo específico, abra um chamado informando a finalidade.'],
  },
  {
    id: 'documents-transcript',
    categoryId: 'documents',
    title: 'Como obter o histórico escolar?',
    summary: 'O histórico parcial é emitido pela Secretaria Acadêmica em até 3 dias úteis.',
    steps: ['Abra um chamado em Documentos → Histórico escolar.', 'Informe se precisa de versão assinada.'],
  },
  {
    id: 'academic-grade-review',
    categoryId: 'academic',
    title: 'Como pedir revisão de prova?',
    summary: 'A revisão deve ser solicitada após a divulgação da nota, dentro do prazo do calendário acadêmico.',
    steps: ['Confira o prazo no calendário acadêmico.', 'Abra um chamado em Acadêmico → Revisão de prova com a disciplina e a avaliação.'],
  },
  {
    id: 'academic-attendance',
    categoryId: 'academic',
    title: 'Faltei por motivo de saúde. O que fazer?',
    summary: 'Faltas justificadas exigem atestado entregue dentro do prazo.',
    steps: ['Digitalize o atestado.', 'Abra um chamado em Acadêmico → Frequência e anexe o documento.'],
  },
  {
    id: 'enrollment-add-drop',
    categoryId: 'enrollment',
    title: 'Posso incluir ou excluir uma disciplina?',
    summary: 'Alterações são aceitas no período de ajuste de matrícula.',
    steps: ['Confira o período de ajuste no calendário.', 'Abra um chamado informando a disciplina e a turma.'],
  },
  {
    id: 'systems-password',
    categoryId: 'systems_access',
    title: 'Esqueci a senha do portal do aluno',
    summary: 'A redefinição pode ser feita pelo link "Esqueci minha senha" na tela de acesso do portal.',
    steps: ['Abra a tela de acesso do portal.', 'Toque em "Esqueci minha senha" e siga as instruções enviadas ao e-mail.'],
  },
  {
    id: 'systems-wifi',
    categoryId: 'systems_access',
    title: 'Como conectar ao Wi-Fi do campus?',
    summary: 'Use o usuário e a senha do portal do aluno na rede institucional.',
    steps: ['Escolha a rede institucional.', 'Entre com o usuário e a senha do portal.'],
  },
  {
    id: 'internship-agreement',
    categoryId: 'internship',
    title: 'Como formalizar o termo de compromisso?',
    summary: 'O termo precisa das assinaturas da empresa, do estudante e da instituição.',
    steps: ['Preencha o termo com a empresa.', 'Abra um chamado em Estágio → Termo de compromisso e anexe o documento.'],
  },
  {
    id: 'scholarships-documents',
    categoryId: 'scholarships',
    title: 'Quais documentos preciso para uma bolsa?',
    summary: 'Cada programa tem sua lista; em geral, comprovantes de renda e de residência.',
    steps: ['Confira o edital do programa.', 'Abra um chamado em Bolsas e benefícios para tirar dúvidas específicas.'],
  },
  {
    id: 'asa-appointment',
    categoryId: 'asa_service',
    title: 'Como agendar um atendimento com o ASA?',
    summary: 'Você pode pedir um horário com o ASA por aqui mesmo.',
    steps: ['Abra um chamado em Atendimento ASA → Agendamento com o ASA.', 'Informe os dias e horários em que pode comparecer.'],
  },
  {
    id: 'infrastructure-accessibility',
    categoryId: 'infrastructure',
    title: 'Preciso de um recurso de acessibilidade',
    summary: 'O ASA articula adaptações de sala, material e avaliação com as equipes responsáveis.',
    steps: ['Abra um chamado em Infraestrutura → Acessibilidade.', 'Descreva o recurso de que você precisa.'],
  },
];

export const SUPPORT_LIMITS: SupportLimits = {
  subjectMinLength: 5,
  subjectMaxLength: 120,
  descriptionMinLength: 20,
  descriptionMaxLength: 1500,
  messageMaxLength: 2000,
  maxAttachmentsPerTicket: 10,
  maxAttachmentBytes: 5 * 1024 * 1024,
  allowedMimeTypes: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ],
  reopenWindowDays: 7,
};

/** Arquivos por envio (abertura ou mensagem). */
export const MAX_ATTACHMENTS_PER_SUBMISSION = 5;

export function findCategory(id: string): CategoryDefinition | undefined {
  return SUPPORT_CATEGORIES.find((category) => category.id === id);
}

export function findSubcategoryLabel(categoryId: string, subcategoryId: string | null): string | null {
  if (!subcategoryId) return null;
  return findCategory(categoryId)?.subcategories.find((item) => item.id === subcategoryId)?.label ?? null;
}

export function isSupportTeam(value: string): value is SupportTeam {
  return (SUPPORT_TEAMS as readonly string[]).includes(value);
}

export function supportCatalog(): SupportCatalog {
  return {
    categories: SUPPORT_CATEGORIES.map(({ defaultPriority: _priority, ...category }) => ({ ...category, subcategories: [...category.subcategories] })),
    articles: SUPPORT_ARTICLES.map((article) => ({ ...article, steps: [...article.steps] })),
    limits: { ...SUPPORT_LIMITS, maxAttachmentsPerSubmission: MAX_ATTACHMENTS_PER_SUBMISSION, allowedMimeTypes: [...SUPPORT_LIMITS.allowedMimeTypes] },
    teams: [...SUPPORT_TEAMS],
  };
}

/** Minúsculas e sem acentos: "Matrícula" e "matricula" se encontram na busca. */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ids das categorias cujo nome contém o termo (busca por categoria). */
export function categoryIdsMatching(normalizedTerm: string): string[] {
  if (!normalizedTerm) return [];
  return SUPPORT_CATEGORIES.filter((category) => normalizeSearch(category.label).includes(normalizedTerm)).map((category) => category.id);
}
