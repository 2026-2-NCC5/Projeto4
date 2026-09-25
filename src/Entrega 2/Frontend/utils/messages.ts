import type { VoiceAssistantErrorKind } from '../types/assistant';

/** Textos oficiais de estado — use exatamente estas strings na UI. */
export const MESSAGES = {
  loadingData: 'Carregando suas informações...',
  loadingSession: 'Carregando sua sessão',
  analyzing: 'Analisando sua situação acadêmica...',
  emptyPending:
    'Nenhuma pendência encontrada. Quando novas pendências forem identificadas, elas serão apresentadas aqui.',
  emptyRecommendations: 'Nenhuma recomendação disponível no momento.',
  emptyHistory: 'Nenhuma análise registrada ainda.',
  emptySubjects: 'Nenhuma disciplina encontrada para o período atual.',
  emptyAssessments: 'Nenhuma avaliação registrada até o momento.',
  emptyAttendance: 'Nenhum registro de frequência disponível.',
  noAnalysisYet: 'Nenhuma análise realizada ainda',
  noAction: 'Nenhuma situação que mereça atenção foi identificada',
  abstained: 'Não foi possível gerar uma recomendação confiável.',
  humanValidation: 'Esta situação precisa ser confirmada por uma pessoa responsável.',
  errorGeneric: 'Não foi possível carregar as informações. Tente novamente.',
  errorAnalysisTimeout: 'A análise está demorando mais que o esperado. Tente novamente.',
  errorAnalysisDependency: 'Não foi possível concluir a análise. Tente novamente.',
  errorAnalysisContract: 'O serviço de análise respondeu em um formato incompatível. Tente novamente mais tarde.',
  errorOffline: 'Sem conexão com a internet. Verifique sua conexão e tente novamente.',
  errorNetwork: 'Não foi possível se comunicar com o servidor. Verifique sua conexão e tente novamente.',
  errorUnauthorized: 'Sua sessão expirou. Entre novamente.',
  errorForbidden: 'Você não tem permissão para acessar este conteúdo.',
  errorCredentials: 'E-mail ou senha inválidos.',
  retry: 'Tentar novamente',
  back: 'Voltar',
  // ------------------------------------------------------------ assistente por voz
  voicePermissionDenied: 'Não foi possível acessar o microfone. Você ainda pode conversar com o ASA usando texto.',
  voiceUnavailable: 'A entrada por voz não está disponível neste aplicativo. Você pode conversar com o ASA usando texto.',
  voiceUnavailableExpoGo: 'No Expo Go o reconhecimento de voz exige um development build.',
  voiceNoSpeech: 'Não consegui ouvir nada. Toque novamente e tente falar mais perto do microfone.',
  voiceSttFailed: 'Não foi possível reconhecer sua fala. Tente novamente ou digite sua pergunta.',
  voiceTtsFailed: 'Não foi possível reproduzir a resposta por voz.',
  assistantTimeout: 'A resposta está demorando mais que o esperado. Tente novamente.',
  assistantGeneric: 'Não foi possível obter uma resposta agora. Tente novamente.',
  voicePrivacy:
    'O áudio não é gravado nem armazenado pelo ASA Conecta. A fala é convertida em texto pelo serviço de voz do sistema e apenas o texto é enviado à API.',
} as const;

export type MessageKey = keyof typeof MESSAGES;

/** Mensagem oficial para um erro do assistente (voz ou API). */
export function voiceAssistantErrorMessage(kind: VoiceAssistantErrorKind): string {
  switch (kind) {
    case 'permission_denied':
      return MESSAGES.voicePermissionDenied;
    case 'unavailable':
      return MESSAGES.voiceUnavailable;
    case 'no_speech':
      return MESSAGES.voiceNoSpeech;
    case 'stt_failed':
      return MESSAGES.voiceSttFailed;
    case 'timeout':
      return MESSAGES.assistantTimeout;
    case 'dependency':
      return MESSAGES.errorAnalysisDependency;
    case 'contract':
      return MESSAGES.errorAnalysisContract;
    case 'offline':
      return MESSAGES.errorOffline;
    case 'network':
      return MESSAGES.errorNetwork;
    case 'unauthorized':
      return MESSAGES.errorUnauthorized;
    default:
      return MESSAGES.assistantGeneric;
  }
}
