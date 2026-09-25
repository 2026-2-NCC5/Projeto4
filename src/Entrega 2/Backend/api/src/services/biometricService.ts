import { randomToken, safeEqualHex, sha256Hex } from '../auth/secrets.js';
import type { AppConfig } from '../config/env.js';
import type { Logger } from '../config/logger.js';
import type { AuthSession, BiometricEnrollResponse } from '../contracts/mobileApi.v1.js';
import { NotFoundError, UnauthorizedError } from '../errors/AppError.js';
import type { Repositories } from '../repositories/types.js';
import type { AuthContext } from '../types/domain.js';
import type { AuthService } from './authService.js';

export const MAX_ACTIVE_DEVICE_CREDENTIALS = 5;

/**
 * Login biométrico sem senha armazenada: o app guarda uma credencial de dispositivo aleatória
 * no armazenamento seguro protegido pela biometria do sistema; a API guarda apenas o hash.
 * A credencial expira (janela deslizante), é revogável e é revogada na redefinição de senha.
 */
export class BiometricService {
  constructor(
    private readonly repos: Repositories,
    private readonly authService: AuthService,
    private readonly config: AppConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private ttlMs(): number {
    return this.config.auth.biometric.credentialTtlDays * 86_400_000;
  }

  private ensureEnabled(): void {
    if (!this.config.auth.biometric.enabled) throw new NotFoundError('O acesso por biometria está desabilitado neste ambiente.');
  }

  async enroll(auth: AuthContext, deviceLabel: string | undefined, logger: Logger): Promise<BiometricEnrollResponse> {
    this.ensureEnabled();
    const user = await this.repos.users.findById(auth.userId);
    if (!user || !user.isActive) throw new UnauthorizedError('Sessão inválida.', 'session_revoked');
    const credential = randomToken(48);
    const record = await this.repos.deviceCredentials.create({
      userId: user.id,
      tokenHash: sha256Hex(credential),
      deviceLabel: deviceLabel?.trim() || null,
      expiresAt: new Date(this.now().getTime() + this.ttlMs()),
    });
    await this.repos.deviceCredentials.revokeOldestBeyond(user.id, MAX_ACTIVE_DEVICE_CREDENTIALS);
    logger.info({ user_id: user.id, credential_id: record.id, status: 'biometric_enrolled' }, 'device credential issued');
    return { credentialId: record.id, credential, expiresInSeconds: Math.floor(this.ttlMs() / 1000) };
  }

  async login(credentialId: string, credential: string, logger: Logger): Promise<AuthSession> {
    this.ensureEnabled();
    const invalid = () => new UnauthorizedError('Credencial biométrica inválida.', 'biometric_credential_invalid');
    const record = await this.repos.deviceCredentials.findById(credentialId);
    const now = this.now();
    if (!record || record.revokedAt || record.expiresAt.getTime() <= now.getTime() || !safeEqualHex(sha256Hex(credential), record.tokenHash)) {
      logger.warn({ credential_id: credentialId, status: 'biometric_login_rejected' }, 'biometric login rejected');
      throw invalid();
    }
    const user = await this.repos.users.findById(record.userId);
    if (!user || !user.isActive) throw invalid();
    await this.repos.deviceCredentials.touch(record.id, { lastUsedAt: now, expiresAt: new Date(now.getTime() + this.ttlMs()) });
    return this.authService.issueSession(user, true);
  }

  async revoke(auth: AuthContext, credentialId: string): Promise<void> {
    await this.repos.deviceCredentials.revoke(credentialId, auth.userId);
  }
}
