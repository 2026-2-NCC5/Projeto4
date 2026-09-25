import type { AssessmentType, AssistantEntities, AssistantIntent, AssistantNavigationTarget, AssistantPeriod, AssistantScreenContext } from '../contracts/mobileApi.v1.js';
import { SUBJECT_FOLLOW_UP } from './intents.js';
import type { AdminTarget, InterpretationDetails, IntentInterpreter, InterpreterInput } from './interpretation.js';
import { matchSubjects, subjectVocabulary, type SubjectRef } from './subjects.js';
import { ACADEMIC_VOCABULARY, normalizeText, stripWakeWord, tokenize } from './text.js';

/**
 * Interpretador determinístico de linguagem natural (pt-BR).
 *
 * Não usa provedor externo: regras + normalização + extração de entidades.
 * A confiança é a força da regra que casou (documentada em documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/architecture/voice-assistant.md).
 * A saída é tratada como não confiável e validada por validateInterpretation().
 */

// ------------------------------------------------------------------ política

const INJECTION =
  /\b(ignor\w* (\w+ ){0,3}(regras?|instruc(ao|oes)|restric(ao|oes)|politicas?|permiss(ao|oes)|limites?|seguranca)|esquec\w* (\w+ ){0,3}(regras?|instruc(ao|oes))|modo (admin\w*|administrador|desenvolvedor|dev|debug|root|deus)|sem (restric(ao|oes)|limites|regras)|finja que|aja como (se|um|uma|o|a)|voce agora e|a partir de agora voce|burl\w*|hacke?\w*|bypass|jailbreak|system prompt|prompt do sistema|(sou|eu sou) (o |a )?(coordenador\w*|administrador\w*|admin|professor\w*|reitor\w*|diretor\w*))\b/;

const THIRD_PARTY =
  /\b(outr[oa]s? (alun[oa]s?|estudantes?|pessoas?|usuari[oa]s?|colegas?|matriculas?|contas?)|(meu|minha|meus|minhas) (colegas?|amig[oa]s?|namorad[oa]s?|irma[os]?|prim[oa]s?|filh[oa]s?|vizinh[oa]s?|mae|pai)|(de|dos) todos os alunos|da turma (toda|inteira)|de toda a turma|de qualquer (aluno|aluna|pessoa|estudante)|de (alguem|outra pessoa|outro estudante)|qualquer (aluno|estudante) que)\b/;

const DATA_NOUNS =
  '(?:notas?|frequencias?|faltas?|dados|boletim|situac(?:ao|oes)|matriculas?|pendencias?|informac(?:ao|oes)|historico|medias?|provas?|avaliac(?:ao|oes)|desempenho|recomendac(?:ao|oes)|atividades?|cadastro|perfil|registros?|analises?)';
const PRONOUN_OWNER = new RegExp(`\\b${DATA_NOUNS} (dele|dela|deles|delas)\\b`);
const POSSESSIVE = new RegExp(`\\b${DATA_NOUNS} d[oa]s? ([a-z0-9]+)`, 'g');

// ------------------------------------------------------ pedidos administrativos

const ADMIN_VERB =
  /\b(alter(a|ar|e|em)|corrig(e|ir|em)|corrij(a|am)|mud(a|ar|e)|troc(a|ar)|troque|apag(a|ar)|apague|remov(e|er|a)|exclu(i|ir|a)|cancel(a|ar|e)|tranc(a|ar)|tranque|aument(a|ar|e)|abon(a|ar|e)|lanc(a|ar|e)|edit(a|ar|e)|arrum(a|ar|e)|consert(a|ar|e)|zer(a|ar|e)|tir(a|ar|e)|coloc(a|ar)|coloque|registr(a|ar|e)|inclu(i|ir|a)|adicion(a|ar|e)|justific(a|ar)|justifique|me matricul\w*|matricul(ar|e)|desmatricul\w*|me (aprov|reprov)(a|e))\b/;
const ADMIN_OBJECT =
  /\b(notas?|frequencias?|faltas?|presencas?|matriculas?|registros?|historico( escolar)?|boletim|medias?|disciplinas?|materias?|dp)\b/;
const DISPUTE =
  /\b((esta|estao|ta|tao) (errad[oa]s?|incorret[oa]s?|equivocad[oa]s?)|erro (n[ao]s?|em) (minha|meu|minhas|meus)|nao (confere|conferem|bate|batem))\b/;

// ------------------------------------------------------------ navegação por voz

/** "abre/mostra/vai para/leva pra" + destino → intenção open_screen (o app navega; nenhum dado muda). */
const OPEN_VERB = /^(?:(?:por favor|asa|ok)[ ,]+)?(?:abr(?:e|a|ir)|mostr(?:a|e|ar)|me mostr(?:a|e)|me lev(?:a|e)|lev(?:a|e) (?:me )?(?:pra|para|ao|a|no|na)|v(?:ai|a) (?:pra|para|ao|a|no|na)|ir (?:pra|para|ao|a)|acess(?:a|e|ar)|quero (?:ver|abrir)|ver)\b/;
const OPEN_TARGETS: Array<[RegExp, AssistantNavigationTarget]> = [
  [/\b(historico( de analises)?|analises (anteriores|passadas)|ultimas analises)\b/, 'history'],
  [/\b(recomendac(ao|oes)|analise (completa|do agente)|analisar)\b/, 'assistant.analysis'],
  [/\b(notas?|boletim|avaliac(ao|oes)|provas?|medias?)\b/, 'academic.assessments'],
  [/\b(frequencias?|faltas?|presencas?)\b/, 'academic.attendance'],
  [/\b(pendencias?|pendentes?|atividades?|tarefas?|entregas?)\b/, 'academic.pending'],
  [/\b(disciplinas?|materias?|area academica|academico|horarios?|grade)\b/, 'academic.subjects'],
  [/\b(perfil|minha conta|configurac(ao|oes)|ajustes)\b/, 'profile'],
  [/\b(servicos?|atendimento|secretaria|financeiro|documentos?)\b/, 'services'],
  [/\b(inicio|home|tela inicial|pagina inicial)\b/, 'home'],
  [/\b(assistente|conversa|chat)\b/, 'assistant'],
];

/** Tela atual → intenção padrão para perguntas curtas/ambíguas ("e a menor?", "e essa?"). */
const SCREEN_DEFAULT_INTENT: Partial<Record<AssistantScreenContext, AssistantIntent>> = {
  'academic.assessments': 'get_assessments',
  'academic.attendance': 'get_attendance',
  'academic.pending': 'get_pending_items',
  'academic.subjects': 'get_subjects',
  history: 'get_agent_history',
  recommendation: 'explain_recommendation',
  run: 'get_recommendations',
};

// ------------------------------------------------------------ controle de voz

const CONTROL_STOP =
  /^(pode )?(para|pare|parar|chega|silencio|cala a boca|fica quiet[oa]|stop|para de falar|pare de falar|para de ler|pare de ler|nao fala mais|nao precisa falar)( por favor)?$/;
const CONTROL_REPEAT =
  /^(pode )?(repete|repita|repetir|fala de novo|diz de novo|fala novamente|de novo|o que voce disse|repete (isso|a resposta)|repita (isso|a resposta))( por favor)?$/;
const CONTROL_BACK = /^(volta|voltar|volte|sair|fechar|voltar (ao|para o|pro) inicio|volta (ao|para o|pro) inicio)( por favor)?$/;
const CONTROL_CLARIFY = /^(nao entendi( nada)?|como assim|hein|nao compreendi|explica de novo)( por favor)?$/;

// --------------------------------------------------------------- conversação

const GREETING =
  /^((oi|ola|ei|hey|e ai|alo|opa|bom dia|boa tarde|boa noite|tudo bem)( (asa|assistente))?( tudo bem)?|asa|assistente)$/;
const HELP =
  /\b(o que (voce )?(pode|sabe|consegue) fazer|como (voce )?funciona|como (te )?uso|o que (eu )?posso perguntar|quais perguntas|comandos)\b|^(ajuda|me ajuda|help)$/;
const PREDICT =
  /\b((vou|irei|vai|sera que (eu )?vou|to|estou|posso|corro risco de|risco de|chance de|chances de) (ser )?(reprovar|reprovad[oa]|passar|aprovad[oa]|ficar de dp|pegar dp|rodar|bombar|ficar reprovad[oa])|passo (de ano|de semestre|na materia|nessa materia|nessa disciplina))\b/;

// ---------------------------------------------------------------- consultas

const ATTENDANCE = /\b(frequencias?|faltas?|faltei|faltado|presencas?|ausencias?)\b/;
const PENDING =
  /\b(pendencias?|pendentes?|atrasad[oa]s?|atraso|entregar|entregas?|atividades?|tarefas?|a fazer|pra fazer|para fazer|prazos?|vencid[oa]s?|vence|vencem|deveres|lista de exercicios?|tenho que (fazer|entregar)|tenho (pra|para) (fazer|entregar))\b/;
const EXAM = /\b(provas?|exames?|avaliac(ao|oes)|p1|p2|p3|testes?)\b/;
const GRADE = /\b(notas?|medias?|boletim|tirei|pontuac(ao|oes))\b/;
const NEXT = /\b(proxim[oa]s?|quando (e|sera|vai ser|cai|tenho)|que dia|qual (e )?o dia|data d[aeo])\b/;
const LAST = /\b(ultim[oa]s?|mais recente)\b/;
const SUBJECTS_WORD = /\b(disciplinas?|materias?|cadeiras?|matriculad[oa]|cursando)\b/;
const SUMMARY =
  /\b(como (eu )?(estou|to|ta|vou|ando)( indo)?|como (esta|anda|vai) (minha|a minha) (situacao|vida academica|faculdade)|minha situacao|situacao academica|resumo|panorama|visao geral|como vai a faculdade)\b/;
const ATTENTION =
  /\b(preocupar|preocupacao|preocupad[oa]|prestar (mais )?atencao|merece[m]? (minha |mais )?atencao|atencao|riscos?|alertas?|cuidado|algum problema|algo errado|dificuldades?|melhorar)\b/;
const ANALYZE = /\b(analis(e|a|ar|ando)|avali(e|a|ar) (a )?minha situacao|faz(er)? uma analise|nova analise)\b/;
const RECOMMENDATIONS = /\b(recomendac(ao|oes)|recomenda|recomendou|recomendando|dicas?|sugest(ao|oes)|sugere|orientac(ao|oes)|conselhos?)\b/;
const WHY = /\b(por que|porque|pq|por qual motivo|qual (e )?(o )?motivo|explica|explique|justifica|de onde (vem|veio)|baseado em que|evidencias?)\b/;
const WHY_TARGET = /\b(isso|essa|esse|essas|esses|recomend\w*|sugest\w*|alerta\w*)\b/;
const NEXT_ACTION =
  /\b(o que (eu )?(faco|devo fazer|preciso fazer|faco agora|posso fazer)|qual (e )?(o )?proximo passo|proxim[oa] (passo|acao)|por onde (eu )?comeco|o que (devo )?priorizar|devo priorizar|minhas prioridades)\b/;
const HISTORY = /\b(historico( de analises)?|analises (anteriores|passadas|antigas)|ultimas analises|analises que (voce )?fez|ja analisou)\b/;
const HUMAN =
  /\b(falar com (alguem|uma pessoa|um humano|humano|atendente|a coordenacao|o coordenador|a coordenadora|coordenacao|o professor|a professora|professor|professora|a secretaria|secretaria)|preciso de ajuda|quero ajuda|ajuda humana|atendimento humano|com quem (eu )?(falo|posso falar|devo falar|procuro|converso)|quem (eu )?procuro|procurar a coordenacao)\b/;
const VAGUE = /\b(aquilo|aquela coisa|aquele negocio|o negocio|a coisa|isso ai|aquele assunto)\b/;
const SUBJECT_PRONOUN = /\b(nela|nessa (materia|disciplina)|dessa (materia|disciplina)|nesta (materia|disciplina)|desta (materia|disciplina)|mesma (materia|disciplina))\b/;
const FOLLOW_UP_PREFIX = /^e (em |na |no |de |da |do |sobre |a |o |as |os |pra |para )?/;
const UNMATCHED_SUBJECT = /\b(?:em|na disciplina de|na materia de|na disciplina|na materia|nas aulas de)\s+([a-z0-9]+(?:\s+[a-z0-9]+){0,3})$/;
const GENERIC_AFTER_PREPOSITION = new Set([
  'dia', 'geral', 'atraso', 'aberto', 'andamento', 'risco', 'relacao', 'casa', 'sala', 'media', 'todas', 'cada', 'alguma',
  'nenhuma', 'essa', 'esta', 'nessa', 'semana', 'hoje', 'minha', 'meu', 'minhas', 'meus', 'alguma', 'ordem', 'breve', 'aula', 'aulas',
]);

function extractPeriod(q: string): AssistantPeriod | undefined {
  if (/\b(atrasad[oa]s?|atraso|vencid[oa]s?|venceu|venceram|passou do prazo|fora do prazo)\b/.test(q)) return 'overdue';
  if (/\bhoje\b/.test(q)) return 'today';
  if (/\bamanha\b/.test(q)) return 'tomorrow';
  if (/\b(proxima semana|semana que vem)\b/.test(q)) return 'next_week';
  if (/\b((essa|esta|nessa|nesta|dessa|desta) semana|semana atual|ate (o )?(fim|final) da semana|ate (domingo|sexta))\b/.test(q)) return 'this_week';
  return undefined;
}

function extractAssessmentType(q: string): AssessmentType | undefined {
  if (/\b(provas?|exames?|p1|p2|p3)\b/.test(q)) return 'exam';
  if (/\b(trabalhos?|entregas?)\b/.test(q)) return 'assignment';
  if (/\bprojetos?\b/.test(q)) return 'project';
  return undefined;
}

function adminTarget(q: string): AdminTarget {
  if (/\b(frequencias?|faltas?|presencas?)\b/.test(q)) return 'attendance';
  if (/\b(notas?|medias?|boletim)\b/.test(q)) return 'grade';
  if (/\b(matricul\w*|disciplinas?|materias?|tranc\w*|dp)\b/.test(q)) return 'enrollment';
  return 'record';
}

function refersToAnotherPerson(q: string, subjects: SubjectRef[]): boolean {
  if (THIRD_PARTY.test(q) || PRONOUN_OWNER.test(q)) return true;
  const vocabulary = subjectVocabulary(subjects);
  for (const match of q.matchAll(POSSESSIVE)) {
    const word = match[1] ?? '';
    if (ACADEMIC_VOCABULARY.has(word) || vocabulary.has(word)) continue;
    if ([...vocabulary].some((token) => token.length >= 5 && word.length >= 5 && (token.startsWith(word) || word.startsWith(token)))) continue;
    return true; // "notas do joao", "frequencia da maria"
  }
  return false;
}

interface Candidate {
  intent: AssistantIntent;
  score: number;
}

export class RuleBasedIntentInterpreter implements IntentInterpreter {
  readonly name = 'rules-ptbr-v1';

  interpret(input: InterpreterInput) {
    const normalized = normalizeText(input.text);
    const entities: AssistantEntities = {};
    const details: InterpretationDetails = {};
    const result = (intent: AssistantIntent, confidence: number) => ({ intent, confidence, entities, details });

    if (normalized.length === 0) return result('unknown', 0);
    if (GREETING.test(normalized)) return result('greeting', 0.95);

    const q = stripWakeWord(normalized);

    // 1. Política: identidade e autorização nunca mudam por linguagem natural.
    if (INJECTION.test(q)) {
      details.policyReason = 'injection';
      return result('access_other_student', 0.97);
    }
    if (refersToAnotherPerson(q, input.subjects)) {
      details.policyReason = 'third_party';
      return result('access_other_student', 0.95);
    }

    // 2. Pedidos administrativos nunca são executados.
    if ((ADMIN_VERB.test(q) || DISPUTE.test(q)) && ADMIN_OBJECT.test(q)) {
      details.adminTarget = adminTarget(q);
      return result('administrative_request', 0.92);
    }

    // 3. Comandos de controle da voz (frases curtas e ancoradas) e navegação ("abra minhas notas").
    if (OPEN_VERB.test(q) && !refersToAnotherPerson(q, input.subjects)) {
      const target = OPEN_TARGETS.find(([pattern]) => pattern.test(q))?.[1];
      // "mostra minhas notas" continua sendo consulta (resposta com dados); só "abre/vai para" navega.
      const navigational = /^(?:(?:por favor|asa|ok)[ ,]+)?(?:abr|me lev|lev|v(?:ai|a) |ir |acess|quero abrir)/.test(q);
      if (target && navigational) {
        entities.screen = target;
        return result('open_screen', 0.9);
      }
    }
    if (CONTROL_STOP.test(q)) return result('stop_speaking', 0.95);
    if (CONTROL_REPEAT.test(q)) return result('repeat_last', 0.95);
    if (CONTROL_BACK.test(q)) return result('go_back', 0.9);
    if (CONTROL_CLARIFY.test(q)) return result('clarify_last', 0.9);

    // 4. Previsões sobre aprovação/reprovação → abstenção.
    if (PREDICT.test(q)) return result('predict_outcome', 0.9);

    // 5. Entidades.
    const period = extractPeriod(q);
    if (period) entities.period = period;
    const assessmentType = extractAssessmentType(q);
    if (assessmentType) entities.assessmentType = assessmentType;

    const matches = matchSubjects(q, input.subjects);
    const best = matches[0];
    if (best) {
      const tied = matches.filter((match) => match.score === best.score && match.subject.enrolled);
      if (tied.length > 1) {
        details.ambiguousSubjectIds = tied.map((match) => match.subject.id);
      } else if (best.subject.enrolled) {
        entities.subjectId = best.subject.id;
        entities.subjectName = best.subject.name;
      } else {
        entities.subjectName = best.subject.name;
        details.subjectNotEnrolled = true;
      }
    } else if (SUBJECT_PRONOUN.test(q) && input.context.lastSubjectId) {
      const previous = input.subjects.find((subject) => subject.id === input.context.lastSubjectId && subject.enrolled);
      if (previous) {
        entities.subjectId = previous.id;
        entities.subjectName = previous.name;
      }
    }
    const hasSubject = Boolean(entities.subjectId || entities.subjectName || details.ambiguousSubjectIds);

    // 6. Pontuação por regras.
    const candidates: Candidate[] = [];
    const add = (intent: AssistantIntent, score: number) => candidates.push({ intent, score });

    if (WHY.test(q) && WHY_TARGET.test(q)) add('explain_recommendation', 0.9);
    if (ANALYZE.test(q)) add('run_student_analysis', 0.93);
    if (ATTENTION.test(q)) add('run_student_analysis', SUBJECTS_WORD.test(q) ? 0.9 : 0.86);
    if (NEXT_ACTION.test(q)) add('get_next_action', 0.87);
    if (HISTORY.test(q)) add('get_agent_history', 0.9);
    if (RECOMMENDATIONS.test(q)) add('get_recommendations', 0.88);
    if (ATTENDANCE.test(q)) add(hasSubject ? 'get_subject_attendance' : 'get_attendance', hasSubject ? 0.92 : 0.88);
    if (PENDING.test(q)) add('get_pending_items', period ? 0.92 : 0.88);
    if (EXAM.test(q) && NEXT.test(q)) add('get_next_assessment', 0.92);
    if ((GRADE.test(q) || EXAM.test(q)) && LAST.test(q)) add('get_latest_grade', 0.9);
    if (/\bmedias?\b/.test(q) && hasSubject) add('get_subject_details', 0.87);
    if (GRADE.test(q)) add('get_assessments', 0.85);
    if (EXAM.test(q)) add('get_assessments', 0.84);
    if (SUMMARY.test(q)) add(hasSubject ? 'get_subject_details' : 'get_student_summary', hasSubject ? 0.9 : 0.88);
    if (SUBJECTS_WORD.test(q)) add(hasSubject ? 'get_subject_details' : 'get_subjects', 0.82);
    if (HUMAN.test(q)) add('request_human_help', 0.87);
    if (HELP.test(q)) add('help', 0.8);

    const top = candidates.reduce<Candidate | null>((acc, item) => (acc && acc.score >= item.score ? acc : item), null);

    // 7. Continuação de conversa: "E em Estruturas de Dados?" / "E na próxima semana?"
    const isShortFollowUp = FOLLOW_UP_PREFIX.test(q) || tokenize(q).length <= 4;
    const lastIntent = input.context.lastIntent;
    if (!top && isShortFollowUp && lastIntent) {
      const followUp = SUBJECT_FOLLOW_UP[lastIntent];
      if (followUp && hasSubject) {
        details.followUp = true;
        return result(followUp, 0.85);
      }
      if (lastIntent === 'get_pending_items' && period) {
        details.followUp = true;
        return result('get_pending_items', 0.85);
      }
    }

    if (!top) {
      if (hasSubject && !VAGUE.test(q)) return result('get_subject_details', 0.75);
      // Contexto da tela: "qual foi a menor?" na tela de notas → avaliações; "e essa?" na frequência → frequência.
      const screenIntent = input.currentScreen ? SCREEN_DEFAULT_INTENT[input.currentScreen] : undefined;
      if (screenIntent && isShortFollowUp && !VAGUE.test(q) && /\b(menor|maior|melhor|pior|essa|esse|essas|esses|isso|aqui|ultima|ultimo|proxima|proximo|qual|quais|quantas?|quantos?|e ai|entao)\b/.test(q)) {
        details.followUp = true;
        return result(screenIntent, 0.8);
      }
      if (VAGUE.test(q)) details.vagueReference = true;
      return result('unknown', VAGUE.test(q) ? 0.2 : 0.3);
    }

    // Disciplina citada mas não encontrada ("faltas em Cálculo").
    if (!hasSubject && ['get_subject_details', 'get_attendance', 'get_assessments', 'get_latest_grade', 'get_next_assessment', 'get_pending_items'].includes(top.intent)) {
      const unmatched = UNMATCHED_SUBJECT.exec(q)?.[1];
      const first = unmatched?.split(' ')[0] ?? '';
      if (unmatched && !GENERIC_AFTER_PREPOSITION.has(first) && !ACADEMIC_VOCABULARY.has(first) && extractPeriod(unmatched) === undefined) {
        details.unmatchedSubject = unmatched;
      }
    }
    return result(top.intent, top.score);
  }
}
