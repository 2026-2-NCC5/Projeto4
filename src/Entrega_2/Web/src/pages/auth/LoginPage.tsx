import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Checkbox, TextInput } from '@/components/ui/Form';
import { homeFor, useSession } from '@/features/auth/session';
import { AuthCard, authErrorMessage, FormAlert } from './authShared';

export default function LoginPage() {
  const { login, notice, clearNotice } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    clearNotice();
    if (!email.trim() || !password) {
      setError('Informe e-mail e senha.');
      return;
    }
    setBusy(true);
    try {
      const me = await login(email.trim(), password, rememberMe);
      const home = homeFor(me.user.role);
      const next = params.get('next');
      // volta para a página pedida apenas se ela for da própria área (sem redirecionamento aberto)
      navigate(next && next.startsWith(home) && !next.startsWith('//') ? next : home, { replace: true });
    } catch (caught) {
      setError(authErrorMessage(caught));
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Entrar no ASA Conecta"
      description="Use a mesma conta do aplicativo. Alunos, equipe do ASA e administração entram por aqui."
      footer={
        <>
          É aluno e ainda não tem conta?{' '}
          <Link to="/cadastro" className="font-semibold text-action hover:underline">
            Criar conta
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {notice ? <FormAlert tone="info">{notice}</FormAlert> : null}
        {error ? <FormAlert>{error}</FormAlert> : null}
        <TextInput label="E-mail" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
        <TextInput label="Senha" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Checkbox label="Manter conectado" description="Neste navegador, por até 30 dias." checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
          <Link to="/recuperar-senha" className="text-small font-semibold text-action hover:underline">
            Esqueci minha senha
          </Link>
        </div>
        <Button type="submit" variant="primary" size="lg" loading={busy} fullWidth>
          Entrar
        </Button>
        <p className="text-caption text-mist">A sessão fica em um cookie protegido do navegador; sua senha nunca é guardada no computador.</p>
      </form>
    </AuthCard>
  );
}
