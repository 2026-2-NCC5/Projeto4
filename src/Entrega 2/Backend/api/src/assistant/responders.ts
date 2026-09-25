import type { Logger } from '../config/logger.js';
import type {
  AgentAnalysis,
  AgentRecommendation,
  AssistantClientCommand,
  AssistantConversationContext,
  AssistantDisplayItem,
  AssistantIntent,
  AssistantNavigationAction,
  AssistantNextAction,
  AssistantResponseStatus,
  StudentPendingItem,
} from '../contracts/mobileApi.v1.js';
import { AppError } from '../errors/AppError.js';
import type { AgentService } from '../services/agentService.js';
import type { StudentService } from '../services/studentService.js';
import type { RequestContext } from '../types/domain.js';
import type { Interpretation } from './interpretation.js';
import {
  addDays,
  assessmentTypeLabel,
  countLabel,
  endOfWeek,
  firstName,
  formatDayMonth,
  formatPercent,
  formatScore,
  joinList,
  limitSpeech,
  relativeDay,
  spokenCount,
  spokenDate,
} from './phrasing.js';
import type { SubjectRef } from './subjects.js';

export interface ResponderInput {
  studentId: string;
  userFullName: string;
  interpretation: Interpretation;
  context: AssistantConversationContext;
  enrolled: SubjectRef[];
  today: string;
  requestContext: RequestContext;
  logger: Logger;
}

export interface ResponderOutput {
  status: AssistantResponseStatus;
  title: string;
  message: string;
  speech: string;
  items?: AssistantDisplayItem[];
  recommendations?: AgentRecommendation[];
  nextActions?: AssistantNextAction[];
  clientCommand?: AssistantClientCommand | null;
  /** navegação executada pelo app (intenção open_screen) */
  navigation?: AssistantNavigationAction | null;
  requiresHumanValidation?: boolean;
  abstained?: boolean;
  abstentionReason?: string | null;
  runId?: string | null;
  agentDurationMs?: number | null;
  contextPatch?: Partial<AssistantConversationContext>;
}

export interface ResponderDeps {
  students: StudentService;
  agents: AgentService;
}

type Responder = (input: ResponderInput, deps: ResponderDeps) => Promise<ResponderOutput>;

export const SUGGESTIONS: AssistantNextAction[] = [
  { type: 'ask', label: 'Tenho atividade pendente?', text: 'Tenho alguma atividade pendente?' },
  { type: 'ask', label: 'Qual é minha próxima prova?', text: 'Qual é minha próxima prova?' },
  { type: 'ask', label: 'Como está minha frequência?', text: 'Como está minha frequência?' },
  { type: 'run_analysis', label: 'Analisar minha situação' },
];

const HUMAN_HELP_ACTION: AssistantNextAction = { type: 'ask', label: 'Como pedir ajuda', text: 'Com quem eu falo?' };
const ANALYZE_ACTION: AssistantNextAction = { type: 'run_analysis', label: 'Analisar minha situação' };

export const UNKNOWN_MESSAGE =
  'Não consegui entender exatamente o que você quer consultar. Você pode perguntar sobre suas disciplinas, atividades, avaliações, frequência ou recomendações.';
export const PREDICT_MESSAGE =
  'Não tenho informações suficientes para afirmar isso. Posso mostrar os dados acadêmicos disponíveis ou indicar com quem você pode confirmar essa situação.';

const OPEN_STATUSES = new Set(['pending', 'overdue']);

function subjectById(input: ResponderInput, subjectId: string | undefined): SubjectRef | undefined {
  return subjectId ? input.enrolled.find((subject) => subject.id === subjectId) : undefined;
}

function subjectNames(input: ResponderInput): string {
  return joinList(input.enrolled.map((subject) => subject.name));
}

/** Respostas quando a disciplina citada não pôde ser usada (não matriculada, inexistente ou ambígua). */
function subjectProblem(input: ResponderInput, intent: AssistantIntent): ResponderOutput | null {
  const { details, entities } = input.interpretation;
  const askFor = (subject: SubjectRef): AssistantNextAction => ({
    type: 'ask',
    label: subject.name,
    text:
      intent === 'get_subject_attendance'
        ? `Como estão minhas faltas em ${subject.name}?`
        : intent === 'get_next_assessment'
          ? `Qual é minha próxima prova de ${subject.name}?`
          : `Como eu estou em ${subject.name}?`,
  });
  if (details.ambiguousSubjectIds && details.ambiguousSubjectIds.length > 1) {
    const options = input.enrolled.filter((subject) => details.ambiguousSubjectIds?.includes(subject.id));
    return {
      status: 'needs_clarification',
      title: 'Qual disciplina?',
      message: `Encontrei mais de uma disciplina parecida: ${joinList(options.map((subject) => subject.name))}. Qual delas você quer consultar?`,
      speech: `Qual disciplina você quer consultar: ${joinList(options.map((subject) => subject.name))}?`,
      nextActions: options.map(askFor),
    };
  }
  if (details.subjectNotEnrolled || details.unmatchedSubject) {
    const name = entities.subjectName ?? `"${details.unmatchedSubject}"`;
    const available = input.enrolled.length > 0 ? ` Suas disciplinas são: ${subjectNames(input)}.` : '';
    return {
      status: 'not_found',
      title: 'Disciplina não encontrada',
      message: `Não encontrei ${name} entre as suas disciplinas ativas.${available}`,
      speech: `Não encontrei ${name} entre as suas disciplinas.`,
      nextActions: input.enrolled.slice(0, 4).map(askFor),
    };
  }
  return null;
}

// ---------------------------------------------------------------- conversa

const greeting: Responder = async (input) => {
  const name = firstName(input.userFullName);
  const hello = name ? `Olá, ${name}.` : 'Olá.';
  return {
    status: 'success',
    title: 'Olá!',
    message: `${hello} Posso consultar suas disciplinas, atividades, avaliações, frequência e recomendações. O que você quer saber?`,
    speech: `${hello} O que você quer saber sobre sua vida acadêmica?`,
    nextActions: SUGGESTIONS,
  };
};

const help: Responder = async () => ({
  status: 'success',
  title: 'O que posso fazer',
  message:
    'Posso consultar seus dados acadêmicos e pedir uma análise ao Agente para o Estudante. Eu não altero notas, frequência ou matrícula.',
  speech: 'Você pode perguntar sobre atividades pendentes, próximas provas, frequência, notas ou pedir uma análise da sua situação.',
  items: [
    { id: 'help-pending', title: 'Atividades pendentes', description: '"Tenho alguma coisa para entregar essa semana?"', meta: null, badge: null, tone: 'info', subjectId: null },
    { id: 'help-assessments', title: 'Avaliações e notas', description: '"Qual é minha próxima prova?" · "Qual foi minha última nota?"', meta: null, badge: null, tone: 'info', subjectId: null },
    { id: 'help-attendance', title: 'Frequência', description: '"Como estão minhas faltas em Banco de Dados?"', meta: null, badge: null, tone: 'info', subjectId: null },
    { id: 'help-analysis', title: 'Análise e recomendações', description: '"Tem alguma matéria que merece atenção?" · "Por que você recomendou isso?"', meta: null, badge: null, tone: 'info', subjectId: null },
  ],
  nextActions: SUGGESTIONS,
});

const unknown: Responder = async (input) => {
  if (input.interpretation.details.vagueReference) {
    return {
      status: 'needs_clarification',
      title: 'Pode reformular?',
      message:
        'Não consegui identificar a que você se refere. Diga, por exemplo, o nome da disciplina ou se quer saber sobre atividades, avaliações ou frequência.',
      speech: 'Não consegui identificar a que você se refere. Pode dizer de outro jeito?',
      nextActions: SUGGESTIONS,
    };
  }
  return {
    status: 'needs_clarification',
    title: 'Não entendi',
    message: UNKNOWN_MESSAGE,
    speech: UNKNOWN_MESSAGE,
    nextActions: SUGGESTIONS,
  };
};

const requestHumanHelp: Responder = async () => ({
  status: 'success',
  title: 'Com quem falar',
  message:
    'Para confirmar ou corrigir informações acadêmicas, procure a coordenação do seu curso. Dúvidas sobre conteúdo ou avaliações podem ser levadas ao professor da disciplina, e a Área do Sucesso Alvarista (ASA) também pode orientar você.',
  speech: 'Para confirmar ou corrigir informações acadêmicas, procure a coordenação do seu curso. O professor da disciplina e a equipe do ASA também podem orientar você.',
  items: [
    { id: 'help-coordination', title: 'Coordenação do curso', description: 'Correção ou confirmação de notas, frequência e matrícula.', meta: null, badge: 'Validação humana', tone: 'attention', subjectId: null },
    { id: 'help-professor', title: 'Professor da disciplina', description: 'Dúvidas sobre conteúdo, avaliações e registros de presença.', meta: null, badge: null, tone: 'info', subjectId: null },
    { id: 'help-asa', title: 'Área do Sucesso Alvarista (ASA)', description: 'Acolhimento e orientação sobre sua jornada acadêmica.', meta: null, badge: null, tone: 'info', subjectId: null },
  ],
  nextActions: [{ type: 'navigate', label: 'Ver meus dados acadêmicos', target: 'academic.subjects' }],
});

// ----------------------------------------------------------------- política

const predictOutcome: Responder = async () => ({
  status: 'abstained',
  title: 'Sem conclusão confiável',
  message: PREDICT_MESSAGE,
  speech: PREDICT_MESSAGE,
  abstained: true,
  abstentionReason: 'Não tenho informações suficientes para afirmar isso.',
  nextActions: [
    { type: 'navigate', label: 'Ver meus dados acadêmicos', target: 'academic.subjects' },
    HUMAN_HELP_ACTION,
    ANALYZE_ACTION,
  ],
});

const administrativeRequest: Responder = async (input) => {
  const target = input.interpretation.details.adminTarget ?? 'record';
  const byTarget = {
    attendance: {
      refusal: 'Eu não posso alterar sua frequência.',
      offer: 'Posso mostrar o registro disponível e orientar você a procurar o responsável para solicitar uma verificação.',
      action: { type: 'navigate', label: 'Ver frequência', target: 'academic.attendance' } as AssistantNextAction,
    },
    grade: {
      refusal: 'Eu não posso alterar suas notas.',
      offer: 'Posso mostrar as avaliações registradas e orientar você a procurar o responsável para solicitar uma verificação.',
      action: { type: 'navigate', label: 'Ver avaliações', target: 'academic.assessments' } as AssistantNextAction,
    },
    enrollment: {
      refusal: 'Eu não posso alterar sua matrícula.',
      offer: 'Posso mostrar suas disciplinas e orientar você sobre como solicitar essa mudança à coordenação.',
      action: { type: 'navigate', label: 'Ver disciplinas', target: 'academic.subjects' } as AssistantNextAction,
    },
    record: {
      refusal: 'Eu não posso alterar registros acadêmicos.',
      offer: 'Posso mostrar a informação disponível e orientar você sobre como solicitar uma verificação.',
      action: { type: 'navigate', label: 'Ver meus dados acadêmicos', target: 'academic.subjects' } as AssistantNextAction,
    },
  }[target];
  return {
    status: 'human_validation',
    title: 'Validação humana necessária',
    message: `${byTarget.refusal} ${byTarget.offer}`,
    speech: `${byTarget.refusal} Procure a coordenação do seu curso para solicitar uma verificação.`,
    requiresHumanValidation: true,
    items: [
      {
        id: 'human-validation',
        title: 'Quem pode verificar',
        description: 'A coordenação do curso analisa pedidos de correção de registros acadêmicos.',
        meta: null,
        badge: 'Validação humana',
        tone: 'attention',
        subjectId: null,
      },
    ],
    nextActions: [byTarget.action, HUMAN_HELP_ACTION],
  };
};

const accessOtherStudent: Responder = async (input) => {
  const injection = input.interpretation.details.policyReason === 'injection';
  input.logger.warn(
    { correlation_id: input.requestContext.correlationId, status: 'assistant_policy_refusal', policy_reason: input.interpretation.details.policyReason },
    'assistant request refused by policy',
  );
  const message = injection
    ? 'Não posso ignorar as regras de segurança do ASA Conecta. Consulto apenas os seus próprios dados acadêmicos.'
    : 'Por segurança, só posso consultar os seus próprios dados acadêmicos.';
  return {
    status: 'refused',
    title: 'Acesso não permitido',
    message: `${message} Posso mostrar suas disciplinas, atividades, avaliações ou frequência.`,
    speech: message,
    nextActions: SUGGESTIONS,
  };
};

// ----------------------------------------------------------------- controle

const repeatLast: Responder = async (input) =>
  input.context.lastIntent
    ? { status: 'success', title: 'Repetindo', message: 'Repetindo a última resposta.', speech: '', clientCommand: 'repeat_last' }
    : { status: 'needs_clarification', title: 'Nada para repetir', message: 'Ainda não há uma resposta anterior para repetir.', speech: 'Ainda não há uma resposta anterior para repetir.', nextActions: SUGGESTIONS };

const clarifyLast: Responder = async (input) =>
  input.context.lastIntent
    ? {
        status: 'success',
        title: 'Vou repetir',
        message: 'Sem problemas. Vou repetir a última resposta; você também pode perguntar de outro jeito.',
        speech: '',
        clientCommand: 'repeat_last',
        nextActions: SUGGESTIONS,
      }
    : unknown(input, {} as ResponderDeps);

const stopSpeaking: Responder = async () => ({
  status: 'success',
  title: 'Resposta interrompida',
  message: 'Resposta por voz interrompida.',
  speech: '',
  clientCommand: 'stop_speaking',
});

const goBack: Responder = async () => ({ status: 'success', title: 'Voltando', message: 'Voltando para o início.', speech: '', clientCommand: 'go_back' });

const SCREEN_NAMES: Record<string, string> = {
  home: 'o início',
  'academic.subjects': 'suas disciplinas',
  'academic.assessments': 'suas avaliações e notas',
  'academic.attendance': 'sua frequência',
  'academic.pending': 'suas pendências',
  assistant: 'o assistente',
  'assistant.analysis': 'a análise completa',
  services: 'os serviços',
  history: 'o histórico de análises',
  profile: 'seu perfil',
};

/** "Abra minhas notas" → o app navega; nenhum dado é alterado e a resposta é curta para a voz. */
const openScreen: Responder = async (input) => {
  const target = input.interpretation.entities.screen;
  if (!target || !(target in SCREEN_NAMES)) return unknown(input, {} as ResponderDeps);
  const name = SCREEN_NAMES[target] ?? 'a tela';
  const message = `Claro. Abrindo ${name}.`;
  return {
    status: 'success',
    title: 'Abrindo',
    message,
    speech: message,
    navigation: { target },
  };
};

// ----------------------------------------------------------------- consultas

const summary: Responder = async (input, deps) => {
  const data = await deps.students.getSummary(input.studentId);
  if (data.subjectsCount === 0 && data.pendingCount === 0 && data.averageScore === null && data.averageAttendanceRate === null) {
    return {
      status: 'empty',
      title: 'Resumo acadêmico',
      message: 'Não encontrei dados acadêmicos registrados para você.',
      speech: 'Não encontrei dados acadêmicos registrados para você.',
      nextActions: [HUMAN_HELP_ACTION],
    };
  }
  const parts = [`Você tem ${countLabel(data.subjectsCount, 'disciplina ativa', 'disciplinas ativas')}`, `${countLabel(data.pendingCount, 'pendência aberta', 'pendências abertas')}`];
  const spoken = [`Você tem ${spokenCount(data.subjectsCount, 'disciplina ativa', 'disciplinas ativas', true)}`, `${spokenCount(data.pendingCount, 'pendência aberta', 'pendências abertas', true)}`];
  if (data.averageScore !== null) parts.push(`média geral registrada de ${formatScore(data.averageScore)}`);
  if (data.averageAttendanceRate !== null) parts.push(`frequência média de ${formatPercent(data.averageAttendanceRate)}`);
  if (data.averageAttendanceRate !== null) spoken.push(`frequência média de ${formatPercent(data.averageAttendanceRate)}`);
  let message = `${joinList(parts)}.`;
  if (data.lastAnalysis) {
    message += ` Última análise do ASA: ${data.lastAnalysis.summary}`;
  }
  const items: AssistantDisplayItem[] = [
    { id: 'summary-subjects', title: 'Disciplinas ativas', description: String(data.subjectsCount), meta: null, badge: null, tone: 'neutral', subjectId: null },
    { id: 'summary-pending', title: 'Pendências abertas', description: String(data.pendingCount), meta: null, badge: data.pendingCount > 0 ? 'Revisar' : null, tone: data.pendingCount > 0 ? 'attention' : 'success', subjectId: null },
    { id: 'summary-score', title: 'Média geral', description: data.averageScore === null ? 'Sem notas registradas' : formatScore(data.averageScore), meta: null, badge: null, tone: 'neutral', subjectId: null },
    { id: 'summary-attendance', title: 'Frequência média', description: data.averageAttendanceRate === null ? 'Sem registros' : formatPercent(data.averageAttendanceRate), meta: null, badge: null, tone: 'neutral', subjectId: null },
  ];
  return {
    status: 'success',
    title: 'Resumo acadêmico',
    message,
    speech: `${joinList(spoken)}.`,
    items,
    nextActions: [
      { type: 'navigate', label: 'Ver área acadêmica', target: 'academic.subjects' },
      data.pendingCount > 0 ? { type: 'navigate', label: 'Ver pendências', target: 'academic.pending' } : ANALYZE_ACTION,
    ],
    contextPatch: data.lastAnalysis ? { lastRunId: data.lastAnalysis.runId } : {},
  };
};

function inPeriod(item: StudentPendingItem, period: string | undefined, today: string): boolean {
  if (!period) return true;
  if (period === 'overdue') return item.status === 'overdue' || (item.dueDate !== null && item.dueDate < today);
  if (!item.dueDate) return false;
  const weekEnd = endOfWeek(today);
  switch (period) {
    case 'today':
      return item.dueDate === today;
    case 'tomorrow':
      return item.dueDate === addDays(today, 1);
    case 'this_week':
      return item.dueDate >= today && item.dueDate <= weekEnd;
    case 'next_week':
      return item.dueDate > weekEnd && item.dueDate <= addDays(weekEnd, 7);
    default:
      return true;
  }
}

const PERIOD_PHRASE: Record<string, string> = {
  today: ' para hoje',
  tomorrow: ' para amanhã',
  this_week: ' nesta semana',
  next_week: ' na próxima semana',
  overdue: ' vencidas',
};

function pendingItem(item: StudentPendingItem, today: string): AssistantDisplayItem {
  const overdue = item.status === 'overdue' || (item.dueDate !== null && item.dueDate < today);
  const soon = !overdue && item.dueDate !== null && item.dueDate <= addDays(today, 7);
  return {
    id: item.id,
    title: item.description,
    description: item.subjectName ?? 'Sem disciplina vinculada',
    meta: item.dueDate ? `Prazo ${formatDayMonth(item.dueDate)} (${relativeDay(item.dueDate, today)})` : 'Sem prazo registrado',
    badge: overdue ? 'Vencida' : soon ? 'Prazo próximo' : 'Pendente',
    tone: overdue ? 'danger' : soon ? 'attention' : 'info',
    subjectId: item.subjectId,
  };
}

function dueSentence(item: StudentPendingItem, today: string): string {
  const where = item.subjectName ? ` de ${item.subjectName}` : '';
  if (!item.dueDate) return `${item.description}${where}, sem prazo registrado`;
  const relative = relativeDay(item.dueDate, today);
  return item.dueDate < today ? `${item.description}${where}, que venceu ${relative}` : `${item.description}${where}, que vence ${relative}`;
}

const pendingItems: Responder = async (input, deps) => {
  const problem = subjectProblem(input, 'get_pending_items');
  if (problem) return problem;
  const { period, subjectId } = input.interpretation.entities;
  const subject = subjectById(input, subjectId);
  const all = (await deps.students.listPendingItems(input.studentId)).filter((item) => OPEN_STATUSES.has(item.status));
  const scoped = subject ? all.filter((item) => item.subjectId === subject.id) : all;
  const selected = scoped
    .filter((item) => inPeriod(item, period, input.today))
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const where = subject ? ` em ${subject.name}` : '';
  const periodPhrase = period ? (PERIOD_PHRASE[period] ?? '') : '';
  const nav: AssistantNextAction[] = [{ type: 'navigate', label: 'Ver pendências', target: 'academic.pending' }];
  if (subject) nav.push({ type: 'navigate', label: `Ver ${subject.name}`, target: 'subject', params: { subjectId: subject.id } });

  if (selected.length === 0) {
    const noun = period === 'overdue' ? 'atividades vencidas' : `atividades pendentes${periodPhrase}`;
    let message = `Não encontrei ${noun}${where}.`;
    const nextOpen = scoped.filter((item) => item.dueDate && item.dueDate >= input.today).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))[0];
    if (period && nextOpen) message += ` A próxima pendência registrada é ${dueSentence(nextOpen, input.today)}.`;
    return {
      status: 'empty',
      title: 'Atividades pendentes',
      message,
      speech: message,
      items: nextOpen && period ? [pendingItem(nextOpen, input.today)] : [],
      nextActions: nav,
      contextPatch: subject ? { lastSubjectId: subject.id } : {},
    };
  }

  const first = selected[0]!;
  const noun = period === 'overdue' ? ['atividade vencida', 'atividades vencidas'] : ['atividade pendente', 'atividades pendentes'];
  const suffix = period === 'overdue' ? '' : periodPhrase;
  let message = `Você tem ${countLabel(selected.length, noun[0]!, noun[1]!)}${suffix}${where}.`;
  let speech = `Você tem ${spokenCount(selected.length, noun[0]!, noun[1]!, true)}${suffix}${where}.`;
  const closest = selected.length === 1 ? `É ${dueSentence(first, input.today)}.` : `A mais próxima é ${dueSentence(first, input.today)}.`;
  message += ` ${closest}`;
  speech += ` ${closest}`;
  if (!period) {
    const overdueCount = selected.filter((item) => item.status === 'overdue' || (item.dueDate !== null && item.dueDate < input.today)).length;
    if (overdueCount > 0 && overdueCount < selected.length) message += ` ${countLabel(overdueCount, 'delas está vencida', 'delas estão vencidas')}.`;
  }
  return {
    status: 'success',
    title: 'Atividades pendentes',
    message,
    speech: limitSpeech(speech),
    items: selected.map((item) => pendingItem(item, input.today)),
    nextActions: nav,
    contextPatch: subject ? { lastSubjectId: subject.id } : {},
  };
};

const subjects: Responder = async (input) => {
  if (input.enrolled.length === 0) {
    return { status: 'empty', title: 'Disciplinas', message: 'Não encontrei disciplinas ativas para você.', speech: 'Não encontrei disciplinas ativas para você.' };
  }
  return {
    status: 'success',
    title: 'Suas disciplinas',
    message: `Você está matriculado em ${countLabel(input.enrolled.length, 'disciplina', 'disciplinas')}: ${subjectNames(input)}.`,
    speech: `Você tem ${spokenCount(input.enrolled.length, 'disciplina ativa', 'disciplinas ativas', true)}: ${subjectNames(input)}.`,
    items: input.enrolled.map((subject) => ({ id: subject.id, title: subject.name, description: subject.code, meta: null, badge: null, tone: 'neutral' as const, subjectId: subject.id })),
    nextActions: [
      { type: 'navigate', label: 'Ver disciplinas', target: 'academic.subjects' },
      ...input.enrolled.slice(0, 2).map((subject): AssistantNextAction => ({ type: 'ask', label: `Como estou em ${subject.name}?`, text: `Como eu estou em ${subject.name}?` })),
    ],
  };
};

const subjectDetails: Responder = async (input, deps) => {
  const problem = subjectProblem(input, 'get_subject_details');
  if (problem) return problem;
  const subject = subjectById(input, input.interpretation.entities.subjectId);
  if (!subject) {
    return {
      status: 'needs_clarification',
      title: 'Qual disciplina?',
      message: input.enrolled.length > 0 ? `De qual disciplina você quer saber? Suas disciplinas são: ${subjectNames(input)}.` : 'Não encontrei disciplinas ativas para você.',
      speech: 'De qual disciplina você quer saber?',
      nextActions: input.enrolled.slice(0, 4).map((item): AssistantNextAction => ({ type: 'ask', label: item.name, text: `Como eu estou em ${item.name}?` })),
    };
  }
  const [stats, latest] = await Promise.all([deps.students.listSubjects(input.studentId), deps.agents.getLatest(input.studentId)]);
  const data = stats.find((item) => item.id === subject.id);
  if (!data) {
    return { status: 'not_found', title: subject.name, message: `Não encontrei dados de ${subject.name}.`, speech: `Não encontrei dados de ${subject.name}.` };
  }
  const facts: string[] = [];
  facts.push(data.averageScore === null ? 'ainda não há notas registradas' : `sua média registrada é ${formatScore(data.averageScore)}`);
  facts.push(data.attendanceRate === null ? 'não há registros de frequência' : `sua frequência é de ${formatPercent(data.attendanceRate)}`);
  facts.push(data.pendingCount === 0 ? 'não há pendências abertas' : `há ${countLabel(data.pendingCount, 'pendência aberta', 'pendências abertas')}`);
  let message = `Em ${subject.name}, ${joinList(facts)}.`;
  const speech = `Em ${subject.name}, ${joinList(facts)}.`;
  const related = (latest?.recommendations ?? []).filter((rec) => rec.subjectId === subject.id);
  if (related.length > 0) message += ' A última análise do ASA apontou um ponto de atenção nesta disciplina.';
  return {
    status: 'success',
    title: subject.name,
    message,
    speech: limitSpeech(related.length > 0 ? `${speech} A última análise apontou um ponto de atenção nesta disciplina.` : speech),
    items: [
      { id: `${subject.id}-score`, title: 'Média registrada', description: data.averageScore === null ? 'Sem notas' : formatScore(data.averageScore), meta: null, badge: null, tone: 'neutral', subjectId: subject.id },
      { id: `${subject.id}-attendance`, title: 'Frequência', description: data.attendanceRate === null ? 'Sem registros' : formatPercent(data.attendanceRate), meta: null, badge: null, tone: 'neutral', subjectId: subject.id },
      { id: `${subject.id}-pending`, title: 'Pendências abertas', description: String(data.pendingCount), meta: null, badge: data.pendingCount > 0 ? 'Revisar' : null, tone: data.pendingCount > 0 ? 'attention' : 'success', subjectId: subject.id },
    ],
    recommendations: related,
    nextActions: [
      { type: 'navigate', label: `Ver ${subject.name}`, target: 'subject', params: { subjectId: subject.id } },
      { type: 'ask', label: 'Ver faltas', text: `Como estão minhas faltas em ${subject.name}?` },
    ],
    contextPatch: { lastSubjectId: subject.id, ...(related[0] ? { lastRecommendationId: related[0].id } : {}) },
  };
};

const assessments: Responder = async (input, deps) => {
  const problem = subjectProblem(input, 'get_assessments');
  if (problem) return problem;
  const subject = subjectById(input, input.interpretation.entities.subjectId);
  const list = (await deps.students.listAssessments(input.studentId)).filter((item) => !subject || item.subjectId === subject.id);
  const where = subject ? ` em ${subject.name}` : '';
  if (list.length === 0) {
    const message = `Não encontrei avaliações registradas${where}.`;
    return { status: 'empty', title: 'Avaliações', message, speech: message, contextPatch: subject ? { lastSubjectId: subject.id } : {} };
  }
  const graded = list.filter((item) => item.score !== null && (item.appliedAt === null || item.appliedAt <= input.today));
  const latest = [...graded].sort((a, b) => (b.appliedAt ?? '').localeCompare(a.appliedAt ?? ''))[0];
  let message = `Encontrei ${countLabel(list.length, 'avaliação registrada', 'avaliações registradas')}${where}.`;
  if (latest) message += ` A nota mais recente é ${formatScore(latest.score!)} de ${formatScore(latest.maxScore)} em ${latest.title} de ${latest.subjectName}.`;
  else message += ' Ainda não há notas lançadas.';
  return {
    status: 'success',
    title: `Avaliações${where}`,
    message,
    speech: limitSpeech(message),
    items: list.map((item) => ({
      id: item.id,
      title: `${item.title} · ${item.subjectName}`,
      description: item.score === null ? 'Sem nota registrada' : `Nota ${formatScore(item.score)} de ${formatScore(item.maxScore)}`,
      meta: item.appliedAt ? `${assessmentTypeLabel(item.type)} · ${formatDayMonth(item.appliedAt)}` : assessmentTypeLabel(item.type),
      badge: item.score === null ? 'Sem nota' : null,
      tone: 'neutral' as const,
      subjectId: item.subjectId,
    })),
    nextActions: [{ type: 'navigate', label: 'Ver avaliações', target: 'academic.assessments' }],
    contextPatch: subject ? { lastSubjectId: subject.id } : {},
  };
};

const nextAssessment: Responder = async (input, deps) => {
  const problem = subjectProblem(input, 'get_next_assessment');
  if (problem) return problem;
  const subject = subjectById(input, input.interpretation.entities.subjectId);
  const wantsExam = input.interpretation.entities.assessmentType === 'exam';
  const upcoming = (await deps.students.listAssessments(input.studentId))
    .filter((item) => item.appliedAt !== null && item.appliedAt >= input.today && (!subject || item.subjectId === subject.id))
    .sort((a, b) => (a.appliedAt ?? '').localeCompare(b.appliedAt ?? ''));
  const where = subject ? ` de ${subject.name}` : '';
  const nav: AssistantNextAction[] = [{ type: 'navigate', label: 'Ver avaliações', target: 'academic.assessments' }];
  const describe = (item: (typeof upcoming)[number]) =>
    `${item.title} de ${item.subjectName}, em ${spokenDate(item.appliedAt!)} (${relativeDay(item.appliedAt!, input.today)})`;
  const asItem = (item: (typeof upcoming)[number]): AssistantDisplayItem => ({
    id: item.id,
    title: item.title,
    description: item.subjectName,
    meta: `${formatDayMonth(item.appliedAt!)} (${relativeDay(item.appliedAt!, input.today)})`,
    badge: assessmentTypeLabel(item.type),
    tone: 'info',
    subjectId: item.subjectId,
  });
  const exams = wantsExam ? upcoming.filter((item) => item.type === 'exam') : upcoming;
  const next = exams[0];
  if (next) {
    const label = wantsExam ? 'prova' : assessmentTypeLabel(next.type);
    const message = `Sua próxima ${label}${where} é ${describe(next)}.`;
    return { status: 'success', title: 'Próxima avaliação', message, speech: message, items: [asItem(next)], nextActions: nav, contextPatch: { lastSubjectId: next.subjectId } };
  }
  const other = upcoming[0];
  if (wantsExam && other) {
    const message = `Não encontrei provas futuras registradas${where}. A próxima avaliação registrada é o ${assessmentTypeLabel(other.type)} ${describe(other)}.`;
    return { status: 'empty', title: 'Próxima avaliação', message, speech: message, items: [asItem(other)], nextActions: nav };
  }
  const message = `Não encontrei avaliações futuras${where} nos dados disponíveis.`;
  return { status: 'empty', title: 'Próxima avaliação', message, speech: message, nextActions: nav };
};

const latestGrade: Responder = async (input, deps) => {
  const problem = subjectProblem(input, 'get_latest_grade');
  if (problem) return problem;
  const subject = subjectById(input, input.interpretation.entities.subjectId);
  const graded = (await deps.students.listAssessments(input.studentId))
    .filter((item) => item.score !== null && (item.appliedAt === null || item.appliedAt <= input.today) && (!subject || item.subjectId === subject.id))
    .sort((a, b) => (b.appliedAt ?? '').localeCompare(a.appliedAt ?? ''));
  const where = subject ? ` em ${subject.name}` : '';
  const latest = graded[0];
  if (!latest) {
    const message = `Não encontrei notas registradas${where}.`;
    return { status: 'empty', title: 'Última nota', message, speech: message };
  }
  const when = latest.appliedAt ? `, em ${spokenDate(latest.appliedAt)}` : '';
  const message = `Sua última nota registrada foi ${formatScore(latest.score!)} de ${formatScore(latest.maxScore)} em ${latest.title} de ${latest.subjectName}${when}.`;
  return {
    status: 'success',
    title: 'Última nota',
    message,
    speech: message,
    items: [{ id: latest.id, title: latest.title, description: latest.subjectName, meta: `Nota ${formatScore(latest.score!)} de ${formatScore(latest.maxScore)}`, badge: assessmentTypeLabel(latest.type), tone: 'neutral', subjectId: latest.subjectId }],
    nextActions: [{ type: 'navigate', label: 'Ver avaliações', target: 'academic.assessments' }],
    contextPatch: { lastSubjectId: latest.subjectId },
  };
};

const attendance: Responder = async (input, deps) => {
  const problem = subjectProblem(input, 'get_attendance');
  if (problem) return problem;
  const records = (await deps.students.listAttendance(input.studentId)).filter((item) => item.totalClasses > 0);
  if (records.length === 0) {
    return { status: 'empty', title: 'Frequência', message: 'Não encontrei registros de frequência.', speech: 'Não encontrei registros de frequência.' };
  }
  const total = records.reduce((sum, item) => sum + item.totalClasses, 0);
  const attended = records.reduce((sum, item) => sum + item.attendedClasses, 0);
  const sorted = [...records].sort((a, b) => (a.attendanceRate ?? 1) - (b.attendanceRate ?? 1));
  const lowest = sorted[0]!;
  let message = `Sua frequência geral registrada é de ${formatPercent(attended / total)}.`;
  if (records.length > 1) message += ` A menor é em ${lowest.subjectName}, com ${formatPercent(lowest.attendanceRate ?? 0)}.`;
  return {
    status: 'success',
    title: 'Frequência',
    message,
    speech: message,
    items: sorted.map((item) => ({
      id: `attendance-${item.subjectId}`,
      title: item.subjectName,
      description: `${formatPercent(item.attendanceRate ?? 0)} de frequência`,
      meta: `${item.attendedClasses} presenças em ${item.totalClasses} aulas`,
      badge: null,
      tone: 'neutral' as const,
      subjectId: item.subjectId,
    })),
    nextActions: [
      { type: 'navigate', label: 'Ver frequência', target: 'academic.attendance' },
      { type: 'ask', label: `Faltas em ${lowest.subjectName}`, text: `Como estão minhas faltas em ${lowest.subjectName}?` },
    ],
  };
};

const subjectAttendance: Responder = async (input, deps) => {
  const problem = subjectProblem(input, 'get_subject_attendance');
  if (problem) return problem;
  const subject = subjectById(input, input.interpretation.entities.subjectId);
  if (!subject) return attendance(input, deps);
  const record = (await deps.students.listAttendance(input.studentId)).find((item) => item.subjectId === subject.id);
  if (!record || record.totalClasses === 0) {
    const message = `Não encontrei registros de frequência em ${subject.name}.`;
    return { status: 'empty', title: `Frequência · ${subject.name}`, message, speech: message, contextPatch: { lastSubjectId: subject.id } };
  }
  const absences = record.totalClasses - record.attendedClasses;
  const absenceText = absences === 0 ? 'nenhuma falta' : countLabel(absences, 'falta', 'faltas');
  const message = `Sua frequência registrada em ${subject.name} é de ${formatPercent(record.attendanceRate ?? 0)}, com ${record.attendedClasses} presenças em ${record.totalClasses} aulas e ${absenceText}.`;
  return {
    status: 'success',
    title: `Frequência · ${subject.name}`,
    message,
    speech: `Sua frequência registrada em ${subject.name} é de ${formatPercent(record.attendanceRate ?? 0)}, com ${absences === 0 ? 'nenhuma falta' : spokenCount(absences, 'falta', 'faltas', true)}.`,
    items: [{ id: `attendance-${subject.id}`, title: subject.name, description: `${formatPercent(record.attendanceRate ?? 0)} de frequência`, meta: `${record.attendedClasses} presenças · ${absenceText}`, badge: null, tone: 'neutral', subjectId: subject.id }],
    nextActions: [
      { type: 'navigate', label: 'Ver frequência', target: 'academic.attendance' },
      { type: 'navigate', label: `Ver ${subject.name}`, target: 'subject', params: { subjectId: subject.id } },
    ],
    contextPatch: { lastSubjectId: subject.id },
  };
};

const history: Responder = async (input, deps) => {
  const runs = await deps.agents.listHistory(input.studentId, 5);
  if (runs.length === 0) {
    return { status: 'empty', title: 'Histórico de análises', message: 'Nenhuma análise registrada ainda.', speech: 'Nenhuma análise registrada ainda.', nextActions: [ANALYZE_ACTION] };
  }
  const statusLabel = { recommendation: 'Recomendação', no_action: 'Sem pontos de atenção', abstained: 'Abstenção' } as const;
  const latest = runs[0]!;
  const message = `Encontrei ${countLabel(runs.length, 'análise recente', 'análises recentes')}. A mais recente foi em ${formatDayMonth(latest.createdAt)}: ${latest.summary}`;
  return {
    status: 'success',
    title: 'Histórico de análises',
    message,
    speech: `A análise mais recente foi em ${spokenDate(latest.createdAt)}. ${latest.summary}`,
    items: runs.map((run) => ({
      id: run.runId,
      title: run.summary,
      description: `${countLabel(run.recommendationsCount, 'recomendação', 'recomendações')}`,
      meta: formatDayMonth(run.createdAt),
      badge: statusLabel[run.status],
      tone: run.abstained ? 'attention' : run.requiresHumanValidation ? 'attention' : 'neutral',
      subjectId: null,
    })),
    nextActions: [
      { type: 'navigate', label: 'Ver histórico', target: 'history' },
      { type: 'navigate', label: 'Ver análise mais recente', target: 'run', params: { runId: latest.runId } },
    ],
    contextPatch: { lastRunId: latest.runId },
  };
};

// -------------------------------------------------- análise (Agente para o Estudante)

function analysisOutput(analysis: AgentAnalysis, source: 'new' | 'latest', agentDurationMs: number | null): ResponderOutput {
  const recommendations = [...analysis.recommendations].sort((a, b) => a.priority - b.priority);
  const top = recommendations[0];
  const when = source === 'latest' ? `Na última análise, de ${formatDayMonth(analysis.createdAt)}, ` : '';
  const nextActions: AssistantNextAction[] = [{ type: 'navigate', label: 'Ver análise completa', target: 'run', params: { runId: analysis.runId } }];
  if (top?.subjectId) nextActions.push({ type: 'navigate', label: 'Ver disciplina', target: 'subject', params: { subjectId: top.subjectId } });
  const base = {
    recommendations,
    runId: analysis.runId,
    agentDurationMs,
    contextPatch: { lastRunId: analysis.runId, ...(top ? { lastRecommendationId: top.id, ...(top.subjectId ? { lastSubjectId: top.subjectId } : {}) } : {}) },
  };

  if (analysis.abstained || analysis.status === 'abstained') {
    return {
      ...base,
      status: 'abstained',
      title: 'Sem recomendação confiável',
      message: `${when}${when ? 'n' : 'N'}ão foi possível gerar uma recomendação confiável. ${analysis.abstentionReason ?? ''}`.trim(),
      speech: 'Não tenho informações suficientes para gerar uma recomendação confiável. Posso mostrar os dados acadêmicos disponíveis.',
      abstained: true,
      abstentionReason: analysis.abstentionReason,
      nextActions: [...nextActions, { type: 'navigate', label: 'Ver meus dados acadêmicos', target: 'academic.subjects' }, HUMAN_HELP_ACTION],
    };
  }
  if (analysis.status === 'no_action' || !top) {
    const message = `${when}${when ? 'o' : 'O'}s dados disponíveis não indicam situações que mereçam atenção no momento.`;
    return { ...base, status: 'success', title: 'Nenhum ponto de atenção', message, speech: message, nextActions };
  }
  const count = recommendations.length;
  const found = `${when}${when ? 'e' : 'E'}ncontrei ${count === 1 ? 'uma situação que merece' : `${countLabel(count, 'situação', 'situações')} que merecem`} sua atenção.`;
  const spokenFound = `Encontrei ${count === 1 ? 'uma situação que merece' : `${spokenCount(count, 'situação', 'situações', true)} que merecem`} sua atenção.`;
  const humanNote = analysis.requiresHumanValidation ? ' Essa situação precisa ser confirmada por uma pessoa responsável.' : '';
  if (analysis.requiresHumanValidation) nextActions.push(HUMAN_HELP_ACTION);
  return {
    ...base,
    status: analysis.requiresHumanValidation ? 'human_validation' : 'success',
    title: analysis.requiresHumanValidation ? 'Validação humana necessária' : 'Pontos de atenção',
    message: `${found} ${top.message}${humanNote}`,
    speech: limitSpeech(`${spokenFound} ${top.message}${humanNote} ${count > 1 ? 'Veja as demais na tela.' : 'Posso mostrar os detalhes.'}`),
    requiresHumanValidation: analysis.requiresHumanValidation,
    nextActions,
  };
}

const runAnalysis: Responder = async (input, deps) => {
  const startedAt = Date.now();
  const analysis = await deps.agents.analyze(input.studentId, input.requestContext, input.logger);
  return analysisOutput(analysis, 'new', Date.now() - startedAt);
};

const recommendations: Responder = async (input, deps) => {
  const latest = await deps.agents.getLatest(input.studentId);
  if (latest) return analysisOutput(latest, 'latest', null);
  return runAnalysis(input, deps);
};

async function targetRecommendation(input: ResponderInput, deps: ResponderDeps): Promise<{ rec: AgentRecommendation; runId: string } | null> {
  const id = input.context.lastRecommendationId;
  if (id) {
    try {
      const detail = await deps.agents.getRecommendation(input.studentId, id);
      return { rec: detail, runId: detail.runId };
    } catch (error) {
      if (!(error instanceof AppError) || (error.status !== 403 && error.status !== 404)) throw error;
      if (error.status === 403) {
        input.logger.warn({ correlation_id: input.requestContext.correlationId, status: 'assistant_context_rejected' }, 'conversation context referenced another student recommendation');
      }
    }
  }
  const latest = await deps.agents.getLatest(input.studentId);
  const top = latest ? [...latest.recommendations].sort((a, b) => a.priority - b.priority)[0] : undefined;
  return top && latest ? { rec: top, runId: latest.runId } : null;
}

const explainRecommendation: Responder = async (input, deps) => {
  const target = await targetRecommendation(input, deps);
  if (!target) {
    return {
      status: 'needs_clarification',
      title: 'Nenhuma recomendação',
      message: 'Ainda não há uma recomendação para explicar. Quer que eu analise sua situação acadêmica?',
      speech: 'Ainda não há uma recomendação para explicar. Quer que eu analise sua situação?',
      nextActions: [ANALYZE_ACTION],
    };
  }
  const { rec, runId } = target;
  const reasons = rec.evidence.slice(0, 2).map((line) => line.replace(/\.$/, ''));
  const message = `Essa recomendação aparece porque: ${rec.evidence.join(' ')}`;
  return {
    status: rec.requiresHumanValidation ? 'human_validation' : 'success',
    title: 'Por que estou vendo isso?',
    message,
    speech: limitSpeech(`Essa recomendação aparece porque ${joinList(reasons.map((reason) => reason.charAt(0).toLowerCase() + reason.slice(1)))}.`),
    items: rec.evidence.map((line, index) => ({ id: `${rec.id}-evidence-${index + 1}`, title: line, description: null, meta: null, badge: 'Evidência', tone: 'info' as const, subjectId: rec.subjectId })),
    recommendations: [rec],
    requiresHumanValidation: rec.requiresHumanValidation,
    runId,
    nextActions: [
      { type: 'navigate', label: 'Ver recomendação', target: 'recommendation', params: { recommendationId: rec.id } },
      ...(rec.subjectId ? [{ type: 'navigate', label: 'Ver disciplina', target: 'subject', params: { subjectId: rec.subjectId } } as AssistantNextAction] : []),
    ],
    contextPatch: { lastRecommendationId: rec.id, lastRunId: runId, ...(rec.subjectId ? { lastSubjectId: rec.subjectId } : {}) },
  };
};

const nextAction: Responder = async (input, deps) => {
  const latest = await deps.agents.getLatest(input.studentId);
  if (!latest) {
    return {
      status: 'needs_clarification',
      title: 'Próxima ação',
      message: 'Ainda não há uma análise para sugerir a próxima ação. Quer que eu analise sua situação acadêmica?',
      speech: 'Ainda não há uma análise para sugerir a próxima ação. Quer que eu analise sua situação?',
      nextActions: [ANALYZE_ACTION, { type: 'ask', label: 'Tenho atividade pendente?', text: 'Tenho alguma atividade pendente?' }],
    };
  }
  const top = [...latest.recommendations].filter((rec) => rec.nextAction).sort((a, b) => a.priority - b.priority)[0];
  if (latest.abstained || !top) {
    const output = analysisOutput(latest, 'latest', null);
    return { ...output, title: 'Próxima ação' };
  }
  const message = `A próxima ação sugerida é: ${top.nextAction} Motivo: ${top.message}`;
  return {
    status: top.requiresHumanValidation ? 'human_validation' : 'success',
    title: 'Próxima ação',
    message,
    speech: limitSpeech(`A próxima ação sugerida é: ${top.nextAction}`),
    recommendations: [top],
    requiresHumanValidation: top.requiresHumanValidation,
    runId: latest.runId,
    nextActions: [
      { type: 'navigate', label: 'Ver recomendação', target: 'recommendation', params: { recommendationId: top.id } },
      { type: 'ask', label: 'Por que?', text: 'Por que você está me recomendando isso?' },
    ],
    contextPatch: { lastRecommendationId: top.id, lastRunId: latest.runId, ...(top.subjectId ? { lastSubjectId: top.subjectId } : {}) },
  };
};

export const RESPONDERS: Record<AssistantIntent, Responder> = {
  greeting,
  help,
  unknown,
  request_human_help: requestHumanHelp,
  get_student_summary: summary,
  get_pending_items: pendingItems,
  get_subjects: subjects,
  get_subject_details: subjectDetails,
  get_assessments: assessments,
  get_next_assessment: nextAssessment,
  get_latest_grade: latestGrade,
  get_attendance: attendance,
  get_subject_attendance: subjectAttendance,
  get_agent_history: history,
  run_student_analysis: runAnalysis,
  get_recommendations: recommendations,
  explain_recommendation: explainRecommendation,
  get_next_action: nextAction,
  predict_outcome: predictOutcome,
  administrative_request: administrativeRequest,
  access_other_student: accessOtherStudent,
  repeat_last: repeatLast,
  stop_speaking: stopSpeaking,
  go_back: goBack,
  clarify_last: clarifyLast,
  open_screen: openScreen,
};
