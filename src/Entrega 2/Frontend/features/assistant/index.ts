export { AssistantProvider, useAssistant, useOptionalAssistant, type AssistantContextValue, type EnableWakeWordResult } from './hooks/useAssistant';
export { addTelemetrySink, getTelemetryBuffer, trackAssistantEvent, type AssistantTelemetryEvent } from './services/assistantTelemetry';
export { clearConversationHistory, groupHistoryByDay, loadConversationHistory, type ConversationHistoryEntry } from './services/conversationHistory';
export { isDirectCommand, looksLikeEcho, matchWakeWord, normalizeSpeech } from './services/wakeWordMatcher';
export { createUnavailableWakeWordService, createWakeWordService, type WakeWordDetection, type WakeWordHandlers, type WakeWordService } from './services/wakeWordService';
export {
  ASSISTANT_STATE_LABELS,
  assistantShellReducer,
  assistantStateAccessibilityLabel,
  deriveAssistantState,
  INITIAL_SHELL_STATE,
  isMicrophoneCapturing,
  type ActivationSource,
  type AssistantShellState,
  type AssistantState,
  type WakeWordStatus,
} from './state/assistantStateMachine';
