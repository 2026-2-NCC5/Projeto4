import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';

import { request } from '../../services/apiClient';
import type { PushTestResult } from '../../types/api';
import { getExpoPushToken, getPushPermission, pushPlatform, requestPushPermission, type PushPermission } from '../queue/services/pushNotifications';

/**
 * Push para TODA a conta (não só a fila presencial): depois do login o aparelho é registrado em
 * POST /api/notifications/push-token, e passa a receber respostas de chamados, lembretes de agendamento e os
 * avisos que a equipe do ASA envia. A permissão do sistema só é pedida quando o aluno toca em "Ativar".
 */
export const PUSH_ROUTES = { token: '/api/notifications/push-token', test: '/api/notifications/push-test' } as const;

/** registered: este aparelho recebe push · needs_permission: falta o aluno ativar · denied: bloqueado nas configurações · unavailable: web, Expo Go ou build sem push */
export type PushRegistrationStatus = 'checking' | 'registered' | 'needs_permission' | 'denied' | 'unavailable';

const DISMISS_KEY = 'asa.push.optInDismissedAt';
/** O cartão volta depois de 14 dias se o aluno dispensou sem ativar. */
const DISMISS_DAYS = 14;

let registeredToken: string | null = null;

function fromPermission(permission: PushPermission): PushRegistrationStatus | null {
  if (permission === 'unavailable') return 'unavailable';
  if (permission === 'denied') return 'denied';
  if (permission === 'undetermined') return 'needs_permission';
  return null;
}

/** Registra o aparelho se a permissão já existe (sem pedir nada). Chamado no login e ao voltar para o app. */
export async function syncPushRegistration(): Promise<PushRegistrationStatus> {
  const platform = pushPlatform();
  if (!platform) return 'unavailable';
  const blocked = fromPermission(await getPushPermission());
  if (blocked) return blocked;
  const { token } = await getExpoPushToken();
  if (!token) return 'unavailable';
  if (registeredToken !== token) {
    await request<void>(PUSH_ROUTES.token, { method: 'POST', body: { token, platform } });
    registeredToken = token;
  }
  return 'registered';
}

/** O aluno tocou em "Ativar notificações": pede a permissão, registra e manda um push de teste. */
export async function enablePushNotifications(): Promise<PushRegistrationStatus> {
  const permission = await requestPushPermission();
  const blocked = fromPermission(permission);
  if (blocked) return blocked === 'needs_permission' ? 'denied' : blocked;
  const status = await syncPushRegistration();
  if (status === 'registered') await sendTestPush().catch(() => undefined);
  return status;
}

export function sendTestPush(): Promise<PushTestResult> {
  return request<PushTestResult>(PUSH_ROUTES.test, { method: 'POST' });
}

/** No logout: o aparelho deixa de receber os pushes desta conta (melhor esforço; nunca bloqueia a saída). */
export async function unregisterPushDevice(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  await Promise.race([
    request<void>(PUSH_ROUTES.token, { method: 'DELETE', body: { token } }).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
}

export async function wasOptInDismissed(now = Date.now()): Promise<boolean> {
  const raw = await AsyncStorage.getItem(DISMISS_KEY).catch(() => null);
  const at = raw ? Number(raw) : 0;
  return Number.isFinite(at) && at > 0 && now - at < DISMISS_DAYS * 86_400_000;
}

export async function dismissOptIn(now = Date.now()): Promise<void> {
  await AsyncStorage.setItem(DISMISS_KEY, String(now)).catch(() => undefined);
}

export function openNotificationSettings(): void {
  void Linking.openSettings().catch(() => undefined);
}

/** Estado do push na área autenticada: sincroniza ao abrir e ao voltar para o app. */
export function usePushRegistration(enabled = true) {
  const [status, setStatus] = useState<PushRegistrationStatus>('checking');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  const sync = useCallback(async () => {
    const next = await syncPushRegistration().catch((): PushRegistrationStatus => 'unavailable');
    if (alive.current) setStatus(next);
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!enabled) return undefined;
    void sync();
    // quem ativou nas configurações do sistema volta para o app já registrado
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    return () => {
      alive.current = false;
      subscription.remove();
    };
  }, [enabled, sync]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const next = await enablePushNotifications().catch((): PushRegistrationStatus => 'unavailable');
      if (alive.current) setStatus(next);
      return next;
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  return { status, busy, enable, refresh: sync };
}
