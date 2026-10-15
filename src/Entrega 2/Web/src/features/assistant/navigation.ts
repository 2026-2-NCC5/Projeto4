import type { AssistantNavigationParams, AssistantNavigationTarget } from '@/types/api';

const enc = encodeURIComponent;

/** Nome da página de destino, para o botão "Ir para …" de uma navegação pedida ("abra minhas notas"). */
export const TARGET_LABELS: Record<AssistantNavigationTarget, string> = {
  home: 'Início',
  'academic.subjects': 'Disciplinas',
  'academic.assessments': 'Avaliações e notas',
  'academic.attendance': 'Frequência',
  'academic.pending': 'Pendências',
  assistant: 'Assistente ASA',
  'assistant.analysis': 'Agente para o Estudante',
  services: 'Meus chamados',
  history: 'Histórico de análises',
  profile: 'Perfil e segurança',
  subject: 'Disciplina',
  recommendation: 'Recomendação',
  run: 'Análise do agente',
  queue: 'Fila presencial do ASA',
};

/**
 * Página do portal para cada destino da allow-list do assistente. O assistente nunca navega sozinho: o portal
 * mostra um link e a pessoa decide. `null` = destino que só existe no aplicativo (fila presencial).
 */
export function assistantHref(target: AssistantNavigationTarget, params: AssistantNavigationParams = {}): string | null {
  switch (target) {
    case 'home':
      return '/aluno';
    case 'academic.subjects':
      return '/aluno/academico';
    case 'academic.assessments':
      return '/aluno/academico?aba=avaliacoes';
    case 'academic.attendance':
      return '/aluno/academico?aba=frequencia';
    case 'academic.pending':
      return '/aluno/pendencias';
    case 'assistant':
      return '/aluno/assistente';
    case 'assistant.analysis':
    case 'history':
      return '/aluno/academico?aba=analise';
    case 'services':
      return '/aluno/chamados';
    case 'profile':
      return '/aluno/perfil';
    case 'subject':
      return params.subjectId ? `/aluno/academico?disciplina=${enc(params.subjectId)}` : '/aluno/academico';
    case 'recommendation':
      return params.recommendationId ? `/aluno/academico?aba=analise&recomendacao=${enc(params.recommendationId)}` : '/aluno/academico?aba=analise';
    case 'run':
      return params.runId ? `/aluno/academico?aba=analise&analise=${enc(params.runId)}` : '/aluno/academico?aba=analise';
    default:
      return null;
  }
}
