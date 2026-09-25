import type { AssistantScreenContext } from '../types/api';
import type { AcademicSegment, DetailRoute, TabKey } from '../types/ui';

export type { AcademicSegment, DetailRoute, TabKey };

/** Identificador da tela visível — o mesmo vocabulário do contrato (`AssistantScreenContext`). */
export type ScreenKey = AssistantScreenContext;

export const TAB_LABELS: Record<TabKey, string> = {
  home: 'Início',
  academic: 'Acadêmico',
  assistant: 'Assistente',
  services: 'Serviços',
  profile: 'Perfil',
};

export const SCREEN_LABELS: Record<ScreenKey, string> = {
  home: 'Início',
  'academic.subjects': 'Disciplinas',
  'academic.assessments': 'Avaliações e notas',
  'academic.attendance': 'Frequência',
  'academic.pending': 'Pendências',
  assistant: 'Assistente',
  services: 'Serviços',
  history: 'Histórico de análises',
  profile: 'Perfil',
  recommendation: 'Recomendação',
  run: 'Detalhe da análise',
};
