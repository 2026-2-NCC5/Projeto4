import bcrypt from 'bcryptjs';
import { passwordErrorDetails, unmetPasswordRequirements } from '../auth/passwordPolicy.js';
import { FixedWindowLimiter } from '../auth/rateLimiter.js';
import { hmacHex, numericCode, randomToken, safeEqualHex, sha256Hex } from '../auth/secrets.js';
import type { AppConfig } from '../config/env.js';
import type { Logger } from '../config/logger.js';
import type { ForgotPasswordResponse, ResetPasswordResponse, VerifyResetCodeResponse } from '../contracts/mobileApi.v1.js';
import { DependencyError, ValidationError } from '../errors/AppError.js';
import type { Mailer } from '../mail/mailer.js';
import { passwordResetCodeEmail } from '../mail/templates.js';
import type { Repositories } from '../repositories/types.js';
import type { UserRecord } from '../types/domain.js';
import { normalizeEmail } from './authService.js';

export const GENERIC_RECOVERY_MESSAGE = 'Se encontrarmos uma conta vinculada a esse e-mail, você receberá as instruções para continuar.';

/**
 * Recuperação de senha por código enviado ao e-mail.
 *
 * Proteções: respostas idênticas para e-mails existentes ou não; código numérico guardado
 * apenas como HMAC; expiração; limite de tentativas por código (simulado também para
 * e-mails inexistentes); cooldown e limite de reenvios por solicitação; token de redefinição
 * de uso único e curta validade; redefinição revoga sessões e credenciais biométricas.
 */
export class PasswordResetService {
  private readonly phantomAttempts: FixedWindowLimiter;

  constructor(
    private readonly repos: Repositories,
    private readonly config: AppConfig,
    private readonly mailer: Mailer,
    private readonly now: () => Date = () => new Date(),
  ) {
    const { resetCode } = config.auth;
    this.phantomAttempts = new FixedWindowLimiter({ windowMs: resetCode.ttlMinutes * 60_000, max: resetCode.maxAttempts }, () => this.now().getTime());
  }

  private genericResponse(): ForgotPasswordResponse {
    const { resetCode } = this.config.auth;
    return {
      message: GENERIC_RECOVERY_MESSAGE,
      codeLength: resetCode.length,
      expiresInSeconds: resetCode.ttlMinutes * 60,
      resendAvailableInSeconds: resetCode.resendCooldownSeconds,
    };
  }

  private ensureAvailable(): void {
    if (!this.mailer.available) {
      throw new DependencyError('A recuperação de senha está indisponível no momento.', undefined, 'recovery_unavailable');
    }
  }

  private codeHash(userId: string, code: string): string {
    return hmacHex(this.config.jwt.secret, `password-reset:${userId}:${code}`);
  }

  async requestCode(email: string, logger: Logger): Promise<ForgotPasswordResponse> {
    this.ensureAvailable();
    const user = await this.repos.users.findByEmail(normalizeEmail(email));
    if (user && user.isActive) {
      await this.issueCode(user, logger);
    } else {
      this.codeHash('00000000-0000-0000-0000-000000000000', numericCode(this.config.auth.resetCode.length));
      logger.info({ status: 'reset_code_skipped' }, 'password reset requested');
    }
    return this.genericResponse();
  }

  private async issueCode(user: UserRecord, logger: Logger): Promise<void> {
    const { resetCode } = this.config.auth;
    const now = this.now();
    const code = numericCode(resetCode.length);
    const codeExpiresAt = new Date(now.getTime() + resetCode.ttlMinutes * 60_000);
    const active = await this.repos.passwordResets.findActiveByUser(user.id);

    if (active && !active.verifiedAt) {
      if (now.getTime() - active.lastSentAt.getTime() < resetCode.resendCooldownSeconds * 1000) {
        logger.info({ user_id: user.id, status: 'reset_code_cooldown' }, 'password reset code not resent (cooldown)');
        return;
      }
      if (active.sendCount >= resetCode.maxSends) {
        logger.warn({ user_id: user.id, status: 'reset_code_send_limit' }, 'password reset code send limit reached');
        return;
      }
      await this.repos.passwordResets.replaceCode(active.id, { codeHash: this.codeHash(user.id, code), codeExpiresAt, now });
    } else {
      await this.repos.passwordResets.create({ userId: user.id, codeHash: this.codeHash(user.id, code), codeExpiresAt, now });
    }

    // Envio sem aguardar: o tempo de resposta não depende da existência da conta.
    void this.mailer
      .send(passwordResetCodeEmail({ to: user.email, fullName: user.fullName, code, ttlMinutes: resetCode.ttlMinutes }))
      .then(() => logger.info({ user_id: user.id, status: 'reset_code_sent' }, 'password reset code sent'))
      .catch((error: unknown) =>
        logger.error({ user_id: user.id, status: 'mail_failed', error_type: error instanceof Error ? error.name : 'unknown' }, 'password reset email failed'),
      );
  }

  async verifyCode(email: string, code: string): Promise<VerifyResetCodeResponse> {
    const { resetCode } = this.config.auth;
    const normalized = normalizeEmail(email);
    const user = await this.repos.users.findByEmail(normalized);
    const reset = user?.isActive ? await this.repos.passwordResets.findActiveByUser(user.id) : null;

    if (!user || !reset || reset.verifiedAt) {
      const phantom = this.phantomAttempts.hit(normalized);
      if (phantom.remaining <= 0) throw codeLocked();
      throw codeInvalid(phantom.remaining);
    }
    if (reset.attempts >= resetCode.maxAttempts) throw codeLocked();

    // A expiração só é revelada a quem acertou o código.
    if (!safeEqualHex(this.codeHash(user.id, code), reset.codeHash)) {
      const attempts = await this.repos.passwordResets.recordFailedAttempt(reset.id);
      const remaining = resetCode.maxAttempts - attempts;
      if (remaining <= 0) throw codeLocked();
      throw codeInvalid(remaining);
    }
    const now = this.now();
    if (reset.codeExpiresAt.getTime() <= now.getTime()) {
      throw new ValidationError('Código expirado.', undefined, { reason: 'code_expired' });
    }

    const resetToken = randomToken(32);
    const ttlSeconds = this.config.auth.resetTokenTtlMinutes * 60;
    await this.repos.passwordResets.markVerified(reset.id, {
      resetTokenHash: sha256Hex(resetToken),
      resetTokenExpiresAt: new Date(now.getTime() + ttlSeconds * 1000),
      now,
    });
    return { resetToken, expiresInSeconds: ttlSeconds };
  }

  async resetPassword(resetToken: string, newPassword: string, logger: Logger): Promise<ResetPasswordResponse> {
    const unmet = unmetPasswordRequirements(newPassword);
    if (unmet.length > 0) {
      throw new ValidationError('A nova senha não atende à política.', passwordErrorDetails('newPassword', unmet), { reason: 'weak_password' });
    }
    const now = this.now();
    const reset = await this.repos.passwordResets.findByResetTokenHash(sha256Hex(resetToken));
    const invalid = () => new ValidationError('Solicitação de redefinição inválida ou expirada.', undefined, { reason: 'reset_token_invalid' });
    if (!reset || reset.usedAt || reset.invalidatedAt || !reset.resetTokenExpiresAt || reset.resetTokenExpiresAt.getTime() <= now.getTime()) {
      throw invalid();
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const completed = await this.repos.passwordResets.completeReset({ resetId: reset.id, userId: reset.userId, passwordHash, now });
    if (!completed) throw invalid();
    logger.info({ user_id: reset.userId, status: 'password_reset_completed' }, 'password reset completed; sessions and device credentials revoked');
    return { message: 'Senha redefinida com sucesso.' };
  }
}

function codeInvalid(attemptsRemaining: number): ValidationError {
  return new ValidationError('Código incorreto.', undefined, { reason: 'code_invalid', attemptsRemaining });
}

function codeLocked(): ValidationError {
  return new ValidationError('Muitas tentativas com este código. Solicite um novo código.', undefined, { reason: 'code_locked', attemptsRemaining: 0 });
}
