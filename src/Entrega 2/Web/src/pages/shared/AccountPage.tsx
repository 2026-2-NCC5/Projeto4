import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogOut, Monitor, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Badge, KeyValueList, List, ListItem, PageHeader, SectionHeader, Surface } from '@/components/ui/Display';
import { Switch } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { ErrorState, LoadingRows } from '@/components/feedback/States';
import { useMe, useSession } from '@/features/auth/session';
import { formatDateTime, formatRelative } from '@/lib/format';
import { messageForError } from '@/services/api/client';
import { authApi, notificationsApi } from '@/services/api/endpoints';
import type { AuthSessionSummary, NotificationCategory } from '@/types/api';

const sessionKeys = { list: ['auth', 'sessions'] as const, preferences: ['notifications', 'preferences'] as const };

type Pending = { kind: 'one'; session: AuthSessionSummary } | { kind: 'others' } | { kind: 'all' } | null;

function SessionsSection() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { logout } = useSession();
  const sessions = useQuery({ queryKey: sessionKeys.list, queryFn: authApi.sessions });
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (action: NonNullable<Pending>) => {
      if (action.kind === 'one') await authApi.revokeSession(action.session.id);
      else if (action.kind === 'others') await authApi.revokeOthers();
      else await authApi.logoutAll();
      return action;
    },
    onSuccess: async (action) => {
      setPending(null);
      if (action.kind === 'all' || (action.kind === 'one' && action.session.current)) {
        await logout();
        return;
      }
      toast.show(action.kind === 'one' ? 'Sessão encerrada.' : 'Os outros aparelhos foram desconectados.');
      await queryClient.invalidateQueries({ queryKey: sessionKeys.list });
    },
    onError: (caught) => setError(messageForError(caught)),
  });

  return (
    <Surface aria-labelledby="sessoes">
      <SectionHeader
        id="sessoes"
        title="Sessões ativas"
        description="Aparelhos e navegadores conectados à sua conta (app e portal)."
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setPending({ kind: 'others' })} disabled={(sessions.data?.items.length ?? 0) < 2}>
              Sair dos outros aparelhos
            </Button>
            <Button size="sm" variant="danger" icon={LogOut} onClick={() => setPending({ kind: 'all' })}>
              Sair de todos
            </Button>
          </div>
        }
      />
      {sessions.isPending ? (
        <LoadingRows rows={2} />
      ) : sessions.error ? (
        <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />
      ) : (
        <List label="Sessões ativas">
          {sessions.data.items.map((session) => (
            <ListItem
              key={session.id}
              leading={session.channel === 'web' ? <Monitor size={20} aria-hidden /> : <Smartphone size={20} aria-hidden />}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {session.deviceLabel ?? (session.channel === 'web' ? 'Navegador' : 'Aplicativo ASA Conecta')}
                  {session.current ? <Badge tone="action">Esta sessão</Badge> : null}
                </span>
              }
              description={`${session.channel === 'web' ? 'Portal web' : 'Aplicativo'} · conectado desde ${formatDateTime(session.createdAt)}`}
              meta={`Último uso ${formatRelative(session.lastUsedAt ?? session.createdAt)} · expira em ${formatDateTime(session.expiresAt)}${session.rememberMe ? ' · manter conectado' : ''}`}
              trailing={
                session.current ? null : (
                  <Button size="sm" onClick={() => setPending({ kind: 'one', session })}>
                    Encerrar
                  </Button>
                )
              }
            />
          ))}
        </List>
      )}
      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === 'all' ? 'Sair de todos os aparelhos?' : pending?.kind === 'others' ? 'Sair dos outros aparelhos?' : 'Encerrar esta sessão?'}
        description={
          pending?.kind === 'all'
            ? 'Todas as sessões, inclusive esta, serão encerradas no app e no portal.'
            : pending?.kind === 'others'
              ? 'Somente esta sessão continuará ativa.'
              : 'O aparelho precisará entrar novamente.'
        }
        confirmLabel="Confirmar"
        tone="danger"
        loading={mutation.isPending}
        error={error}
        onConfirm={() => pending && mutation.mutate(pending)}
        onClose={() => {
          setPending(null);
          setError(null);
        }}
      />
    </Surface>
  );
}

function PreferencesSection() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const preferences = useQuery({ queryKey: sessionKeys.preferences, queryFn: notificationsApi.preferences });
  const mutation = useMutation({
    mutationFn: (item: { category: NotificationCategory; pushEnabled: boolean }) => notificationsApi.updatePreferences({ items: [item] }),
    onSuccess: (data) => {
      queryClient.setQueryData(sessionKeys.preferences, data);
      toast.show('Preferência salva.');
    },
    onError: (caught) => toast.show(messageForError(caught), 'error'),
  });
  return (
    <Surface aria-labelledby="preferencias">
      <SectionHeader id="preferencias" title="Notificações push" description={preferences.data?.note} />
      {preferences.isPending ? (
        <LoadingRows rows={2} />
      ) : preferences.error ? (
        <ErrorState error={preferences.error} onRetry={() => void preferences.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          {preferences.data.pushDelivery === 'unavailable' ? <Badge tone="neutral">Push indisponível neste ambiente</Badge> : null}
          {preferences.data.items.map((item) => (
            <Switch
              key={item.category}
              label={item.label}
              checked={item.pushEnabled}
              disabled={mutation.isPending}
              onChange={(value) => mutation.mutate({ category: item.category, pushEnabled: value })}
            />
          ))}
        </div>
      )}
    </Surface>
  );
}

/** Conta, sessões e preferências — mesma página para aluno, equipe e administração. */
export default function AccountPage() {
  const me = useMe();
  return (
    <>
      <PageHeader title="Conta e segurança" description="Seus dados de acesso valem para o portal e para o aplicativo." />
      <div className="flex flex-col gap-6">
        <Surface aria-labelledby="dados">
          <SectionHeader id="dados" title="Dados da conta" />
          <KeyValueList
            columns={2}
            items={[
              { label: 'Nome', value: me.user.fullName },
              { label: 'E-mail', value: me.user.email },
              { label: 'Perfil', value: me.roleLabel },
              ...(me.student
                ? [
                    { label: 'RA', value: me.student.registrationNumber },
                    { label: 'Curso', value: me.student.program ?? 'Não informado' },
                  ]
                : []),
              { label: 'Tipo de conta', value: me.isDemo ? 'Demonstração (dados fictícios)' : 'Institucional' },
            ]}
          />
          <p className="mt-4 text-caption text-mist">Nome, RA e curso vêm do cadastro. Para corrigi-los, abra um chamado para o ASA.</p>
        </Surface>
        <SessionsSection />
        <PreferencesSection />
        <Surface aria-labelledby="senha">
          <SectionHeader id="senha" title="Senha" description="A troca de senha usa um código enviado ao seu e-mail e encerra as sessões abertas." />
          <ButtonLink to="/recuperar-senha" icon={KeyRound}>
            Redefinir senha
          </ButtonLink>
          <p className="mt-3 text-caption text-mist">Login por biometria está disponível no aplicativo. O portal web ainda não usa passkeys/WebAuthn.</p>
        </Surface>
      </div>
    </>
  );
}
