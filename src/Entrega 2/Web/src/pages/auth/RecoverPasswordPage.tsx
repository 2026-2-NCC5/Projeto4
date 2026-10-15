import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button, ButtonLink } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Form';
import { isApiError } from '@/services/api/client';
import { authApi } from '@/services/api/endpoints';
import { AuthCard, authErrorMessage, FormAlert, passwordChecks, PasswordRequirements } from './authShared';

type Step = 'email' | 'code' | 'password' | 'done';

/** Recuperação em três passos (mesma API do app): e-mail → código de 6 dígitos → nova senha. */
export default function RecoverPasswordPage() {
  const policy = useQuery({ queryKey: ['auth', 'policy'], queryFn: authApi.policy, staleTime: 300_000 });
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (caught) {
      setError(authErrorMessage(caught));
      if (isApiError(caught) && caught.retryAfterSeconds) setCooldown(caught.retryAfterSeconds);
    } finally {
      setBusy(false);
    }
  };

  const requestCode = (event?: FormEvent) => {
    event?.preventDefault();
    if (!email.trim()) {
      setError('Informe seu e-mail.');
      return;
    }
    void run(async () => {
      const response = step === 'code' ? await authApi.resendCode(email.trim()) : await authApi.forgotPassword(email.trim());
      setInfo(response.message);
      setCooldown(response.resendAvailableInSeconds);
      setStep('code');
    });
  };

  const verify = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const response = await authApi.verifyCode(email.trim(), code.trim());
      setResetToken(response.resetToken);
      setInfo(null);
      setStep('password');
    });
  };

  const reset = (event: FormEvent) => {
    event.preventDefault();
    if (passwordChecks(policy.data?.password, password).some((check) => !check.ok)) {
      setError('A senha não atende aos requisitos.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não conferem.');
      return;
    }
    void run(async () => {
      await authApi.resetPassword(resetToken, password);
      setStep('done');
    });
  };

  const unavailable = policy.data && !policy.data.passwordRecoveryAvailable;

  return (
    <AuthCard
      title="Recuperar senha"
      description={step === 'done' ? undefined : 'Enviaremos um código para o e-mail da sua conta.'}
      footer={
        <Link to="/login" className="font-semibold text-action hover:underline">
          Voltar ao login
        </Link>
      }
    >
      <div className="flex flex-col gap-4">
        {unavailable ? <FormAlert tone="info">A recuperação de senha está indisponível neste ambiente porque o envio de e-mail não está configurado.</FormAlert> : null}
        {error ? <FormAlert>{error}</FormAlert> : null}
        {info ? <FormAlert tone="info">{info}</FormAlert> : null}

        {step === 'email' ? (
          <form onSubmit={requestCode} noValidate className="flex flex-col gap-4">
            <TextInput label="E-mail" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
            <Button type="submit" variant="primary" size="lg" loading={busy} disabled={Boolean(unavailable)} fullWidth>
              Enviar código
            </Button>
          </form>
        ) : null}

        {step === 'code' ? (
          <form onSubmit={verify} noValidate className="flex flex-col gap-4">
            <TextInput
              label="Código recebido por e-mail"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              maxLength={policy.data?.resetCode.length ?? 6}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              hint={`O código expira em ${Math.round((policy.data?.resetCode.ttlSeconds ?? 600) / 60)} minutos.`}
              required
              autoFocus
            />
            <Button type="submit" variant="primary" size="lg" loading={busy} disabled={code.length < (policy.data?.resetCode.length ?? 6)} fullWidth>
              Verificar código
            </Button>
            <Button variant="ghost" disabled={cooldown > 0 || busy} onClick={() => requestCode()}>
              {cooldown > 0 ? `Reenviar código em ${cooldown} s` : 'Reenviar código'}
            </Button>
          </form>
        ) : null}

        {step === 'password' ? (
          <form onSubmit={reset} noValidate className="flex flex-col gap-4">
            <div>
              <TextInput label="Nova senha" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus />
              <PasswordRequirements policy={policy.data?.password} value={password} />
            </div>
            <TextInput label="Confirme a nova senha" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required />
            <Button type="submit" variant="primary" size="lg" loading={busy} fullWidth>
              Redefinir senha
            </Button>
          </form>
        ) : null}

        {step === 'done' ? (
          <div className="flex flex-col gap-4">
            <FormAlert tone="success">Senha redefinida. Por segurança, todas as sessões abertas (app e portal) foram encerradas.</FormAlert>
            <ButtonLink to="/login" variant="primary" size="lg">
              Entrar com a nova senha
            </ButtonLink>
          </div>
        ) : null}
      </div>
    </AuthCard>
  );
}
