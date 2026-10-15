import { Check, Circle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Surface } from '@/components/ui/Display';
import { BrandBlock, PublicLayout } from '@/layouts/PublicLayout';
import { isApiError } from '@/services/api/client';
import type { PasswordPolicy } from '@/types/api';

export function AuthCard({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <PublicLayout>
      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10 sm:py-14">
        <div className="flex justify-center sm:hidden">
          <BrandBlock size="lg" />
        </div>
        <Surface className="p-6 sm:p-8" as="div">
          <h1 className="text-h2 font-bold">{title}</h1>
          {description ? <p className="mt-1 text-body text-slate">{description}</p> : null}
          <div className="mt-6">{children}</div>
        </Surface>
        {footer ? <div className="text-center text-small text-slate">{footer}</div> : null}
      </div>
    </PublicLayout>
  );
}

export function FormAlert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'info' | 'success' }) {
  const styles = tone === 'error' ? 'bg-danger-soft text-danger-text' : tone === 'success' ? 'bg-success-soft text-success-text' : 'bg-info-soft text-info-text';
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-md px-3 py-2.5 text-small ${styles}`}>
      {children}
    </div>
  );
}

/** Texto para os motivos estáveis da API de autenticação (nunca a mensagem técnica). */
export function authErrorMessage(error: unknown): string {
  if (!isApiError(error)) return 'Não foi possível concluir. Tente novamente.';
  switch (error.reason) {
    case 'invalid_credentials':
      return 'E-mail ou senha inválidos.';
    case 'too_many_attempts':
    case 'rate_limited':
      return error.retryAfterSeconds ? `Muitas tentativas. Tente novamente em ${Math.ceil(error.retryAfterSeconds / 60)} min.` : 'Muitas tentativas. Aguarde e tente novamente.';
    case 'account_disabled':
      return 'Esta conta está desativada. Procure o ASA.';
    case 'demo_account_disabled':
      return 'Contas de demonstração estão desativadas neste ambiente.';
    case 'account_exists':
      return 'Já existe uma conta com esse e-mail ou RA.';
    case 'email_domain_not_allowed':
      return 'Use seu e-mail institucional.';
    case 'invalid_registration_number':
      return 'RA inválido.';
    case 'weak_password':
      return 'A senha não atende aos requisitos.';
    case 'code_invalid':
      return 'Código incorreto.';
    case 'code_expired':
      return 'O código expirou. Peça um novo.';
    case 'code_locked':
      return 'Tentativas esgotadas. Peça um novo código.';
    case 'reset_token_invalid':
      return 'O link de redefinição expirou. Comece de novo.';
    case 'recovery_unavailable':
      return 'A recuperação de senha está indisponível neste ambiente (e-mail não configurado).';
    case 'csrf_failed':
      return 'A página ficou desatualizada. Recarregue e tente novamente.';
    default:
      if (error.kind === 'network' || error.kind === 'offline') return 'Sem conexão com o servidor. Verifique a internet.';
      return error.message || 'Não foi possível concluir. Tente novamente.';
  }
}

export function passwordChecks(policy: PasswordPolicy | undefined, value: string): Array<{ label: string; ok: boolean }> {
  const min = policy?.minLength ?? 8;
  const checks = [{ label: `Pelo menos ${min} caracteres`, ok: value.length >= min }];
  if (policy?.requireUppercase ?? true) checks.push({ label: 'Uma letra maiúscula', ok: /\p{Lu}/u.test(value) });
  if (policy?.requireLowercase ?? true) checks.push({ label: 'Uma letra minúscula', ok: /\p{Ll}/u.test(value) });
  if (policy?.requireDigit ?? true) checks.push({ label: 'Um número', ok: /\d/.test(value) });
  if (policy?.requireSymbol ?? true) checks.push({ label: 'Um símbolo', ok: /[^\p{L}\d\s]/u.test(value) });
  return checks;
}

export function PasswordRequirements({ policy, value }: { policy: PasswordPolicy | undefined; value: string }) {
  return (
    <ul className="mt-1 grid gap-1 text-caption sm:grid-cols-2" aria-label="Requisitos da senha">
      {passwordChecks(policy, value).map((check) => (
        <li key={check.label} className={check.ok ? 'flex items-center gap-1.5 text-success-text' : 'flex items-center gap-1.5 text-mist'}>
          {check.ok ? <Check size={14} aria-hidden /> : <Circle size={12} aria-hidden />}
          {check.label}
          <span className="sr-only">{check.ok ? '(atendido)' : '(pendente)'}</span>
        </li>
      ))}
    </ul>
  );
}
