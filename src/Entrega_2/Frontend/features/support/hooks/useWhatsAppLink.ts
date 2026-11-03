import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';

import { toApiClientError } from '../../../hooks/useResource';
import { isApiClientError, type ApiClientError } from '../../../services/apiClient';
import { haptics } from '../../../services/haptics';
import type { SupportContactVerificationView, SupportWhatsAppLinkState } from '../../../types/api';
import { getSupportApi } from '../api';
import { SUPPORT } from '../config';
import { supportErrorMessage } from '../errors';

export type WhatsAppLinkStep = 'loading' | 'error' | 'unavailable' | 'consent' | 'pending' | 'proven' | 'review' | 'restart' | 'linked';

export type WhatsAppLinkBusy = 'create' | 'confirm' | 'revoke' | null;

/** Código e atalho (que leva o código na URL) só vêm na resposta que cria o pedido: ficam só aqui, em memória. */
interface VerificationSecret {
  id: string;
  code: string | null;
  openUrl: string | null;
}

interface LinkModel {
  state: SupportWhatsAppLinkState | null;
  verification: SupportContactVerificationView | null;
  secret: VerificationSecret | null;
  /** pedido que o estudante abandonou ao começar de novo: não volta para a tela */
  dismissedId: string | null;
}

const INITIAL: LinkModel = { state: null, verification: null, secret: null, dismissedId: null };

const WHATSAPP_URL = /^https:\/\/(wa\.me|api\.whatsapp\.com)\//;

export function deriveWhatsAppLinkStep(state: SupportWhatsAppLinkState | null, verification: SupportContactVerificationView | null, failedToLoad: boolean): WhatsAppLinkStep {
  if (!state) return failedToLoad ? 'error' : 'loading';
  // Vínculo existente vem primeiro: o aviso de privacidade promete que ele pode ser desfeito a qualquer momento.
  if (state.links.length > 0) return 'linked';
  if (!state.available) return 'unavailable';
  switch (verification?.status) {
    case 'pending':
      return 'pending';
    case 'proven':
      return 'proven';
    case 'review_required':
      return 'review';
    case 'expired':
    case 'cancelled':
      return 'restart';
    case 'confirmed':
      // o servidor já confirmou: falta só recarregar o vínculo
      return failedToLoad ? 'error' : 'loading';
    default:
      return 'consent';
  }
}

/** Sem o código do pedido atual, nada de segredo guardado (em especial depois que ele deixa de estar pendente). */
function keepSecret(secret: VerificationSecret | null, verification: SupportContactVerificationView | null): VerificationSecret | null {
  return secret && verification?.status === 'pending' && secret.id === verification.id ? secret : null;
}

function withVerification(model: LinkModel, verification: SupportContactVerificationView): LinkModel {
  return { ...model, verification, secret: keepSecret(model.secret, verification) };
}

/** Une o estado vindo do servidor ao pedido em tela. `pending` do servidor só traz pedidos ainda abertos. */
function withState(model: LinkModel, state: SupportWhatsAppLinkState): LinkModel {
  const local = model.verification;
  const open = state.pending && state.pending.id !== model.dismissedId ? state.pending : null;
  let verification: SupportContactVerificationView | null = open;
  if (!open && local && local.id !== model.dismissedId && state.links.length === 0) {
    if (local.status === 'expired' || local.status === 'cancelled') verification = local;
    // estava em aberto na tela e o servidor não o considera mais aberto: não vale mais
    else if (local.status !== 'confirmed') verification = { ...local, status: 'expired' };
  }
  return { ...model, state, verification, secret: keepSecret(model.secret, verification) };
}

function linkErrorMessage(error: unknown, fallback: string): string {
  if (isApiClientError(error) && (error.kind === 'not_found' || error.kind === 'forbidden')) return fallback;
  return supportErrorMessage(error, fallback);
}

export interface WhatsAppLinkController {
  step: WhatsAppLinkStep;
  state: SupportWhatsAppLinkState | null;
  verification: SupportContactVerificationView | null;
  /** só depois de criar o pedido nesta tela; ao recarregar é null e o estudante pode começar de novo */
  code: string | null;
  openUrl: string | null;
  busy: WhatsAppLinkBusy;
  /** falha da última ação (mostrada junto do botão) */
  actionError: string | null;
  clearActionError: () => void;
  /** problema passageiro enquanto a tela continua útil (ex.: consulta sem conexão); some na próxima resposta */
  notice: string | null;
  loadError: ApiClientError | null;
  refreshing: boolean;
  refresh: () => void;
  /** cria o pedido: exige o aceite do aviso, dado na tela */
  start: () => void;
  /** volta ao aviso de privacidade, deixando para trás o pedido atual */
  restart: () => void;
  confirm: (linkPreviousTickets: boolean) => void;
  /** devolve true quando o vínculo foi desfeito */
  revoke: (linkId: string) => Promise<boolean>;
  openWhatsApp: () => void;
}

/**
 * Vinculação do WhatsApp: o estudante recebe um código no app e o envia do próprio WhatsApp ao número do ASA. Sem cache
 * local: o estado vem sempre do servidor e o código nunca sai da memória desta tela.
 */
export function useWhatsAppLink(): WhatsAppLinkController {
  const [model, setModel] = useState<LinkModel>(INITIAL);
  const [loadError, setLoadError] = useState<ApiClientError | null>(null);
  const [version, setVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<WhatsAppLinkBusy>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [appActive, setAppActive] = useState(() => AppState.currentState !== 'background');
  // Uma ação do estudante muda o estado no servidor: leitura iniciada antes dela chega velha e é descartada.
  const loadSeq = useRef(0);

  const { state, verification, secret } = model;
  const step = deriveWhatsAppLinkStep(state, verification, loadError !== null);
  const pollId = step === 'pending' ? (verification?.id ?? null) : null;
  const expiresAt = verification?.expiresAt ?? null;

  useEffect(() => {
    let active = true;
    const seq = ++loadSeq.current;
    getSupportApi()
      .getWhatsAppLink()
      .then((next) => {
        if (!active || seq !== loadSeq.current) return;
        setLoadError(null);
        setNotice(null);
        setModel((current) => withState(current, next));
      })
      .catch((caught: unknown) => {
        if (!active || seq !== loadSeq.current) return;
        setLoadError(toApiClientError(caught));
        setNotice(linkErrorMessage(caught, 'Não conseguimos atualizar agora. Tente novamente.'));
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [version]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const active = next === 'active';
      setAppActive(active);
      // De volta ao app: o pedido em tela pode ter expirado ou mudado enquanto ele esteve em segundo plano.
      if (active) setVersion((value) => value + 1);
    });
    return () => subscription.remove();
  }, []);

  // Enquanto o código não chega: consulta o pedido, só com a tela aberta e o app em primeiro plano.
  useEffect(() => {
    if (!pollId || !appActive) return undefined;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    const tick = () => {
      getSupportApi()
        .getWhatsAppVerification(pollId)
        .then((next) => {
          if (!active) return;
          failures = 0;
          setNotice(null);
          setModel((current) => withVerification(current, next));
          if (next.status === 'confirmed') setVersion((value) => value + 1);
          if (next.status === 'pending') timer = setTimeout(tick, SUPPORT.WHATSAPP_POLL_MS);
        })
        .catch((caught: unknown) => {
          if (!active) return;
          const error = toApiClientError(caught);
          // Pedido que sumou, ou prazo vencido sem conexão: a tela não fica esperando por algo que não vai acontecer.
          const lapsed = error.kind === 'not_found' || (expiresAt !== null && Date.parse(expiresAt) <= Date.now());
          if (lapsed) {
            setModel((current) => (current.verification ? withVerification(current, { ...current.verification, status: 'expired' }) : current));
            return;
          }
          failures += 1;
          setNotice(linkErrorMessage(error, 'Não conseguimos atualizar agora. Vamos continuar tentando.'));
          const retryAfter = error.kind === 'rate_limited' ? (error.retryAfterSeconds ?? 0) * 1000 : 0;
          const backoff = Math.min(SUPPORT.WHATSAPP_POLL_MS * 2 ** failures, SUPPORT.EVENTS_MAX_BACKOFF_MS);
          timer = setTimeout(tick, Math.max(retryAfter, backoff));
        });
    };
    timer = setTimeout(tick, SUPPORT.WHATSAPP_POLL_MS);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [appActive, expiresAt, pollId]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setVersion((value) => value + 1);
  }, []);

  const consentVersion = state?.consentVersion ?? null;
  const start = useCallback(() => {
    if (!consentVersion) return;
    setBusy('create');
    setActionError(null);
    loadSeq.current += 1;
    getSupportApi()
      .createWhatsAppVerification({ consentAccepted: true, consentVersion })
      .then((view) => {
        loadSeq.current += 1;
        const nextSecret: VerificationSecret = { id: view.id, code: view.code, openUrl: view.openUrl && WHATSAPP_URL.test(view.openUrl) ? view.openUrl : null };
        // O pedido em tela não carrega o código: só `secret` guarda essa informação.
        setModel((current) => ({ ...current, verification: { ...view, code: null, openUrl: null }, secret: nextSecret }));
      })
      .catch((caught: unknown) => {
        haptics.error();
        setActionError(supportErrorMessage(caught, 'Não conseguimos gerar o código. Tente novamente.'));
        // Aviso de privacidade novo ou canal desligado: a tela precisa do estado atual do servidor.
        if (isApiClientError(caught) && caught.status === 409) setVersion((value) => value + 1);
      })
      .finally(() => setBusy(null));
  }, [consentVersion]);

  const restart = useCallback(() => {
    setActionError(null);
    setNotice(null);
    setModel((current) => ({ ...current, verification: null, secret: null, dismissedId: current.verification?.id ?? current.dismissedId }));
  }, []);

  const verificationId = verification?.id ?? null;
  const confirm = useCallback(
    (linkPreviousTickets: boolean) => {
      if (!verificationId) return;
      setBusy('confirm');
      setActionError(null);
      loadSeq.current += 1;
      getSupportApi()
        .confirmWhatsAppVerification(verificationId, { linkPreviousTickets })
        .then((next) => {
          loadSeq.current += 1;
          if (next.links.length > 0) haptics.success();
          setModel((current) => withState({ ...current, verification: null, secret: null }, next));
        })
        .catch((caught: unknown) => {
          haptics.error();
          setActionError(linkErrorMessage(caught, 'Este pedido não está mais disponível. Comece de novo.'));
          if (isApiClientError(caught) && caught.reason === 'verification_not_ready') {
            // A situação real do pedido decide a tela; sem resposta, ele é tratado como vencido.
            getSupportApi()
              .getWhatsAppVerification(verificationId)
              .then((view) => setModel((current) => withVerification(current, view)))
              .catch(() => setModel((current) => (current.verification ? withVerification(current, { ...current.verification, status: 'expired' }) : current)));
          }
        })
        .finally(() => setBusy(null));
    },
    [verificationId],
  );

  const revoke = useCallback(async (linkId: string): Promise<boolean> => {
    setBusy('revoke');
    setActionError(null);
    loadSeq.current += 1;
    try {
      const next = await getSupportApi().revokeWhatsAppLink(linkId);
      loadSeq.current += 1;
      setModel((current) => withState({ ...current, verification: null, secret: null }, next));
      return true;
    } catch (caught) {
      haptics.error();
      setActionError(linkErrorMessage(caught, 'Não encontramos este vínculo. Atualize a tela e tente novamente.'));
      return false;
    } finally {
      setBusy(null);
    }
  }, []);

  const openUrl = secret?.openUrl ?? null;
  const openWhatsApp = useCallback(() => {
    if (!openUrl) return;
    setActionError(null);
    Linking.openURL(openUrl).catch(() => setActionError('Não conseguimos abrir o WhatsApp. Envie o código para o número acima.'));
  }, [openUrl]);

  const clearActionError = useCallback(() => setActionError(null), []);

  return { step, state, verification, code: secret?.code ?? null, openUrl, busy, actionError, clearActionError, notice, loadError, refreshing, refresh, start, restart, confirm, revoke, openWhatsApp };
}
