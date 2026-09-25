import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PASSWORD_POLICY, passwordErrorDetails, unmetPasswordRequirements } from '../auth/passwordPolicy.js';
import { FixedWindowLimiter } from '../auth/rateLimiter.js';
import { randomToken, sha256Hex } from '../auth/secrets.js';
import type { AppConfig } from '../config/env.js';
import type { AuthPolicy, AuthSession, ProgramOption, RegisterRequest } from '../contracts/mobileApi.v1.js';
import { ForbiddenError, RateLimitedError, UnauthorizedError, ValidationError, type ErrorDetail } from '../errors/AppError.js';
import type { Repositories } from '../repositories/types.js';
import type { AuthContext, UserRecord } from '../types/domain.js';

interface AccessTokenClaims {
  sub: string;
  role: AuthContext['role'];
  sid: string;
  iat: number;
  exp: number;
}

/** Hash usado quando o e-mail não existe: mantém o custo do bcrypt e não revela contas por tempo de resposta. */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomToken(24), 10);

export function hashRefreshToken(token: string): string {
  return sha256Hex(token);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_FAILURES = 5;

export class AuthService {
  /** Falhas de login por e-mail (inclusive e-mails inexistentes, para não permitir enumeração). */
  private readonly loginFailures: FixedWindowLimiter;

  constructor(
    private readonly repos: Repositories,
    private readonly config: AppConfig,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.loginFailures = new FixedWindowLimiter({ windowMs: LOGIN_FAILURE_WINDOW_MS, max: LOGIN_MAX_FAILURES }, () => this.now().getTime());
  }

  getPolicy(passwordRecoveryAvailable: boolean): AuthPolicy {
    const { auth } = this.config;
    return {
      password: PASSWORD_POLICY,
      allowedEmailDomains: auth.allowedEmailDomains,
      registrationNumber: { pattern: auth.registrationNumberPatternSource, example: auth.registrationNumberExample },
      resetCode: {
        length: auth.resetCode.length,
        ttlSeconds: auth.resetCode.ttlMinutes * 60,
        resendCooldownSeconds: auth.resetCode.resendCooldownSeconds,
        maxAttempts: auth.resetCode.maxAttempts,
      },
      session: { rememberMeDays: this.config.refreshTokenTtlDays, shortSessionHours: this.config.sessionTtlHours },
      biometric: { enabled: auth.biometric.enabled, credentialTtlDays: auth.biometric.credentialTtlDays },
      legal: auth.legal,
      passwordRecoveryAvailable,
    };
  }

  async listPrograms(): Promise<ProgramOption[]> {
    return this.repos.programs.list();
  }

  private refreshTtlMs(rememberMe: boolean): number {
    return rememberMe ? this.config.refreshTokenTtlDays * 86_400_000 : this.config.sessionTtlHours * 3_600_000;
  }

  private issueAccessToken(userId: string, role: AuthContext['role'], sessionId: string): { token: string; expiresIn: number } {
    const token = jwt.sign({ role, sid: sessionId }, this.config.jwt.secret, {
      subject: userId,
      expiresIn: this.config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
      issuer: this.config.jwt.issuer,
      audience: this.config.jwt.audience,
      algorithm: 'HS256',
    });
    const decoded = jwt.decode(token) as AccessTokenClaims;
    return { token, expiresIn: Math.max(0, decoded.exp - decoded.iat) };
  }

  /** Cria uma sessão (refresh token rotativo + access token curto) para um usuário ativo. */
  async issueSession(user: UserRecord, rememberMe: boolean): Promise<AuthSession> {
    const refreshToken = randomToken(48);
    const ttlMs = this.refreshTtlMs(rememberMe);
    const session = await this.repos.sessions.create({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(this.now().getTime() + ttlMs),
      rememberMe,
    });
    const access = this.issueAccessToken(user.id, user.role, session.id);
    const student = await this.repos.students.findByUserId(user.id);
    return {
      accessToken: access.token,
      refreshToken,
      expiresIn: access.expiresIn,
      refreshExpiresIn: Math.floor(ttlMs / 1000),
      rememberMe,
      tokenType: 'Bearer',
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
      student: student ? { id: student.id, registrationNumber: student.registrationNumber, program: student.program } : null,
    };
  }

  async login(email: string, password: string, rememberMe = false): Promise<AuthSession> {
    const key = normalizeEmail(email);
    if (this.config.rateLimit.enabled) {
      const status = this.loginFailures.peek(key);
      if (!status.allowed) throw new RateLimitedError(status.retryAfterSeconds, 'too_many_attempts');
    }
    const user = await this.repos.users.findByEmail(key);
    const matches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !matches) {
      if (this.config.rateLimit.enabled) this.loginFailures.hit(key);
      throw new UnauthorizedError('E-mail ou senha inválidos.', 'invalid_credentials');
    }
    // Só informa conta desativada a quem já provou conhecer a senha.
    if (!user.isActive) throw new ForbiddenError('Conta desativada.', 'account_disabled');
    this.loginFailures.reset(key);
    return this.issueSession(user, rememberMe);
  }

  async register(input: RegisterRequest): Promise<AuthSession> {
    const email = normalizeEmail(input.email);
    const fullName = input.fullName.trim().replace(/\s+/g, ' ');
    const registrationNumber = input.registrationNumber.trim();
    const details: ErrorDetail[] = [];
    let reason: string | undefined;
    const fail = (why: string, detail: ErrorDetail[]) => {
      reason ??= why;
      details.push(...detail);
    };

    const domains = this.config.auth.allowedEmailDomains;
    const domain = email.split('@')[1] ?? '';
    if (domains.length > 0 && !domains.includes(domain)) {
      fail('email_domain_not_allowed', [{ field: 'email', message: `Use um e-mail institucional (${domains.map((item) => `@${item}`).join(', ')}).` }]);
    }
    if (!this.config.auth.registrationNumberPattern.test(registrationNumber)) {
      fail('invalid_registration_number', [{ field: 'registrationNumber', message: `RA inválido. Exemplo: ${this.config.auth.registrationNumberExample}.` }]);
    }
    const unmet = unmetPasswordRequirements(input.password);
    if (unmet.length > 0) fail('weak_password', passwordErrorDetails('password', unmet));

    let program: string | null = null;
    if (input.programCode) {
      const found = await this.repos.programs.findByCode(input.programCode.trim().toUpperCase());
      if (!found) fail('unknown_program', [{ field: 'programCode', message: 'Curso não encontrado.' }]);
      else program = found.name;
    }
    if (details.length > 0) throw new ValidationError('Dados de cadastro inválidos.', details, { reason });

    const passwordHash = await hashPassword(input.password);
    const { user } = await this.repos.accounts.createStudentAccount({
      user: { email, passwordHash, fullName },
      student: { id: `student-${randomUUID()}`, registrationNumber, program },
    });
    return this.issueSession(user, input.rememberMe ?? false);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const session = await this.repos.sessions.findByTokenHash(hashRefreshToken(refreshToken));
    if (!session || session.revokedAt || session.expiresAt.getTime() <= this.now().getTime()) {
      throw new UnauthorizedError('Sessão expirada. Faça login novamente.', 'session_expired');
    }
    const user = await this.repos.users.findById(session.userId);
    if (!user || !user.isActive) throw new UnauthorizedError('Sessão expirada. Faça login novamente.', 'session_expired');
    await this.repos.sessions.revoke(session.id); // rotação: o refresh token antigo deixa de valer
    return this.issueSession(user, session.rememberMe);
  }

  async logout(auth: AuthContext | null, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const session = await this.repos.sessions.findByTokenHash(hashRefreshToken(refreshToken));
      if (session && (!auth || session.userId === auth.userId)) await this.repos.sessions.revoke(session.id);
    }
    if (auth) await this.repos.sessions.revoke(auth.sessionId);
  }

  async verifyAccessToken(token: string): Promise<AuthContext> {
    let claims: AccessTokenClaims;
    try {
      claims = jwt.verify(token, this.config.jwt.secret, {
        issuer: this.config.jwt.issuer,
        audience: this.config.jwt.audience,
        algorithms: ['HS256'],
      }) as AccessTokenClaims;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) throw new UnauthorizedError('Sessão expirada.', 'token_expired');
      throw new UnauthorizedError('Token inválido.', 'token_invalid');
    }
    if (!claims.sub || !claims.sid || !claims.role) throw new UnauthorizedError('Token inválido.', 'token_invalid');
    const session = await this.repos.sessions.findById(claims.sid);
    if (!session || session.revokedAt) throw new UnauthorizedError('Sessão encerrada. Faça login novamente.', 'session_revoked');
    return { userId: claims.sub, role: claims.role, sessionId: claims.sid };
  }
}
