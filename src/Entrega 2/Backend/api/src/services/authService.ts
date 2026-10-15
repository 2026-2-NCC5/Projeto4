import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PASSWORD_POLICY, passwordErrorDetails, unmetPasswordRequirements } from '../auth/passwordPolicy.js';
import { FixedWindowLimiter } from '../auth/rateLimiter.js';
import { randomToken, sha256Hex } from '../auth/secrets.js';
import type { AppConfig } from '../config/env.js';
import { permissionsFor, ROLE_LABELS } from '../auth/permissions.js';
import type { AuthMe, AuthPolicy, AuthSession, AuthSessionList, AuthSessionSummary, ProgramOption, RegisterRequest, SessionChannel } from '../contracts/mobileApi.v1.js';
import { ForbiddenError, NotFoundError, RateLimitedError, UnauthorizedError, ValidationError, type ErrorDetail } from '../errors/AppError.js';
import type { Repositories } from '../repositories/types.js';
import type { AuthContext, SessionFamilyRecord, UserRecord } from '../types/domain.js';

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

/** Domínio reservado das contas fictícias (seeds e testes). */
export const DEMO_EMAIL_DOMAIN = 'demo.asa';

/** Canal e aparelho de uma nova sessão (o app usa `mobile`; o portal, `web`). */
export interface SessionContext {
  channel: SessionChannel;
  deviceLabel?: string | null;
}

const MOBILE: SessionContext = { channel: 'mobile' };

export function isDemoAccount(user: Pick<UserRecord, 'email' | 'isDemo'>): boolean {
  return user.isDemo ?? normalizeEmail(user.email).endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

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
      allowedEmailDomains: this.allowedEmailDomains(),
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

  /** Com o modo demonstração desligado, o domínio reservado demo.asa deixa de aceitar cadastros. */
  private allowedEmailDomains(): string[] {
    const domains = this.config.auth.allowedEmailDomains;
    return this.config.demo.dataEnabled ? domains : domains.filter((domain) => domain !== DEMO_EMAIL_DOMAIN);
  }

  /** Contas fictícias não entram quando DEMO_DATA_ENABLED=false (isolamento do modo demonstração). */
  private assertNotBlockedDemo(user: UserRecord): void {
    if (!this.config.demo.dataEnabled && isDemoAccount(user)) {
      throw new ForbiddenError('Contas de demonstração estão desativadas neste ambiente.', 'demo_account_disabled');
    }
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
  async issueSession(user: UserRecord, rememberMe: boolean, context: SessionContext = MOBILE, familyId?: string): Promise<AuthSession> {
    this.assertNotBlockedDemo(user);
    const refreshToken = randomToken(48);
    const ttlMs = this.refreshTtlMs(rememberMe);
    const session = await this.repos.sessions.create({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(this.now().getTime() + ttlMs),
      rememberMe,
      channel: context.channel,
      ...(familyId ? { familyId } : {}),
      deviceLabel: context.deviceLabel ?? null,
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

  async login(email: string, password: string, rememberMe = false, context: SessionContext = MOBILE): Promise<AuthSession> {
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
    const session = await this.issueSession(user, rememberMe, context);
    await this.repos.users.touchLogin(user.id, this.now());
    return session;
  }

  async register(input: RegisterRequest, context: SessionContext = MOBILE): Promise<AuthSession> {
    const email = normalizeEmail(input.email);
    const fullName = input.fullName.trim().replace(/\s+/g, ' ');
    const registrationNumber = input.registrationNumber.trim();
    const details: ErrorDetail[] = [];
    let reason: string | undefined;
    const fail = (why: string, detail: ErrorDetail[]) => {
      reason ??= why;
      details.push(...detail);
    };

    const domains = this.allowedEmailDomains();
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
    const session = await this.issueSession(user, input.rememberMe ?? false, context);
    await this.repos.users.touchLogin(user.id, this.now());
    return session;
  }

  /**
   * Renova a sessão com rotação do refresh token. O canal precisa ser o mesmo da sessão original
   * (um token do portal não renova sessão do app e vice-versa); a família é mantida.
   */
  async refresh(refreshToken: string, channel: SessionChannel = 'mobile'): Promise<AuthSession> {
    const session = await this.repos.sessions.findByTokenHash(hashRefreshToken(refreshToken));
    const expired = () => new UnauthorizedError('Sessão expirada. Faça login novamente.', 'session_expired');
    if (!session || session.revokedAt || session.expiresAt.getTime() <= this.now().getTime()) throw expired();
    if ((session.channel ?? 'mobile') !== channel) throw expired();
    const user = await this.repos.users.findById(session.userId);
    if (!user || !user.isActive) throw expired();
    if (!this.config.demo.dataEnabled && isDemoAccount(user)) throw expired();
    await this.repos.sessions.revoke(session.id); // rotação: o refresh token antigo deixa de valer
    return this.issueSession(user, session.rememberMe, { channel, deviceLabel: session.deviceLabel ?? null }, session.familyId);
  }

  /** Papel atual de uma conta (auditoria do logout pelo cookie). */
  async roleOf(userId: string): Promise<UserRecord['role'] | null> {
    return (await this.repos.users.findById(userId))?.role ?? null;
  }

  /** Sessão de um refresh token (logout do portal pelo cookie, sem access token válido). */
  async findSessionByRefreshToken(refreshToken: string) {
    return this.repos.sessions.findByTokenHash(hashRefreshToken(refreshToken));
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
    return { userId: claims.sub, role: claims.role, sessionId: claims.sid, channel: session.channel ?? 'mobile', ...(session.familyId ? { familyId: session.familyId } : {}) };
  }

  // ---- platform (perfil unificado e sessões por aparelho/navegador)

  private toSummary(family: SessionFamilyRecord, auth: AuthContext): AuthSessionSummary {
    return {
      id: family.familyId,
      channel: family.channel,
      deviceLabel: family.deviceLabel,
      createdAt: family.createdAt.toISOString(),
      lastUsedAt: family.lastUsedAt?.toISOString() ?? null,
      expiresAt: family.expiresAt.toISOString(),
      rememberMe: family.rememberMe,
      current: family.activeSessionId === auth.sessionId || (auth.familyId !== undefined && family.familyId === auth.familyId),
    };
  }

  /** GET /api/auth/me — mesmo perfil para o app (Bearer) e o portal (cookie). */
  async me(auth: AuthContext): Promise<AuthMe> {
    const user = await this.repos.users.findById(auth.userId);
    if (!user || !user.isActive) throw new UnauthorizedError('Sessão encerrada. Faça login novamente.', 'session_revoked');
    const [student, families] = await Promise.all([this.repos.students.findByUserId(user.id), this.repos.sessions.listFamilies(user.id, this.now())]);
    const current = families.find((family) => family.activeSessionId === auth.sessionId);
    const session: AuthSessionSummary = current
      ? this.toSummary(current, auth)
      : { id: auth.familyId ?? auth.sessionId, channel: auth.channel ?? 'mobile', deviceLabel: null, createdAt: this.now().toISOString(), lastUsedAt: null, expiresAt: this.now().toISOString(), rememberMe: false, current: true };
    return {
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
      roleLabel: ROLE_LABELS[user.role],
      permissions: permissionsFor(user.role),
      student: student ? { id: student.id, registrationNumber: student.registrationNumber, program: student.program } : null,
      isDemo: isDemoAccount(user),
      session,
    };
  }

  async listSessions(auth: AuthContext): Promise<AuthSessionList> {
    const families = await this.repos.sessions.listFamilies(auth.userId, this.now());
    return { items: families.map((family) => this.toSummary(family, auth)) };
  }

  /** Encerra uma sessão (aparelho/navegador) da própria conta. */
  async revokeSession(auth: AuthContext, familyId: string): Promise<{ revokedCurrent: boolean }> {
    const families = await this.repos.sessions.listFamilies(auth.userId, this.now());
    const family = families.find((item) => item.familyId === familyId);
    if (!family) throw new NotFoundError('Sessão não encontrada.');
    await this.repos.sessions.revokeFamily(auth.userId, familyId);
    return { revokedCurrent: family.activeSessionId === auth.sessionId };
  }

  /** "Sair dos outros aparelhos": mantém só a sessão atual. */
  async revokeOtherSessions(auth: AuthContext): Promise<number> {
    const current = (await this.repos.sessions.findById(auth.sessionId))?.familyId ?? null;
    return this.repos.sessions.revokeAllExcept(auth.userId, current);
  }

  /** "Sair de todos os aparelhos", incluindo o atual. */
  async logoutAll(auth: AuthContext): Promise<number> {
    return this.repos.sessions.revokeAllExcept(auth.userId, null);
  }
}
