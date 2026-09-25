import type { ApiClientError } from '../services/apiClient';

/** Abas da área autenticada (Início · Acadêmico · Assistente · Serviços · Perfil). */
export type TabKey = 'home' | 'academic' | 'assistant' | 'services' | 'profile';

/** Rotas de detalhe sobrepostas às abas (navegação local, sem react-navigation). */
export type DetailRoute =
  | { screen: 'recommendation'; id: string }
  | { screen: 'run'; runId: string }
  | { screen: 'history' };

export type AcademicSegment = 'subjects' | 'assessments' | 'attendance' | 'pending';

/** Estados de um recurso remoto carregado por useResource. */
export type ResourceStatus = 'loading' | 'success' | 'empty' | 'error';

export interface ResourceState<T> {
  status: ResourceStatus;
  data: T | null;
  error: ApiClientError | null;
  reload: () => void;
}

/** Estados da análise do agente (useAnalysis). */
export type AnalysisStatus = 'idle' | 'loading' | 'success' | 'abstained' | 'human_validation' | 'error';

/** Estados visuais exibidos pelo StateView. */
export type StateKind = 'loading' | 'empty' | 'error' | 'timeout' | 'offline' | 'unauthorized' | 'forbidden';

export type PillTone = 'neutral' | 'success' | 'warning' | 'info' | 'danger';
