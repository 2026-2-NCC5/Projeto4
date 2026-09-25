import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { BiometricError } from './authErrors';

/**
 * Biometria do dispositivo (Face ID, Touch ID, impressão digital…).
 *
 * Modelo de segurança: a biometria NÃO substitui a senha no servidor. Após consentimento, a API emite
 * uma credencial de dispositivo (aleatória, revogável, com validade) que fica no expo-secure-store com
 * `requireAuthentication` — o próprio sistema operacional exige a biometria para liberá-la. A senha
 * nunca é armazenada. Metadados não sensíveis (id da credencial, nome, e-mail, tipo) ficam em uma chave
 * separada, sem autenticação, apenas para a tela de login saber que a opção existe.
 */

export type BiometricKind = 'face' | 'fingerprint' | 'iris' | 'generic';

export type BiometricUnavailableReason =
  | 'web'
  | 'expo_go_ios'
  | 'policy_disabled'
  | 'no_hardware'
  | 'not_enrolled'
  | 'secure_store_unsupported'
  | 'error';

export type BiometricIconName = 'scan-outline' | 'finger-print' | 'eye-outline';

export interface BiometricAvailability {
  status: 'checking' | 'available' | 'unavailable';
  kind: BiometricKind | null;
  /** Nome exibido: "Face ID", "Touch ID", "impressão digital", "reconhecimento facial", "íris", "biometria". */
  label: string;
  iconName: BiometricIconName;
  reason?: BiometricUnavailableReason;
}

export interface BiometricMeta {
  credentialId: string;
  userId: string;
  fullName: string;
  email: string;
  kind: BiometricKind;
}

export const BIOMETRIC_KEYS = {
  credential: 'asa.biometric.credential',
  meta: 'asa.biometric.meta',
} as const;

export const BIOMETRIC_OFFER_DECLINED_PREFIX = 'asa.biometric.offerDeclined.';

export const BIOMETRIC_PROMPTS = {
  enroll: 'Confirme para ativar o acesso por biometria',
  unlock: 'Entre no ASA Conecta',
  cancel: 'Cancelar',
} as const;

export const CHECKING_BIOMETRICS: BiometricAvailability = Object.freeze({
  status: 'checking',
  kind: null,
  label: 'biometria',
  iconName: 'finger-print',
});

function unavailable(reason: BiometricUnavailableReason): BiometricAvailability {
  return { status: 'unavailable', kind: null, label: 'biometria', iconName: 'finger-print', reason };
}

/** Descreve os tipos suportados pelo aparelho com os nomes usados em cada plataforma. */
export function describeBiometricTypes(
  types: readonly LocalAuthentication.AuthenticationType[],
  platformOS: string,
): Pick<BiometricAvailability, 'kind' | 'label' | 'iconName'> {
  const unique = new Set(types);
  const hasFace = unique.has(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const hasFingerprint = unique.has(LocalAuthentication.AuthenticationType.FINGERPRINT);
  const hasIris = unique.has(LocalAuthentication.AuthenticationType.IRIS);

  if (platformOS === 'ios') {
    if (hasFace) return { kind: 'face', label: 'Face ID', iconName: 'scan-outline' };
    if (hasFingerprint) return { kind: 'fingerprint', label: 'Touch ID', iconName: 'finger-print' };
    return { kind: 'generic', label: 'biometria', iconName: 'finger-print' };
  }

  if (unique.size !== 1) return { kind: 'generic', label: 'biometria', iconName: 'finger-print' };
  if (hasFingerprint) return { kind: 'fingerprint', label: 'impressão digital', iconName: 'finger-print' };
  if (hasFace) return { kind: 'face', label: 'reconhecimento facial', iconName: 'scan-outline' };
  if (hasIris) return { kind: 'iris', label: 'íris', iconName: 'eye-outline' };
  return { kind: 'generic', label: 'biometria', iconName: 'finger-print' };
}

/** Dependências nativas — injetáveis nos testes. */
export interface BiometricEnvironment {
  platformOS: string;
  executionEnvironment: string | undefined;
  hasHardware: () => Promise<boolean>;
  isEnrolled: () => Promise<boolean>;
  supportedTypes: () => Promise<LocalAuthentication.AuthenticationType[]>;
  canUseSecureStoreBiometrics: () => boolean;
}

export function defaultBiometricEnvironment(): BiometricEnvironment {
  return {
    platformOS: Platform.OS,
    executionEnvironment: Constants.executionEnvironment,
    hasHardware: () => LocalAuthentication.hasHardwareAsync(),
    isEnrolled: () => LocalAuthentication.isEnrolledAsync(),
    supportedTypes: () => LocalAuthentication.supportedAuthenticationTypesAsync(),
    canUseSecureStoreBiometrics: () => SecureStore.canUseBiometricAuthentication(),
  };
}

/**
 * Disponível somente quando: plataforma nativa; não é Expo Go no iOS (sem NSFaceIDUsageDescription);
 * política permite; há hardware; há biometria cadastrada; o SecureStore aceita `requireAuthentication`.
 */
export async function getBiometricAvailability(
  { policyEnabled }: { policyEnabled: boolean | (() => Promise<boolean>) },
  env: BiometricEnvironment = defaultBiometricEnvironment(),
): Promise<BiometricAvailability> {
  if (env.platformOS === 'web') return unavailable('web');
  if (env.platformOS === 'ios' && env.executionEnvironment === ExecutionEnvironment.StoreClient) return unavailable('expo_go_ios');
  try {
    if (!(await env.hasHardware())) return unavailable('no_hardware');
    if (!(await env.isEnrolled())) return unavailable('not_enrolled');
    if (!env.canUseSecureStoreBiometrics()) return unavailable('secure_store_unsupported');
    // A política (rede) só é consultada quando o aparelho é capaz.
    const allowed = typeof policyEnabled === 'function' ? await policyEnabled() : policyEnabled;
    if (!allowed) return unavailable('policy_disabled');
    const types = await env.supportedTypes();
    return { status: 'available', ...describeBiometricTypes(types, env.platformOS) };
  } catch {
    return unavailable('error');
  }
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const { message, code } = error as { message?: unknown; code?: unknown };
    return `${typeof code === 'string' ? code : ''} ${typeof message === 'string' ? message : ''}`;
  }
  return '';
}

/** Classifica falhas do SecureStore com `requireAuthentication` (mensagens nativas iOS/Android). */
export function classifySecureStoreError(error: unknown): 'cancelled' | 'invalidated' | 'failed' {
  const text = errorText(error).toLowerCase();
  if (/cancel/.test(text)) return 'cancelled';
  if (/invalidat|biometry.*chang|key.*permanently|keypermanently/.test(text)) return 'invalidated';
  return 'failed';
}

const CANCEL_ERRORS: readonly string[] = ['user_cancel', 'system_cancel', 'app_cancel', 'user_fallback'];

/** Prompt de consentimento para ativar a biometria. Lança BiometricError (cancelado/falhou). */
export async function confirmBiometricEnrollment(): Promise<void> {
  let result: LocalAuthentication.LocalAuthenticationResult;
  try {
    result = await LocalAuthentication.authenticateAsync({
      promptMessage: BIOMETRIC_PROMPTS.enroll,
      cancelLabel: BIOMETRIC_PROMPTS.cancel,
      disableDeviceFallback: false,
    });
  } catch {
    throw new BiometricError('BIOMETRIC_FAILED');
  }
  if (result.success) return;
  throw new BiometricError(CANCEL_ERRORS.includes(result.error) ? 'BIOMETRIC_CANCELLED' : 'BIOMETRIC_FAILED');
}

function isBiometricKind(value: unknown): value is BiometricKind {
  return value === 'face' || value === 'fingerprint' || value === 'iris' || value === 'generic';
}

export async function loadBiometricMeta(): Promise<BiometricMeta | null> {
  if (Platform.OS === 'web') return null;
  try {
    const raw = await SecureStore.getItemAsync(BIOMETRIC_KEYS.meta);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BiometricMeta>;
    if (
      typeof parsed.credentialId !== 'string' ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.fullName !== 'string' ||
      typeof parsed.email !== 'string' ||
      !isBiometricKind(parsed.kind)
    ) {
      return null;
    }
    return { credentialId: parsed.credentialId, userId: parsed.userId, fullName: parsed.fullName, email: parsed.email, kind: parsed.kind };
  } catch {
    return null;
  }
}

/** Grava a credencial protegida por biometria e, só depois, os metadados. */
export async function saveBiometricCredential(credential: string, meta: BiometricMeta): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_KEYS.credential, credential, {
    requireAuthentication: true,
    authenticationPrompt: BIOMETRIC_PROMPTS.unlock,
  });
  await SecureStore.setItemAsync(BIOMETRIC_KEYS.meta, JSON.stringify(meta));
}

/**
 * Lê a credencial — o sistema operacional exibe o prompt de biometria.
 * Cancelado → BIOMETRIC_CANCELLED; chave invalidada (biometria do aparelho alterada: o SecureStore
 * devolve null ou lança) → limpa tudo e BIOMETRIC_INVALIDATED; demais falhas → BIOMETRIC_FAILED.
 */
export async function readBiometricCredential(): Promise<string> {
  let credential: string | null;
  try {
    credential = await SecureStore.getItemAsync(BIOMETRIC_KEYS.credential, {
      requireAuthentication: true,
      authenticationPrompt: BIOMETRIC_PROMPTS.unlock,
    });
  } catch (error) {
    const kind = classifySecureStoreError(error);
    if (kind === 'cancelled') throw new BiometricError('BIOMETRIC_CANCELLED');
    if (kind === 'invalidated') {
      await clearBiometricCredential();
      throw new BiometricError('BIOMETRIC_INVALIDATED');
    }
    throw new BiometricError('BIOMETRIC_FAILED');
  }
  if (!credential) {
    await clearBiometricCredential();
    throw new BiometricError('BIOMETRIC_INVALIDATED');
  }
  return credential;
}

export async function clearBiometricCredential(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Promise.allSettled([SecureStore.deleteItemAsync(BIOMETRIC_KEYS.credential), SecureStore.deleteItemAsync(BIOMETRIC_KEYS.meta)]);
}

/** "Agora não" fica registrado por usuário (flag não sensível). */
export async function hasDeclinedBiometricOffer(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(`${BIOMETRIC_OFFER_DECLINED_PREFIX}${userId}`)) === '1';
  } catch {
    return false;
  }
}

export async function setBiometricOfferDeclined(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${BIOMETRIC_OFFER_DECLINED_PREFIX}${userId}`, '1');
  } catch {
    // best-effort: no pior caso a oferta aparece de novo no próximo login
  }
}

export const biometricService = {
  describeBiometricTypes,
  getBiometricAvailability,
  classifySecureStoreError,
  confirmBiometricEnrollment,
  loadBiometricMeta,
  saveBiometricCredential,
  readBiometricCredential,
  clearBiometricCredential,
  hasDeclinedBiometricOffer,
  setBiometricOfferDeclined,
};
