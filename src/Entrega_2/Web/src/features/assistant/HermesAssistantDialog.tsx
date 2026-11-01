import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Mic, MicOff, Send, Volume2, VolumeX } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { AssistantAnswer } from '@/features/assistant/components';
import { assistantErrorMessage, MAX_QUESTION_LENGTH } from '@/features/assistant/conversation';
import { useSession } from '@/features/auth/session';
import { assistantApi, publicAssistantApi } from '@/services/api/endpoints';
import { isApiError } from '@/services/api/client';
import type { AssistantConversationContext, AssistantResponse } from '@/types/api';

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = Event & { resultIndex: number; results: ArrayLike<RecognitionResult> };
type RecognitionErrorEvent = Event & { error: string };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionConstructor = new () => Recognition;
type SpeechWindow = Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };

const PUBLIC_SUGGESTIONS = [
  'Como acesso o Moodle?',
  'Onde encontro documentos acadêmicos?',
  'Como consulto oportunidades de estágio?',
  'Como falar com o ASA?',
];
const STUDENT_SUGGESTIONS = [
  'Tenho atividade pendente?',
  'Qual é minha próxima prova?',
  'Como está minha frequência?',
  'Tem alguma matéria que merece atenção?',
];

interface Turn {
  id: number;
  question: string;
  response?: AssistantResponse;
  error?: string;
  pending?: boolean;
  inputType: 'text' | 'voice';
}

function getSpeechRecognition(): RecognitionConstructor | null {
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function voiceErrorMessage(code: string): string {
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'O navegador não autorizou o microfone. Libere o acesso nas permissões do navegador e tente novamente.';
  if (code === 'audio-capture') return 'Não encontrei um microfone disponível neste dispositivo.';
  if (code === 'no-speech') return 'Não detectei fala. Toque no microfone e tente novamente.';
  if (code === 'network') return 'O reconhecimento de voz está indisponível pela rede. Você pode digitar sua pergunta.';
  return 'Não foi possível iniciar o reconhecimento de voz. Você pode digitar sua pergunta.';
}

export function HermesAssistantDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useSession();
  const hasStudentAccess = Boolean(session.me?.student && session.me.permissions.includes('assistant:use'));
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [loginPrompt, setLoginPrompt] = useState(false);
  const [dialogViewport, setDialogViewport] = useState<{ height: number; top: number } | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const voiceTextRef = useRef('');
  const voiceStartedAtRef = useRef(0);
  const conversationContextRef = useRef<AssistantConversationContext>({});
  const requestRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const sequenceRef = useRef(0);
  const voiceSupported = typeof window !== 'undefined' && Boolean(getSpeechRecognition());
  const suggestions = hasStudentAccess ? STUDENT_SUGGESTIONS : PUBLIC_SUGGESTIONS;
  const dialogContentStyle: CSSProperties | undefined = dialogViewport ? {
    '--dialog-viewport-height': `${dialogViewport.height}px`,
    '--dialog-viewport-top': `${dialogViewport.top}px`,
  } as CSSProperties : undefined;

  useEffect(() => {
    if (!open) return undefined;
    const viewport = window.visualViewport;
    const syncViewport = () => setDialogViewport({
      height: Math.max(320, Math.round(viewport?.height ?? window.innerHeight)),
      top: Math.max(0, Math.round(viewport?.offsetTop ?? 0)),
    });
    syncViewport();
    viewport?.addEventListener('resize', syncViewport);
    viewport?.addEventListener('scroll', syncViewport);
    window.addEventListener('resize', syncViewport);
    return () => {
      viewport?.removeEventListener('resize', syncViewport);
      viewport?.removeEventListener('scroll', syncViewport);
      window.removeEventListener('resize', syncViewport);
    };
  }, [open]);

  const stopVoice = useCallback((abort: boolean) => {
    const recognition = recognitionRef.current;
    if (recognition) {
      if (abort) {
        recognitionRef.current = null;
        recognition.abort();
      } else recognition.stop();
    }
    if (abort || !recognition) setListening(false);
  }, []);

  const resetConversation = useCallback(() => {
    stopVoice(true);
    requestRef.current?.abort();
    requestRef.current = null;
    window.speechSynthesis?.cancel();
    setTurns([]);
    setDraft('');
    setBusy(false);
    busyRef.current = false;
    setVoiceError(null);
    setServiceError(null);
    setLoginPrompt(false);
    setSpeakingId(null);
    voiceTextRef.current = '';
    conversationContextRef.current = {};
  }, [stopVoice]);

  const close = useCallback(() => {
    resetConversation();
    onClose();
  }, [onClose, resetConversation]);

  const speakResponse = useCallback((id: number, text: string) => {
    if (!('speechSynthesis' in window) || !text.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.lang = 'pt-BR';
    // Variação pequena de ritmo e pausas naturais, usando a melhor voz pt-BR instalada no dispositivo.
    utterance.rate = 0.96;
    utterance.pitch = 1;
    const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith('pt-br'));
    const score = (name: string) => (/natural|neural|premium|enhanced/i.test(name) ? 4 : 0) + (/google|microsoft|luciana|francisca|camila/i.test(name) ? 2 : 0);
    const voice = [...voices].sort((a, b) => score(b.name) - score(a.name))[0];
    if (voice) utterance.voice = voice;
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  }, []);

  const send = useCallback(async (raw: string, inputType: 'text' | 'voice', speechRecognitionMs?: number) => {
    const text = raw.trim().slice(0, MAX_QUESTION_LENGTH);
    if (!text || busyRef.current) return;
    const id = ++sequenceRef.current;
    const question: Turn = { id, question: text, pending: true, inputType };
    setTurns((current) => [...current, question]);
    setDraft('');
    setServiceError(null);
    setBusy(true);
    busyRef.current = true;
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const clientMetrics = inputType === 'voice' && speechRecognitionMs !== undefined ? { speechRecognitionMs: Math.max(0, Math.round(speechRecognitionMs)) } : undefined;
      const response = hasStudentAccess
        ? await assistantApi.message({
          inputType,
          text,
          currentScreen: 'assistant',
          ...(Object.keys(conversationContextRef.current).length ? { conversationContext: conversationContextRef.current } : {}),
          ...(clientMetrics ? { clientMetrics } : {}),
        }, controller.signal)
        : await publicAssistantApi.message({ inputType, text, ...(clientMetrics ? { clientMetrics } : {}) }, controller.signal);
      conversationContextRef.current = response.context;
      setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, pending: false, response } : turn));
      if (inputType === 'voice') speakResponse(id, response.speech.text || response.display.message);
    } catch (error) {
      if (!controller.signal.aborted) {
        const needsLogin = isApiError(error) && (error.reason === 'student_login_required' || error.kind === 'unauthorized');
        if (needsLogin) {
          setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, pending: false } : turn));
          setLoginPrompt(true);
        } else {
          const message = assistantErrorMessage(error);
          setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, pending: false, error: message } : turn));
          setServiceError(message);
        }
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      if (!controller.signal.aborted) {
        setBusy(false);
        busyRef.current = false;
      }
    }
  }, [hasStudentAccess, speakResponse]);

  const startVoice = useCallback(() => {
    const Constructor = getSpeechRecognition();
    if (!Constructor) {
      setVoiceError('Este navegador não oferece reconhecimento de voz. Digite sua pergunta no campo abaixo.');
      return;
    }
    if (busyRef.current) return;
    setVoiceError(null);
    setServiceError(null);
    window.speechSynthesis?.cancel();
    voiceTextRef.current = '';
    voiceStartedAtRef.current = performance.now();
    const recognition = new Constructor();
    recognition.lang = 'pt-BR';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const text = Array.from({ length: event.results.length }, (_, index) => {
        const result = event.results[index];
        return result?.isFinal ? result[0]?.transcript ?? '' : '';
      }).filter(Boolean).join(' ').trim();
      if (text) {
        voiceTextRef.current = text.slice(0, MAX_QUESTION_LENGTH);
        setDraft(voiceTextRef.current);
      }
    };
    recognition.onerror = (event) => {
      setVoiceError(voiceErrorMessage(event.error));
      voiceTextRef.current = '';
      setListening(false);
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      setListening(false);
      const text = voiceTextRef.current.trim();
      voiceTextRef.current = '';
      if (text) void send(text, 'voice', performance.now() - voiceStartedAtRef.current);
    };
    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setVoiceError('Não foi possível abrir o microfone. Confira as permissões e tente novamente.');
    }
  }, [send]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.trim() || busy || listening) return;
    void send(draft, 'text');
  };

  const speak = (turn: Turn) => {
    if (!turn.response || !('speechSynthesis' in window)) return;
    if (speakingId === turn.id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    speakResponse(turn.id, turn.response.speech.text || turn.response.display.message);
  };

  useEffect(() => () => {
    recognitionRef.current?.abort();
    requestRef.current?.abort();
    window.speechSynthesis?.cancel();
  }, []);

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Hey ASA · Hermes"
      description="Assistente do ASA Conecta, disponível por texto ou voz."
      size="lg"
      mobileFullScreen
      contentStyle={dialogContentStyle}
    >
      {session.status === 'loading' ? (
        <p role="status" className="py-8 text-center text-small text-slate">Verificando sua sessão…</p>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div role="note" className="shrink-0 rounded-md border border-line bg-paper px-3 py-2 text-caption leading-5 text-slate">
            {hasStudentAccess ? 'O Hermes responde com artigos publicados e dados acadêmicos vinculados à sua sessão.' : 'O Hermes pode orientar sobre serviços e informações públicas da FECAP. Para consultar dados acadêmicos pessoais, você poderá entrar no ASA Conecta.'} A fala é transcrita pelo recurso de voz do navegador; somente o texto reconhecido é enviado ao assistente.
          </div>
          <div role="log" aria-label="Conversa com Hermes" aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto py-1">
            {turns.length === 0 ? (
              <div className="my-auto flex flex-col items-center py-4 text-center sm:py-7">
                <img src="/brand/mascot/hermes-fecap.gif" alt="" className="h-16 w-16 object-contain sm:h-20 sm:w-20" />
                <p className="mt-2 text-h4 font-semibold text-ink">{session.me?.user.fullName ? `Olá, ${session.me.user.fullName.split(' ')[0]}!` : 'Olá! Como posso ajudar?'}</p>
                <p className="mt-1 max-w-md text-small leading-6 text-slate">{hasStudentAccess ? 'Pergunte sobre suas disciplinas, atividades, avaliações, frequência, pendências ou serviços do ASA.' : 'Pergunte sobre serviços, documentos, plataformas ou atendimento. Para informações da sua vida acadêmica, o Hermes pedirá seu login.'}</p>
                {voiceSupported ? <p className="mt-2 text-caption text-mist">Toque no microfone e fale em português. A pergunta será enviada quando você terminar de falar.</p> : null}
                <div role="group" aria-label="Sugestões de perguntas para o Hey ASA" className="mt-4 flex max-w-2xl flex-wrap justify-center gap-2">
                  {suggestions.map((suggestion) => <button key={suggestion} type="button" disabled={busy} onClick={() => void send(suggestion, 'text')} className="min-h-10 max-w-full rounded-full border border-line bg-white px-3 py-2 text-left text-caption font-semibold text-action transition-colors hover:border-action/50 hover:bg-action-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:opacity-60">{suggestion}</button>)}
                </div>
              </div>
            ) : turns.map((turn) => (
              <article key={turn.id} className="flex flex-col gap-2.5">
                <div className="ml-auto max-w-[88%] rounded-lg bg-action-soft px-3 py-2 text-small text-ink">
                  <span className="sr-only">Você: </span>{turn.question}
                  {turn.inputType === 'voice' ? <span className="ml-2 text-caption text-slate">· voz</span> : null}
                </div>
                <div className="mr-2 rounded-lg border border-line bg-white p-3 sm:p-4">
                  {turn.pending ? <p role="status" className="text-small text-slate">Hermes está consultando as informações…</p> : null}
                  {turn.error ? <p role="alert" className="text-small text-danger-text">{turn.error}</p> : null}
                  {turn.response ? <>
                    <AssistantAnswer response={turn.response} question={turn.question} onAsk={(text) => void send(text, 'text')} busy={busy} />
                    {'speechSynthesis' in window ? <button type="button" onClick={() => speak(turn)} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-md border border-line px-3 py-1.5 text-caption font-semibold text-action hover:bg-action-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action" aria-label={speakingId === turn.id ? 'Parar leitura da resposta' : 'Ouvir resposta em voz alta'}>{speakingId === turn.id ? <VolumeX size={16} aria-hidden /> : <Volume2 size={16} aria-hidden />}{speakingId === turn.id ? 'Parar áudio' : 'Ouvir resposta'}</button> : null}
                  </> : null}
                </div>
              </article>
            ))}
          </div>
          {serviceError ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-small text-danger-text">{serviceError}</p> : null}
          {loginPrompt ? <div role="status" className="rounded-md border border-action/20 bg-action-soft p-3 text-small text-ink"><p className="font-semibold">Essa consulta exige sua sessão de estudante.</p><p className="mt-1">Entre no ASA Conecta para que o Hermes consulte somente os seus próprios dados acadêmicos.</p><Link to="/login?next=%2Faluno%2Fassistente" onClick={close} className="mt-2 inline-flex min-h-10 items-center rounded-md bg-action px-4 py-2 font-semibold text-white hover:bg-action-hover">Entrar no ASA Conecta</Link></div> : null}
          {voiceError ? <p role="alert" className="rounded-md bg-warning-soft px-3 py-2 text-small text-warning-text">{voiceError}</p> : null}
          <form onSubmit={onSubmit} className="shrink-0 border-t border-line pt-3">
            <label htmlFor="hermes-question" className="sr-only">Sua pergunta para o Hermes</label>
            <div className="flex items-end gap-2">
              <textarea id="hermes-question" rows={2} maxLength={MAX_QUESTION_LENGTH} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={listening ? 'Estou ouvindo…' : 'Escreva sua pergunta…'} disabled={busy || listening} className="min-h-11 min-w-0 flex-1 resize-y rounded-md border border-line bg-white px-3 py-2 text-small text-ink placeholder:text-mist focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-action disabled:bg-paper" />
              {voiceSupported ? <Button type="button" variant={listening ? 'danger' : 'secondary'} icon={listening ? MicOff : Mic} disabled={busy} aria-label={listening ? 'Encerrar gravação e enviar pergunta' : 'Falar com Hermes'} onClick={() => listening ? stopVoice(false) : startVoice()}>{listening ? 'Parar' : 'Falar'}</Button> : null}
              <Button type="submit" variant="primary" icon={Send} disabled={!draft.trim() || busy || listening} aria-label="Enviar pergunta">Enviar</Button>
            </div>
            <p className="mt-1 text-right text-caption text-mist">{draft.length}/{MAX_QUESTION_LENGTH} · Enter envia · Shift+Enter quebra a linha</p>
          </form>
        </div>
      )}
    </Dialog>
  );
}
