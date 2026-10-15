import { isApiClientError } from '../../../services/apiClient';
import type { QueueAlertMilestone, QueueAlertPreferences, QueuePreferencesRequest, QueueStatus } from '../../../types/api';
import { QUEUE } from '../config';
import type { MockScenario, QueueClient, QueueRealtimeEvent } from '../services/queueClient';
import type { PushPermission, PushUnavailableReason } from '../services/pushNotifications';

import { baselineMilestone, pickAlert, type QueueInAppAlert } from './alerts';
import { DEFAULT_ALERT_PREFERENCES } from './alertStore';
import { isActiveSubscription } from './experience';

/** live: canal em tempo real aberto · polling: plano B · idle: sem interesse/app em segundo plano. */
export type QueueConnection = 'idle' | 'connecting' | 'live' | 'polling' | 'offline';

export interface QueueControllerState {
  status: QueueStatus | null;
  /** primeira carga em andamento */
  loading: boolean;
  /** mensagem amigável da última falha de leitura (null quando a última leitura deu certo) */
  error: string | null;
  connection: QueueConnection;
  /** relógio do aparelho na última leitura bem-sucedida */
  lastUpdatedAt: number | null;
  /** aviso interno de proximidade (banner) */
  banner: QueueInAppAlert | null;
  /** "É a sua vez!" aguardando o "Entendi" */
  called: QueueInAppAlert | null;
  push: { permission: PushPermission; registered: boolean; reason: PushUnavailableReason | null };
  /** preferências para o próximo acompanhamento */
  defaults: QueueAlertPreferences;
}

export interface PushAdapter {
  getPermission(): Promise<PushPermission>;
  requestPermission(): Promise<PushPermission>;
  getToken(): Promise<{ token: string | null; reason?: PushUnavailableReason }>;
  platform(): 'ios' | 'android' | 'web' | null;
}

export interface AlertStore {
  loadHandled(): Promise<Record<string, QueueAlertMilestone>>;
  saveHandled(handled: Record<string, QueueAlertMilestone>): Promise<void>;
  loadDefaults(): Promise<QueueAlertPreferences>;
  saveDefaults(preferences: QueueAlertPreferences): Promise<void>;
}

export interface QueueControllerDeps {
  client: QueueClient;
  push: PushAdapter;
  store: AlertStore;
  now?: () => number;
  /** efeitos do alerta (vibração, voz, leitor de tela) — definidos pelo provider */
  onAlert?: (alert: QueueInAppAlert, preferences: QueueAlertPreferences) => void;
}

export type SubscribeResult = { ok: true } | { ok: false; message: string };

/** Duração mínima de um stream saudável; menos que isso é tratado como falha (com espera crescente). */
const MIN_HEALTHY_STREAM_MS = 5_000;

/** Mensagem amigável para falhas da API da fila (nunca a mensagem técnica). */
export function queueErrorMessage(error: unknown): string {
  if (!isApiClientError(error)) return 'Não foi possível concluir agora. Tente novamente.';
  switch (error.kind) {
    case 'validation':
      return error.details?.find((detail) => detail.field === 'ticket')?.message ?? 'Digite uma senha válida.';
    case 'offline':
      return 'Sem conexão com a internet. Tente de novo quando estiver online.';
    case 'rate_limited':
      return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
    case 'dependency':
      return 'O acompanhamento da fila não está disponível no momento.';
    case 'not_found':
      return 'Nenhuma senha sendo acompanhada.';
    default:
      return 'Não foi possível falar com o ASA Conecta agora. Tente novamente.';
  }
}

/**
 * Orquestra a fila no app (fora do React, como o controlador do assistente de voz):
 * - estado vindo do backend (SSE com o app aberto; polling só como plano B);
 * - alertas internos decididos pelo ESTADO (marco do servidor × marco já exibido), sem duplicar;
 * - registro do push token depois que o aluno ativa as notificações.
 * Sem interesse (nenhuma senha e tela fechada) ou em segundo plano, nenhuma conexão fica aberta.
 */
export class QueueController {
  state: QueueControllerState = {
    status: null,
    loading: true,
    error: null,
    connection: 'idle',
    lastUpdatedAt: null,
    banner: null,
    called: null,
    push: { permission: 'undetermined', registered: false, reason: null },
    defaults: { ...DEFAULT_ALERT_PREFERENCES },
  };

  private listener: ((state: QueueControllerState) => void) | null = null;
  private onAlert: QueueControllerDeps['onAlert'];
  private readonly now: () => number;
  private handled: Record<string, QueueAlertMilestone> = {};
  private handledLoaded = false;
  private foreground = true;
  private offline = false;
  private interest = 0;
  private stream: { close(): void } | null = null;
  private streamAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;
  private requestSeq = 0;
  private started = false;
  private disposed = false;

  constructor(private readonly deps: QueueControllerDeps) {
    this.now = deps.now ?? Date.now;
    this.onAlert = deps.onAlert;
  }

  configure(options: { onAlert?: QueueControllerDeps['onAlert'] }) {
    this.onAlert = options.onAlert;
  }

  attach(listener: (state: QueueControllerState) => void) {
    this.listener = listener;
    listener(this.state);
  }

  private setState(changes: Partial<QueueControllerState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...changes };
    this.listener?.(this.state);
  }

  // ------------------------------------------------------------------ ciclo de vida

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const [handled, defaults, permission] = await Promise.all([
      this.deps.store.loadHandled().catch(() => ({})),
      this.deps.store.loadDefaults().catch(() => ({ ...DEFAULT_ALERT_PREFERENCES })),
      this.deps.push.getPermission().catch((): PushPermission => 'unavailable'),
    ]);
    this.handled = { ...handled, ...this.handled };
    this.handledLoaded = true;
    this.setState({ defaults, push: { ...this.state.push, permission } });
    await this.refresh();
  }

  dispose() {
    this.disposed = true;
    this.listener = null;
    this.closeStream();
    this.stopPolling();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
  }

  setForeground(active: boolean) {
    if (this.foreground === active) return;
    this.foreground = active;
    // ao voltar ao app: atualiza na hora (alertas perdidos aparecem pelo estado)
    if (active) void this.refresh();
    this.updateConnection();
  }

  setOffline(offline: boolean) {
    if (this.offline === offline) return;
    this.offline = offline;
    if (!offline) void this.refresh();
    this.updateConnection();
  }

  /** A tela da fila aberta mantém a conexão mesmo sem senha acompanhada. Devolve a função de saída. */
  retainInterest = (): (() => void) => {
    this.interest += 1;
    this.updateConnection();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.interest = Math.max(0, this.interest - 1);
      this.updateConnection();
    };
  };

  private wantsConnection(): boolean {
    return this.started && this.foreground && !this.offline && (this.interest > 0 || isActiveSubscription(this.state.status?.subscription));
  }

  private updateConnection() {
    if (this.disposed) return;
    if (this.offline) {
      this.closeStream();
      this.stopPolling();
      if (this.state.connection !== 'offline') this.setState({ connection: 'offline' });
      return;
    }
    if (!this.wantsConnection()) {
      this.closeStream();
      this.stopPolling();
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      if (this.state.connection !== 'idle') this.setState({ connection: 'idle' });
      return;
    }
    if (!this.stream && !this.reconnectTimer) this.openStream();
  }

  // ------------------------------------------------------------------ tempo real

  private openStream() {
    this.setState({ connection: this.pollTimer ? 'polling' : 'connecting' });
    const openedAt = this.now();
    const stream = this.deps.client.openStream({
      onOpen: () => {
        this.streamAttempt = 0;
        this.stopPolling();
        this.setState({ connection: 'live' });
      },
      onEvent: (event) => this.handleEvent(event),
      onClose: (error) => {
        if (this.stream !== stream) return;
        this.stream = null;
        if (!this.wantsConnection()) return;
        // stream que fecha logo após abrir (proxy, servidor reiniciando) conta como falha: evita reconexão em laço
        if (error || this.now() - openedAt < MIN_HEALTHY_STREAM_MS) {
          this.startPolling();
          this.scheduleReconnect();
        } else {
          // rotação normal do servidor: renova o token com uma leitura e reconecta
          void this.refresh().finally(() => this.updateConnection());
        }
      },
    });
    this.stream = stream;
    if (!stream) {
      this.startPolling();
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delays = QUEUE.STREAM_RETRY_MS;
    const delay = delays[Math.min(this.streamAttempt, delays.length - 1)] ?? 30_000;
    this.streamAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      // a leitura renova o token de acesso antes de reabrir o SSE
      void this.refresh().finally(() => this.updateConnection());
    }, delay);
  }

  private closeStream() {
    const stream = this.stream;
    this.stream = null;
    stream?.close();
  }

  /** Só é chamado sem stream aberto (falhou ou caiu): o indicador passa a "Atualizando". */
  private startPolling() {
    if (this.state.connection !== 'polling') this.setState({ connection: 'polling' });
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => void this.refresh(), QUEUE.POLL_INTERVAL_MS);
  }

  private stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private handleEvent(event: QueueRealtimeEvent) {
    if (event.type === 'queue.status') {
      this.applyStatus(event.status);
    } else if (event.type === 'queue.sync' && this.state.status) {
      const { status } = this.state;
      this.setState({ status: { ...status, queue: { ...status.queue, status: event.sync.status ?? status.queue.status, sync: event.sync.sync } }, lastUpdatedAt: this.now() });
    }
    // queue.ticket.*: o servidor envia logo em seguida o queue.status completo
  }

  // ------------------------------------------------------------------ leitura

  refresh = async (): Promise<void> => {
    if (this.disposed) return;
    const seq = ++this.requestSeq;
    try {
      const status = await this.deps.client.getStatus();
      if (seq === this.requestSeq) this.applyStatus(status);
    } catch (error) {
      if (seq !== this.requestSeq || this.disposed) return;
      if (isApiClientError(error) && error.kind === 'cancelled') return;
      this.setState({ loading: false, error: queueErrorMessage(error) });
    }
  };

  private applyStatus(status: QueueStatus) {
    const wasActive = isActiveSubscription(this.state.status?.subscription);
    this.setState({ status, loading: false, error: null, lastUpdatedAt: this.now() });
    this.evaluateAlerts();
    if (wasActive !== isActiveSubscription(status.subscription)) this.updateConnection();
    if (isActiveSubscription(status.subscription) && this.state.push.permission === 'granted' && !this.state.push.registered) void this.registerPushToken();
  }

  private evaluateAlerts() {
    const sub = this.state.status?.subscription ?? null;
    if (!sub || !this.handledLoaded) return;
    const { alert, markHandled } = pickAlert(sub, this.handled[sub.id] ?? null, this.now(), QUEUE.CALLED_ALERT_MAX_AGE_MS);
    if (markHandled) {
      this.handled = { ...this.handled, [sub.id]: markHandled };
      void this.deps.store.saveHandled(this.handled);
    }
    if (!alert) return;
    if (alert.kind === 'called') {
      this.clearBanner();
      this.setState({ called: alert });
    } else {
      this.showBanner(alert);
    }
    try {
      this.onAlert?.(alert, sub.preferences);
    } catch {
      // efeitos (voz/vibração) são best-effort; o aviso visual já está na tela
    }
  }

  private showBanner(alert: QueueInAppAlert) {
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.setState({ banner: alert });
    this.bannerTimer = setTimeout(() => this.clearBanner(), QUEUE.BANNER_MS);
  }

  private clearBanner() {
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = null;
    if (this.state.banner) this.setState({ banner: null });
  }

  dismissBanner = () => this.clearBanner();

  acknowledgeCalled = () => {
    if (this.state.called) this.setState({ called: null });
  };

  // ------------------------------------------------------------------ ações

  subscribe = async (ticket: string, preferences?: Partial<QueueAlertPreferences>): Promise<SubscribeResult> => {
    const prefs = { ...this.state.defaults, ...preferences };
    try {
      const status = await this.deps.client.subscribe({ ticket, ...prefs });
      const sub = status.subscription;
      // marcos já atingidos no cadastro não viram alerta: o aluno está olhando a tela
      if (sub) {
        const baseline = baselineMilestone(sub);
        const others = Object.fromEntries(Object.entries(this.handled).filter(([id]) => id !== sub.id));
        this.handled = baseline ? { ...others, [sub.id]: baseline } : others;
        void this.deps.store.saveHandled(this.handled);
      }
      this.requestSeq += 1;
      this.applyStatus(status);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: queueErrorMessage(error) };
    }
  };

  cancel = async (): Promise<SubscribeResult> => {
    try {
      await this.deps.client.cancel();
      this.setState({ called: null, banner: null });
      await this.refresh();
      return { ok: true };
    } catch (error) {
      return { ok: false, message: queueErrorMessage(error) };
    }
  };

  updatePreferences = async (changes: QueuePreferencesRequest): Promise<SubscribeResult> => {
    const defaults = { ...this.state.defaults, ...changes };
    this.setState({ defaults });
    void this.deps.store.saveDefaults(defaults);
    const status = this.state.status;
    if (!status?.subscription || !isActiveSubscription(status.subscription)) return { ok: true };
    // otimista: a chave muda na hora; volta se o servidor recusar
    const previous = status.subscription;
    this.setState({ status: { ...status, subscription: { ...previous, preferences: { ...previous.preferences, ...changes } } } });
    try {
      const updated = await this.deps.client.updatePreferences(changes);
      const current = this.state.status;
      if (current) this.setState({ status: { ...current, subscription: updated } });
      return { ok: true };
    } catch (error) {
      const current = this.state.status;
      if (current?.subscription?.id === previous.id) this.setState({ status: { ...current, subscription: previous } });
      return { ok: false, message: queueErrorMessage(error) };
    }
  };

  /** "Ativar notificações": pede a permissão (só agora, com contexto) e registra o aparelho. */
  requestNotifications = async (): Promise<PushPermission> => {
    const permission = await this.deps.push.requestPermission().catch((): PushPermission => 'unavailable');
    this.setState({ push: { ...this.state.push, permission } });
    if (permission === 'granted') await this.registerPushToken();
    return permission;
  };

  private async registerPushToken() {
    const platform = this.deps.push.platform();
    if (!platform || platform === 'web') {
      this.setState({ push: { ...this.state.push, reason: 'web' } });
      return;
    }
    const { token, reason } = await this.deps.push.getToken();
    if (!token) {
      this.setState({ push: { ...this.state.push, registered: false, reason: reason ?? 'token_failed' } });
      return;
    }
    try {
      await this.deps.client.registerPushToken(token, platform);
      this.setState({ push: { ...this.state.push, registered: true, reason: null } });
    } catch {
      this.setState({ push: { ...this.state.push, registered: false, reason: 'token_failed' } });
    }
  }

  /** Simulação (fila local ou provider mock do backend). */
  simulate = async (control: { scenario?: MockScenario; advance?: boolean }): Promise<boolean> => {
    try {
      await this.deps.client.simulate(control);
      await this.refresh();
      return true;
    } catch {
      return false;
    }
  };
}
