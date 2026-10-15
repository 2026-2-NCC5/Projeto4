import type { ApiClientError } from '../services/apiClient';

/** Abas da área autenticada (Início · Acadêmico · Assistente · Serviços · Perfil). */
export type TabKey = 'home' | 'academic' | 'assistant' | 'services' | 'profile';

/** Rotas de detalhe sobrepostas às abas (navegação local, sem react-navigation). */
export type DetailRoute =
  | { screen: 'recommendation'; id: string }
  | { screen: 'run'; runId: string }
  | { screen: 'history' }
  // ---- support (Atendimento)
  | SupportRoute
  // ---- queue (Fila presencial do ASA)
  | { screen: 'queue' }
  // ---- appointments (Agendamentos com o ASA)
  | AppointmentRoute
  // ---- notifications (Central de avisos)
  | { screen: 'notifications' };

// ---- appointments (Agendamentos com o ASA)
/** Rotas dos agendamentos (empilháveis como as do Atendimento: voltar retorna à tela anterior). */
export type AppointmentRoute =
  | { screen: 'appointments' }
  /** `rescheduleId`: o mesmo fluxo remarca um agendamento existente */
  | { screen: 'appointment-book'; rescheduleId?: string }
  | { screen: 'appointment'; id: string };
// ---- end appointments

// ---- support (Atendimento)
/** Abas principais de "Meus chamados". */
export type SupportListFilter = 'all' | 'active' | 'waiting_student' | 'finished';

/** Rotas do Atendimento (empilháveis: voltar retorna à tela anterior do fluxo). */
export type SupportRoute =
  | { screen: 'support' }
  | { screen: 'support-tickets'; filter?: SupportListFilter }
  | { screen: 'support-new'; categoryId?: string }
  | { screen: 'support-ticket'; id: string };
// ---- end support

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
