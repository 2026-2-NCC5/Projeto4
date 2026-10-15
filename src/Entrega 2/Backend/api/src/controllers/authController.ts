import type { Request, Response } from 'express';
import { z } from 'zod';
import { deviceLabelFrom } from '../auth/webSession.js';
import type { RegisterRequest } from '../contracts/mobileApi.v1.js';
import { AppError } from '../errors/AppError.js';
import type { Mailer } from '../mail/mailer.js';
import type { AuditService } from '../platform/auditService.js';
import type { AuthService } from '../services/authService.js';
import type { BiometricService } from '../services/biometricService.js';
import type { PasswordResetService } from '../services/passwordResetService.js';
import { ok } from './respond.js';

const emailField = z.string().trim().min(3).max(320).pipe(z.email('E-mail inválido.'));

export const loginSchema = z
  .object({
    email: emailField,
    password: z.string().min(1, 'Informe a senha.').max(256),
    rememberMe: z.boolean().optional(),
  })
  .strict();

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(5, 'Informe seu nome completo.').max(120).regex(/\p{L}/u, 'Informe seu nome completo.'),
    email: emailField,
    password: z.string().min(1, 'Informe a senha.').max(256),
    registrationNumber: z.string().trim().min(1, 'Informe seu RA.').max(32),
    programCode: z.string().trim().max(16).nullable().optional(),
    rememberMe: z.boolean().optional(),
  })
  .strict();

export const refreshSchema = z.object({ refreshToken: z.string().min(16).max(256) }).strict();
export const logoutSchema = z.object({ refreshToken: z.string().min(16).max(256).optional() }).strict();
export const forgotPasswordSchema = z.object({ email: emailField }).strict();
export const verifyResetCodeSchema = z
  .object({ email: emailField, code: z.string().trim().regex(/^\d{4,10}$/, 'Código inválido.') })
  .strict();
export const resetPasswordSchema = z
  .object({ resetToken: z.string().min(20).max(256), newPassword: z.string().min(1, 'Informe a nova senha.').max(256) })
  .strict();
export const biometricEnrollSchema = z.object({ deviceLabel: z.string().trim().max(80).optional() }).strict();
export const biometricLoginSchema = z
  .object({ credentialId: z.uuid('Credencial inválida.'), credential: z.string().min(20).max(256) })
  .strict();
export const biometricRevokeSchema = z.object({ credentialId: z.uuid('Credencial inválida.') }).strict();

export function createAuthController(authService: AuthService, resets: PasswordResetService, biometrics: BiometricService, mailer: Mailer, audit?: AuditService) {
  return {
    async policy(req: Request, res: Response): Promise<void> {
      res.setHeader('Cache-Control', 'public, max-age=300');
      ok(req, res, authService.getPolicy(mailer.available));
    },
    async programs(req: Request, res: Response): Promise<void> {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      ok(req, res, await authService.listPrograms());
    },
    async login(req: Request, res: Response): Promise<void> {
      const { email, password, rememberMe } = req.body as z.infer<typeof loginSchema>;
      const context = { channel: 'mobile' as const, deviceLabel: deviceLabelFrom(req.headers['user-agent'], 'mobile') };
      let session;
      try {
        session = await authService.login(email, password, rememberMe ?? false, context);
      } catch (error) {
        await audit?.record(
          { ...audit.actorFrom(req), channel: 'mobile' },
          { action: 'auth.login_failed', outcome: 'failure', metadata: { reason: error instanceof AppError ? (error.reason ?? error.code) : 'error', account: audit.pseudonymize(email.trim().toLowerCase()) } },
        );
        throw error;
      }
      req.log.info({ user_id: session.user.id, remember_me: session.rememberMe, status: 'login_success' }, 'login');
      await audit?.record(
        { ...audit.actorFrom(req), userId: session.user.id, role: session.user.role, channel: 'mobile' },
        { action: 'auth.login', resourceType: 'user', resourceId: session.user.id, metadata: { rememberMe: session.rememberMe } },
      );
      ok(req, res, session);
    },
    async register(req: Request, res: Response): Promise<void> {
      const session = await authService.register(req.body as RegisterRequest, { channel: 'mobile', deviceLabel: deviceLabelFrom(req.headers['user-agent'], 'mobile') });
      req.log.info({ user_id: session.user.id, status: 'account_created' }, 'register');
      await audit?.record(
        { ...audit.actorFrom(req), userId: session.user.id, role: session.user.role, channel: 'mobile' },
        { action: 'auth.account_created', resourceType: 'user', resourceId: session.user.id },
      );
      ok(req, res, session, 201);
    },
    async refresh(req: Request, res: Response): Promise<void> {
      const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
      ok(req, res, await authService.refresh(refreshToken));
    },
    async logout(req: Request, res: Response): Promise<void> {
      const { refreshToken } = req.body as z.infer<typeof logoutSchema>;
      await authService.logout(req.auth ?? null, refreshToken);
      if (req.auth) await audit?.recordFor(req, { action: 'auth.logout', resourceType: 'session', resourceId: req.auth.familyId ?? req.auth.sessionId });
      res.status(204).end();
    },
    async forgotPassword(req: Request, res: Response): Promise<void> {
      const { email } = req.body as z.infer<typeof forgotPasswordSchema>;
      ok(req, res, await resets.requestCode(email, req.log), 202);
    },
    async resendResetCode(req: Request, res: Response): Promise<void> {
      const { email } = req.body as z.infer<typeof forgotPasswordSchema>;
      ok(req, res, await resets.requestCode(email, req.log), 202);
    },
    async verifyResetCode(req: Request, res: Response): Promise<void> {
      const { email, code } = req.body as z.infer<typeof verifyResetCodeSchema>;
      ok(req, res, await resets.verifyCode(email, code));
    },
    async resetPassword(req: Request, res: Response): Promise<void> {
      const { resetToken, newPassword } = req.body as z.infer<typeof resetPasswordSchema>;
      const result = await resets.resetPassword(resetToken, newPassword, req.log);
      await audit?.recordFor(req, { action: 'auth.password_reset', metadata: { sessionsRevoked: true } });
      ok(req, res, result);
    },
    async biometricEnroll(req: Request, res: Response): Promise<void> {
      const { deviceLabel } = req.body as z.infer<typeof biometricEnrollSchema>;
      ok(req, res, await biometrics.enroll(req.auth!, deviceLabel, req.log), 201);
    },
    async biometricLogin(req: Request, res: Response): Promise<void> {
      const { credentialId, credential } = req.body as z.infer<typeof biometricLoginSchema>;
      const session = await biometrics.login(credentialId, credential, req.log);
      req.log.info({ user_id: session.user.id, status: 'biometric_login_success' }, 'login');
      ok(req, res, session);
    },
    async biometricRevoke(req: Request, res: Response): Promise<void> {
      const { credentialId } = req.body as z.infer<typeof biometricRevokeSchema>;
      await biometrics.revoke(req.auth!, credentialId);
      res.status(204).end();
    },
  };
}
