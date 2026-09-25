/**
 * Observabilidade e analytics do assistente — SEM conteúdo sensível.
 * Eventos carregam apenas identificadores, estados e durações (nunca texto da pergunta, transcrição
 * ou áudio). Nenhum sink é registrado por padrão; o app pode plugar um provedor via `addTelemetrySink`.
 */
export type AssistantTelemetryEvent =
  | 'assistant_opened'
  | 'assistant_closed'
  | 'assistant_activation'
  | 'assistant_voice_started'
  | 'assistant_voice_stopped'
  | 'assistant_text_sent'
  | 'assistant_request'
  | 'assistant_response'
  | 'assistant_intent'
  | 'assistant_action_clicked'
  | 'assistant_navigation'
  | 'assistant_interrupted'
  | 'assistant_error'
  | 'wake_word_status'
  | 'wake_word_detected'
  | 'microphone_permission';

export type TelemetryValue = string | number | boolean | null;

export interface TelemetryRecord {
  event: AssistantTelemetryEvent;
  at: number;
  props: Record<string, TelemetryValue>;
}

export type TelemetrySink = (record: TelemetryRecord) => void;

const MAX_BUFFER = 50;
const buffer: TelemetryRecord[] = [];
const sinks = new Set<TelemetrySink>();

/** Chaves que nunca podem entrar em telemetria, mesmo por engano. */
const FORBIDDEN_KEYS = /^(text|transcript|question|answer|message|audio|token|password|email|name)$/i;

export function trackAssistantEvent(event: AssistantTelemetryEvent, props: Record<string, TelemetryValue> = {}): void {
  const safe: Record<string, TelemetryValue> = {};
  for (const [key, value] of Object.entries(props)) {
    if (FORBIDDEN_KEYS.test(key)) continue;
    safe[key] = value;
  }
  const record: TelemetryRecord = { event, at: Date.now(), props: safe };
  buffer.push(record);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  for (const sink of sinks) {
    try {
      sink(record);
    } catch {
      // um sink com defeito nunca afeta o assistente
    }
  }
}

export function addTelemetrySink(sink: TelemetrySink): () => void {
  sinks.add(sink);
  return () => sinks.delete(sink);
}

/** Últimos eventos (diagnóstico em desenvolvimento). */
export function getTelemetryBuffer(): readonly TelemetryRecord[] {
  return buffer;
}

export function resetTelemetryForTests(): void {
  buffer.length = 0;
  sinks.clear();
}
