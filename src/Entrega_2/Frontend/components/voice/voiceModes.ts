/** Estado do botão de voz da barra de mensagem (derivado da fase da conversa). */
export type VoiceButtonMode = 'idle' | 'listening' | 'answering' | 'busy' | 'unavailable';

/** Rótulos acessíveis do botão de voz: descrevem a ação atual, nunca só o ícone ou a cor. */
export const VOICE_BUTTON_LABELS: Record<VoiceButtonMode, string> = {
  idle: 'Falar com o assistente ASA',
  listening: 'Parar e enviar',
  answering: 'Parar resposta e falar novamente',
  busy: 'Aguarde, o assistente está processando sua pergunta',
  unavailable: 'Entrada por voz indisponível. Use o campo de texto para perguntar',
};
