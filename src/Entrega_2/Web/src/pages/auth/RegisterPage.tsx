import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Checkbox, Select, TextInput } from '@/components/ui/Form';
import { homeFor, useSession } from '@/features/auth/session';
import { isApiError } from '@/services/api/client';
import { authApi } from '@/services/api/endpoints';
import { AuthCard, authErrorMessage, FormAlert, passwordChecks, PasswordRequirements } from './authShared';

/** Cadastro de aluno com e-mail institucional (contas da equipe e da administração só por convite). */
export default function RegisterPage() {
  const { register } = useSession();
  const navigate = useNavigate();
  const policy = useQuery({ queryKey: ['auth', 'policy'], queryFn: authApi.policy, staleTime: 300_000 });
  const programs = useQuery({ queryKey: ['auth', 'programs'], queryFn: authApi.programs, staleTime: 3_600_000 });
  const [form, setForm] = useState({ fullName: '', email: '', registrationNumber: '', programCode: '', password: '', confirm: '', rememberMe: false });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const domains = policy.data?.allowedEmailDomains ?? [];

  const update = (field: keyof typeof form) => (value: string | boolean) => setForm((current) => ({ ...current, [field]: value }));

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (form.fullName.trim().split(/\s+/).length < 2) errors.fullName = 'Informe nome e sobrenome.';
    const domain = form.email.trim().toLowerCase().split('@')[1] ?? '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'E-mail inválido.';
    else if (domains.length > 0 && !domains.includes(domain)) errors.email = `Use um e-mail institucional (${domains.map((item) => `@${item}`).join(', ')}).`;
    if (policy.data && !new RegExp(policy.data.registrationNumber.pattern).test(form.registrationNumber.trim())) {
      errors.registrationNumber = `RA inválido. Exemplo: ${policy.data.registrationNumber.example}.`;
    }
    if (passwordChecks(policy.data?.password, form.password).some((check) => !check.ok)) errors.password = 'A senha não atende aos requisitos.';
    if (form.password !== form.confirm) errors.confirm = 'As senhas não conferem.';
    return errors;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    try {
      const me = await register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        registrationNumber: form.registrationNumber.trim(),
        password: form.password,
        programCode: form.programCode || null,
        rememberMe: form.rememberMe,
      });
      navigate(homeFor(me.user.role), { replace: true });
    } catch (caught) {
      if (isApiError(caught) && caught.details.length > 0) {
        setFieldErrors(Object.fromEntries(caught.details.map((detail) => [detail.field, detail.message])));
      }
      setError(authErrorMessage(caught));
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Criar conta de aluno"
      description="A mesma conta vale para o portal e o aplicativo."
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/login" className="font-semibold text-action hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error ? <FormAlert>{error}</FormAlert> : null}
        <TextInput label="Nome completo" autoComplete="name" value={form.fullName} onChange={(event) => update('fullName')(event.target.value)} error={fieldErrors.fullName} required />
        <TextInput
          label="E-mail institucional"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(event) => update('email')(event.target.value)}
          error={fieldErrors.email}
          hint={domains.length > 0 ? `Domínios aceitos: ${domains.map((item) => `@${item}`).join(', ')}` : undefined}
          required
        />
        <TextInput
          label="RA (matrícula)"
          inputMode="numeric"
          value={form.registrationNumber}
          onChange={(event) => update('registrationNumber')(event.target.value)}
          error={fieldErrors.registrationNumber}
          hint={policy.data ? `Exemplo: ${policy.data.registrationNumber.example}` : undefined}
          required
        />
        <Select
          label="Curso (opcional)"
          value={form.programCode}
          onChange={(event) => update('programCode')(event.target.value)}
          placeholder="Selecione"
          options={(programs.data ?? []).map((program) => ({ value: program.code, label: program.name }))}
          error={fieldErrors.programCode}
        />
        <div>
          <TextInput label="Senha" type="password" autoComplete="new-password" value={form.password} onChange={(event) => update('password')(event.target.value)} error={fieldErrors.password} required />
          <PasswordRequirements policy={policy.data?.password} value={form.password} />
        </div>
        <TextInput label="Confirme a senha" type="password" autoComplete="new-password" value={form.confirm} onChange={(event) => update('confirm')(event.target.value)} error={fieldErrors.confirm} required />
        <Checkbox label="Manter conectado neste navegador" checked={form.rememberMe} onChange={(event) => update('rememberMe')(event.target.checked)} />
        {policy.data?.legal.privacyUrl ? (
          <p className="text-caption text-mist">
            Ao criar a conta você concorda com a{' '}
            <a href={policy.data.legal.privacyUrl} target="_blank" rel="noopener noreferrer" className="text-action underline">
              política de privacidade
            </a>
            .
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="lg" loading={busy} fullWidth>
          Criar conta
        </Button>
      </form>
    </AuthCard>
  );
}
