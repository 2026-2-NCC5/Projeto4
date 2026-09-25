import { normalizeAuthPolicy } from '../config/authPolicy';
import { API_ROUTES, TIMEOUTS } from '../config/services';
import type {
  AuthPolicy,
  AuthSession,
  BiometricEnrollRequest,
  BiometricEnrollResponse,
  BiometricLoginRequest,
  BiometricRevokeRequest,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LogoutRequest,
  ProgramOption,
  RefreshRequest,
  RegisterRequest,
  ResendResetCodeRequest,
  ResendResetCodeResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
  VerifyResetCodeRequest,
  VerifyResetCodeResponse,
} from '../types/api';
import { normalizeEmail } from '../utils/authValidation';

import { request } from './apiClient';

/**
 * Chamadas de autenticação. Rotas públicas usam `auth: false` (nunca enviam nem invalidam a sessão);
 * enroll/revoke de biometria exigem Bearer. Senhas e credenciais só trafegam no corpo, nunca em logs.
 */

export async function login(email: string, password: string, rememberMe = false): Promise<AuthSession> {
  const body: LoginRequest = { email: normalizeEmail(email), password, rememberMe };
  return request<AuthSession>(API_ROUTES.auth.login, { method: 'POST', body, auth: false });
}

export async function register(input: RegisterRequest): Promise<AuthSession> {
  const body: RegisterRequest = {
    fullName: input.fullName.trim().replace(/\s+/g, ' '),
    email: normalizeEmail(input.email),
    password: input.password,
    registrationNumber: input.registrationNumber.trim(),
    programCode: input.programCode ?? null,
    rememberMe: input.rememberMe ?? false,
  };
  return request<AuthSession>(API_ROUTES.auth.register, { method: 'POST', body, auth: false });
}

export async function refresh(refreshToken: string): Promise<AuthSession> {
  const body: RefreshRequest = { refreshToken };
  return request<AuthSession>(API_ROUTES.auth.refresh, { method: 'POST', body, auth: false });
}

/** Logout é best-effort: aceita token expirado, tem timeout curto e nunca encerra a sessão local por 401. */
export async function logout(refreshToken?: string): Promise<void> {
  const body: LogoutRequest = refreshToken ? { refreshToken } : {};
  await request<void>(API_ROUTES.auth.logout, { method: 'POST', body, auth: 'optional', timeoutMs: TIMEOUTS.LOGOUT_TIMEOUT_MS });
}

export async function getPolicy(): Promise<AuthPolicy> {
  return normalizeAuthPolicy(await request<unknown>(API_ROUTES.auth.policy, { auth: false }));
}

export async function getPrograms(): Promise<ProgramOption[]> {
  const data = await request<unknown>(API_ROUTES.auth.programs, { auth: false });
  if (!Array.isArray(data)) return [];
  return data.filter(
    (item): item is ProgramOption =>
      typeof item === 'object' && item !== null && typeof (item as ProgramOption).code === 'string' && typeof (item as ProgramOption).name === 'string',
  );
}

export async function forgotPassword(email: string): Promise<ForgotPasswordResponse> {
  const body: ForgotPasswordRequest = { email: normalizeEmail(email) };
  return request<ForgotPasswordResponse>(API_ROUTES.auth.forgotPassword, { method: 'POST', body, auth: false });
}

export async function resendResetCode(email: string): Promise<ResendResetCodeResponse> {
  const body: ResendResetCodeRequest = { email: normalizeEmail(email) };
  return request<ResendResetCodeResponse>(API_ROUTES.auth.resendResetCode, { method: 'POST', body, auth: false });
}

export async function verifyResetCode(email: string, code: string): Promise<VerifyResetCodeResponse> {
  const body: VerifyResetCodeRequest = { email: normalizeEmail(email), code };
  return request<VerifyResetCodeResponse>(API_ROUTES.auth.verifyResetCode, { method: 'POST', body, auth: false });
}

export async function resetPassword(resetToken: string, newPassword: string): Promise<ResetPasswordResponse> {
  const body: ResetPasswordRequest = { resetToken, newPassword };
  return request<ResetPasswordResponse>(API_ROUTES.auth.resetPassword, { method: 'POST', body, auth: false });
}

export async function biometricEnroll(deviceLabel?: string): Promise<BiometricEnrollResponse> {
  const body: BiometricEnrollRequest = deviceLabel ? { deviceLabel } : {};
  return request<BiometricEnrollResponse>(API_ROUTES.auth.biometricEnroll, { method: 'POST', body, auth: true });
}

export async function biometricLogin(credentialId: string, credential: string): Promise<AuthSession> {
  const body: BiometricLoginRequest = { credentialId, credential };
  return request<AuthSession>(API_ROUTES.auth.biometricLogin, { method: 'POST', body, auth: false });
}

/** Revogação best-effort: `auth: 'optional'` evita encerrar a sessão local se o token já expirou. */
export async function biometricRevoke(credentialId: string): Promise<void> {
  const body: BiometricRevokeRequest = { credentialId };
  await request<void>(API_ROUTES.auth.biometricRevoke, { method: 'POST', body, auth: 'optional', timeoutMs: TIMEOUTS.LOGOUT_TIMEOUT_MS });
}

export const authService = {
  login,
  register,
  refresh,
  logout,
  getPolicy,
  getPrograms,
  forgotPassword,
  resendResetCode,
  verifyResetCode,
  resetPassword,
  biometricEnroll,
  biometricLogin,
  biometricRevoke,
};
