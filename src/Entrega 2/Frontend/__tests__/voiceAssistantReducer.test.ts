import {
  createInitialVoiceAssistantState,
  INITIAL_VOICE_ASSISTANT_STATE,
  terminalPhase,
  voiceAssistantReducer,
} from '../hooks/voiceAssistantReducer';
import type { AssistantTurn, VoiceAssistantError, VoiceAssistantEvent, VoiceAssistantState } from '../types/assistant';
import type { VoicePhase } from '../types/voice';

import { makeAssistantResponse } from './support/fixtures';

const ALL_PHASES: VoicePhase[] = ['idle', 'listening', 'transcribing', 'understanding', 'thinking', 'answering', 'abstained', 'human_validation', 'error'];
const READY: VoicePhase[] = ['idle', 'abstained', 'human_validation', 'error', 'answering'];

const apiError: VoiceAssistantError = { kind: 'timeout', message: 'demorou' };
const sttError: VoiceAssistantError = { kind: 'no_speech', message: 'nada' };

function turnOf(overrides: Parameters<typeof makeAssistantResponse>[0] = {}): AssistantTurn {
  const response = makeAssistantResponse(overrides);
  return { id: response.interactionId, inputType: 'text', transcript: 'pergunta anterior', response, receivedAt: '2026-09-16T21:00:00.000Z' };
}

function stateIn(phase: VoicePhase, overrides: Partial<VoiceAssistantState> = {}): VoiceAssistantState {
  return { ...createInitialVoiceAssistantState(), phase, requestSeq: 3, ...overrides };
}

/** Evento representativo + fases em que ele é válido (com o estado padrão de stateIn). */
const EVENT_TABLE: { name: string; event: VoiceAssistantEvent; valid: VoicePhase[]; overrides?: Partial<VoiceAssistantState> }[] = [
  { name: 'LISTEN_REQUESTED', event: { type: 'LISTEN_REQUESTED' }, valid: READY },
  { name: 'PARTIAL_TRANSCRIPT', event: { type: 'PARTIAL_TRANSCRIPT', text: 'tenho' }, valid: ['listening'] },
  { name: 'SPEECH_ENDED', event: { type: 'SPEECH_ENDED' }, valid: ['listening'] },
  { name: 'TRANSCRIPT_READY', event: { type: 'TRANSCRIPT_READY', text: 'tenho pendência?' }, valid: ['listening', 'transcribing'] },
  { name: 'TEXT_SUBMITTED', event: { type: 'TEXT_SUBMITTED', text: 'tenho pendência?' }, valid: READY },
  { name: 'VOICE_TRANSCRIPT_SUBMITTED', event: { type: 'VOICE_TRANSCRIPT_SUBMITTED', text: 'qual minha próxima prova' }, valid: READY },
  { name: 'THINKING_DELAY_ELAPSED', event: { type: 'THINKING_DELAY_ELAPSED', seq: 3 }, valid: ['understanding'] },
  {
    name: 'RESPONSE_RECEIVED',
    event: { type: 'RESPONSE_RECEIVED', seq: 3, response: makeAssistantResponse(), willSpeak: false, receivedAt: '2026-09-16T21:10:00.000Z' },
    valid: ['understanding', 'thinking'],
  },
  { name: 'REPEAT_REQUESTED', event: { type: 'REPEAT_REQUESTED' }, valid: READY, overrides: { turn: turnOf() } },
  { name: 'SPEECH_DONE', event: { type: 'SPEECH_DONE' }, valid: ['answering'] },
  { name: 'STOP_SPEAKING', event: { type: 'STOP_SPEAKING' }, valid: ['answering'] },
  { name: 'REQUEST_FAILED', event: { type: 'REQUEST_FAILED', seq: 3, error: apiError }, valid: ['understanding', 'thinking'] },
  { name: 'RECOGNITION_FAILED', event: { type: 'RECOGNITION_FAILED', error: sttError }, valid: ['listening', 'transcribing', ...READY] },
  { name: 'CANCEL', event: { type: 'CANCEL' }, valid: ['listening', 'transcribing', 'understanding', 'thinking'] },
  { name: 'RESET_CONVERSATION', event: { type: 'RESET_CONVERSATION' }, valid: ALL_PHASES },
];

describe('voiceAssistantReducer — matriz de transições', () => {
  for (const row of EVENT_TABLE) {
    describe(row.name, () => {
      it.each(ALL_PHASES)('fase %s', (phase) => {
        const state = stateIn(phase, row.overrides);
        const next = voiceAssistantReducer(state, row.event);
        if (row.valid.includes(phase)) {
          expect(next).not.toBe(state);
        } else {
          // Transição inválida devolve o MESMO objeto.
          expect(next).toBe(state);
        }
      });
    });
  }
});

describe('voiceAssistantReducer — transições válidas', () => {
  it('estado inicial', () => {
    expect(INITIAL_VOICE_ASSISTANT_STATE).toMatchObject({ phase: 'idle', inputType: null, transcript: null, turn: null, error: null, notice: null, requestSeq: 0 });
    expect(createInitialVoiceAssistantState()).not.toBe(createInitialVoiceAssistantState());
    expect(createInitialVoiceAssistantState().conversationId).not.toBe(createInitialVoiceAssistantState().conversationId);
  });

  it('LISTEN_REQUESTED limpa parcial, erro e aviso, mas mantém o turn anterior', () => {
    const turn = turnOf();
    const next = voiceAssistantReducer(stateIn('error', { partialTranscript: 'x', error: apiError, notice: 'aviso', turn }), { type: 'LISTEN_REQUESTED' });
    expect(next).toMatchObject({ phase: 'listening', partialTranscript: '', error: null, notice: null, turn });
  });

  it('fluxo de voz: listening → parcial → transcribing → understanding (seq+1) → thinking', () => {
    let state = voiceAssistantReducer(stateIn('idle'), { type: 'LISTEN_REQUESTED' });
    state = voiceAssistantReducer(state, { type: 'PARTIAL_TRANSCRIPT', text: 'tenho ativ' });
    expect(state).toMatchObject({ phase: 'listening', partialTranscript: 'tenho ativ' });
    expect(voiceAssistantReducer(state, { type: 'PARTIAL_TRANSCRIPT', text: 'tenho ativ' })).toBe(state);
    state = voiceAssistantReducer(state, { type: 'SPEECH_ENDED' });
    expect(state.phase).toBe('transcribing');
    state = voiceAssistantReducer(state, { type: 'TRANSCRIPT_READY', text: 'Tenho atividade pendente?' });
    expect(state).toMatchObject({ phase: 'understanding', inputType: 'voice', transcript: 'Tenho atividade pendente?', partialTranscript: '', requestSeq: 4 });
    state = voiceAssistantReducer(state, { type: 'THINKING_DELAY_ELAPSED', seq: 4 });
    expect(state.phase).toBe('thinking');
  });

  it('TRANSCRIPT_READY direto de listening (resultado final sem speechend)', () => {
    const next = voiceAssistantReducer(stateIn('listening'), { type: 'TRANSCRIPT_READY', text: 'oi' });
    expect(next).toMatchObject({ phase: 'understanding', inputType: 'voice', requestSeq: 4 });
  });

  it('TEXT_SUBMITTED define inputType text e incrementa seq', () => {
    const next = voiceAssistantReducer(stateIn('human_validation', { error: apiError, notice: 'n' }), { type: 'TEXT_SUBMITTED', text: 'Qual é minha próxima prova?' });
    expect(next).toMatchObject({ phase: 'understanding', inputType: 'text', transcript: 'Qual é minha próxima prova?', requestSeq: 4, error: null, notice: null });
  });

  it('THINKING_DELAY_ELAPSED com seq antigo é ignorado', () => {
    const state = stateIn('understanding');
    expect(voiceAssistantReducer(state, { type: 'THINKING_DELAY_ELAPSED', seq: 2 })).toBe(state);
  });

  it('RESPONSE_RECEIVED cria um turn novo, atualiza o contexto e vai para idle sem fala', () => {
    const response = makeAssistantResponse({ context: { lastIntent: 'get_pending_items', lastSubjectId: 'subject-demo-002' } });
    const state = stateIn('thinking', { inputType: 'voice', transcript: 'Tenho pendência?' });
    const next = voiceAssistantReducer(state, { type: 'RESPONSE_RECEIVED', seq: 3, response, willSpeak: false, receivedAt: '2026-09-16T21:10:00.000Z' });
    expect(next.phase).toBe('idle');
    expect(next.turn).toEqual({ id: 'int-001', inputType: 'voice', transcript: 'Tenho pendência?', response, receivedAt: '2026-09-16T21:10:00.000Z' });
    expect(next.context).toEqual({ lastIntent: 'get_pending_items', lastSubjectId: 'subject-demo-002' });
  });

  it('RESPONSE_RECEIVED com willSpeak vai para answering; SPEECH_DONE volta ao terminal do turn', () => {
    const state = stateIn('understanding', { transcript: 'x' });
    const speaking = voiceAssistantReducer(state, {
      type: 'RESPONSE_RECEIVED',
      seq: 3,
      response: makeAssistantResponse({ status: 'abstained', abstained: true, abstentionReason: 'Sem dados' }),
      willSpeak: true,
      receivedAt: 'now',
    });
    expect(speaking.phase).toBe('answering');
    expect(voiceAssistantReducer(speaking, { type: 'SPEECH_DONE' }).phase).toBe('abstained');
    expect(voiceAssistantReducer(speaking, { type: 'STOP_SPEAKING' }).phase).toBe('abstained');
    const withNotice = voiceAssistantReducer(speaking, { type: 'SPEECH_DONE', notice: 'Não foi possível reproduzir a resposta por voz.' });
    expect(withNotice).toMatchObject({ phase: 'abstained', notice: 'Não foi possível reproduzir a resposta por voz.' });
    // O texto nunca é apagado quando o áudio termina.
    expect(withNotice.turn).toBe(speaking.turn);
  });

  it('RESPONSE_RECEIVED com seq antigo é ignorado', () => {
    const state = stateIn('thinking');
    const next = voiceAssistantReducer(state, { type: 'RESPONSE_RECEIVED', seq: 2, response: makeAssistantResponse(), willSpeak: false, receivedAt: 'now' });
    expect(next).toBe(state);
  });

  it.each(['repeat_last', 'stop_speaking', 'go_back'] as const)('clientCommand %s mantém o turn anterior e mostra o aviso', (clientCommand) => {
    const turn = turnOf({ status: 'human_validation', requiresHumanValidation: true });
    const state = stateIn('thinking', { turn, transcript: 'repete' });
    const response = makeAssistantResponse({ clientCommand, intent: clientCommand, display: { title: '', message: 'Certo.', items: [], recommendations: [] }, context: { lastIntent: clientCommand } });
    const next = voiceAssistantReducer(state, { type: 'RESPONSE_RECEIVED', seq: 3, response, willSpeak: false, receivedAt: 'now' });
    expect(next.turn).toBe(turn);
    expect(next.notice).toBe('Certo.');
    expect(next.phase).toBe('human_validation');
    expect(next.context).toEqual({ lastIntent: clientCommand });
  });

  it('clientCommand repeat_last com fala vai para answering; sem turn anterior fica idle', () => {
    const response = makeAssistantResponse({ clientCommand: 'repeat_last' });
    const withTurn = voiceAssistantReducer(stateIn('thinking', { turn: turnOf() }), { type: 'RESPONSE_RECEIVED', seq: 3, response, willSpeak: true, receivedAt: 'now' });
    expect(withTurn.phase).toBe('answering');
    const withoutTurn = voiceAssistantReducer(stateIn('thinking'), { type: 'RESPONSE_RECEIVED', seq: 3, response, willSpeak: true, receivedAt: 'now' });
    expect(withoutTurn).toMatchObject({ phase: 'idle', turn: null });
  });

  it('REPEAT_REQUESTED exige turn com texto de fala', () => {
    const noSpeech = stateIn('idle', { turn: turnOf({ speech: { text: '  ' } }) });
    expect(voiceAssistantReducer(noSpeech, { type: 'REPEAT_REQUESTED' })).toBe(noSpeech);
    const noTurn = stateIn('idle');
    expect(voiceAssistantReducer(noTurn, { type: 'REPEAT_REQUESTED' })).toBe(noTurn);
    expect(voiceAssistantReducer(stateIn('idle', { turn: turnOf(), notice: 'x' }), { type: 'REPEAT_REQUESTED' })).toMatchObject({ phase: 'answering', notice: null });
  });

  it('REQUEST_FAILED vai para error mantendo o turn; seq antigo é ignorado', () => {
    const turn = turnOf();
    const state = stateIn('understanding', { turn });
    expect(voiceAssistantReducer(state, { type: 'REQUEST_FAILED', seq: 3, error: apiError })).toMatchObject({ phase: 'error', error: apiError, turn });
    expect(voiceAssistantReducer(state, { type: 'REQUEST_FAILED', seq: 1, error: apiError })).toBe(state);
  });

  it('RECOGNITION_FAILED vai para error mantendo o turn e limpando a parcial', () => {
    const turn = turnOf();
    const next = voiceAssistantReducer(stateIn('listening', { turn, partialTranscript: 'abc' }), { type: 'RECOGNITION_FAILED', error: sttError });
    expect(next).toMatchObject({ phase: 'error', error: sttError, turn, partialTranscript: '' });
  });

  it('CANCEL volta ao terminal do turn anterior (ou idle)', () => {
    expect(voiceAssistantReducer(stateIn('thinking'), { type: 'CANCEL' }).phase).toBe('idle');
    const abstainedTurn = turnOf({ status: 'abstained', abstained: true });
    expect(voiceAssistantReducer(stateIn('listening', { turn: abstainedTurn, partialTranscript: 'a' }), { type: 'CANCEL' })).toMatchObject({
      phase: 'abstained',
      partialTranscript: '',
      turn: abstainedTurn,
    });
  });

  it('resposta atrasada após CANCEL é ignorada (fase não é mais de requisição)', () => {
    const cancelled = voiceAssistantReducer(stateIn('thinking'), { type: 'CANCEL' });
    const next = voiceAssistantReducer(cancelled, { type: 'RESPONSE_RECEIVED', seq: 3, response: makeAssistantResponse(), willSpeak: true, receivedAt: 'now' });
    expect(next).toBe(cancelled);
  });

  it('RESET_CONVERSATION limpa turn, contexto e erros', () => {
    const next = voiceAssistantReducer(stateIn('error', { turn: turnOf(), context: { lastIntent: 'get_subjects' }, error: apiError, transcript: 'x' }), { type: 'RESET_CONVERSATION' });
    expect(next).toEqual({ ...createInitialVoiceAssistantState(), conversationId: expect.any(String) });
    expect(next.thread).toEqual([]);
  });
});

describe('terminalPhase', () => {
  it('abstained por status ou flag', () => {
    expect(terminalPhase(makeAssistantResponse({ status: 'abstained' }))).toBe('abstained');
    expect(terminalPhase(makeAssistantResponse({ abstained: true }))).toBe('abstained');
  });

  it('human_validation por status ou flag', () => {
    expect(terminalPhase(makeAssistantResponse({ status: 'human_validation' }))).toBe('human_validation');
    expect(terminalPhase(makeAssistantResponse({ requiresHumanValidation: true }))).toBe('human_validation');
  });

  it('abstenção tem precedência sobre validação humana; demais → idle', () => {
    expect(terminalPhase(makeAssistantResponse({ abstained: true, requiresHumanValidation: true }))).toBe('abstained');
    expect(terminalPhase(makeAssistantResponse({ status: 'refused' }))).toBe('idle');
    expect(terminalPhase(null)).toBe('idle');
  });
});
