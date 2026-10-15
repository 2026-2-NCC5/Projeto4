import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, LogOut, MailPlus, ScrollText, UserCheck, UserX } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Badge, KeyValueList } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { LoadingRows } from '@/components/feedback/States';
import { adminApi, adminKeys, type InvitationResult } from '@/features/admin/api';
import { AdminFailure, ChoiceGroup, DemoBadge, Notice, TextLink } from '@/features/admin/components';
import { ASSIGNABLE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type AssignableRole } from '@/features/admin/labels';
import { canResendInvitation, userErrorMessage } from '@/features/admin/users';
import { plural } from '@/features/appointments/dates';
import { useMe, useSession } from '@/features/auth/session';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { AdminUser, AdminUserUpdateRequest } from '@/types/api';

type Pending = { kind: 'role'; role: AssignableRole } | { kind: 'active'; isActive: boolean } | { kind: 'revoke' };

export function AccountStatusBadge({ user }: { user: AdminUser }) {
  return user.isActive ? (
    <Badge tone="success" icon={CheckCircle2}>
      Ativa
    </Badge>
  ) : (
    <Badge tone="neutral" icon={Ban}>
      Inativa
    </Badge>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-4">
      <h3 className="text-h4 font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function confirmCopy(pending: Pending, user: AdminUser, self: boolean): { title: string; description: string; confirmLabel: string; tone: 'primary' | 'danger' } {
  const name = user.fullName;
  if (pending.kind === 'role') {
    return {
      title: 'Alterar papel?',
      description: `${name} passa de ${ROLE_LABELS[user.role]} para ${ROLE_LABELS[pending.role]}. Todas as sessões dessa pessoa terminam na hora: ela precisa entrar de novo em todos os aparelhos, já com as permissões do novo papel.`,
      confirmLabel: 'Alterar papel',
      tone: 'primary',
    };
  }
  if (pending.kind === 'active') {
    return pending.isActive
      ? {
          title: 'Reativar conta?',
          description: `${name} volta a poder entrar com a própria senha. As sessões antigas continuam encerradas: a pessoa precisa entrar de novo em todos os aparelhos.`,
          confirmLabel: 'Reativar conta',
          tone: 'primary',
        }
      : {
          title: 'Desativar conta?',
          description: `${name} não consegue mais entrar. Todas as sessões dessa pessoa (portal e aplicativo) terminam na hora. O histórico e a auditoria continuam guardados.`,
          confirmLabel: 'Desativar conta',
          tone: 'danger',
        };
  }
  return self
    ? { title: 'Encerrar suas outras sessões?', description: 'Suas sessões em outros aparelhos e navegadores terminam na hora. Esta sessão continua aberta.', confirmLabel: 'Encerrar sessões', tone: 'danger' }
    : {
        title: 'Encerrar todas as sessões?',
        description: `Todas as sessões de ${name} terminam na hora: o portal e o aplicativo pedem para entrar de novo. A conta continua ativa.`,
        confirmLabel: 'Encerrar sessões',
        tone: 'danger',
      };
}

function Details({ user, onChanged }: { user: AdminUser; onChanged: (user: AdminUser) => void }) {
  const me = useMe();
  const { can } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const self = user.id === me.user.id;
  const [role, setRole] = useState<AssignableRole | ''>(user.role === 'student' ? '' : user.role);
  const [pending, setPending] = useState<Pending | null>(null);
  const [invitation, setInvitation] = useState<InvitationResult | null>(null);

  const refreshLists = () => {
    void queryClient.invalidateQueries({ queryKey: adminKeys.users });
    void queryClient.invalidateQueries({ queryKey: adminKeys.overview });
  };

  const update = useMutation({
    mutationFn: (body: AdminUserUpdateRequest) => adminApi.updateUser(user.id, body),
    onSuccess: (saved, body) => {
      onChanged(saved);
      refreshLists();
      setPending(null);
      if (body.role) toast.show(`Papel de ${saved.fullName} alterado para ${saved.roleLabel}. As sessões dessa pessoa foram encerradas.`);
      else toast.show(saved.isActive ? `Conta de ${saved.fullName} reativada.` : `Conta de ${saved.fullName} desativada. As sessões foram encerradas.`);
    },
    onError: (error) => toast.show(userErrorMessage(error, 'Não foi possível alterar a conta.'), 'error'),
  });

  const revoke = useMutation({
    mutationFn: () => adminApi.revokeSessions(user.id),
    onSuccess: ({ revoked }) => {
      refreshLists();
      void queryClient.invalidateQueries({ queryKey: adminKeys.user(user.id) });
      setPending(null);
      toast.show(revoked === 0 ? 'Nenhuma sessão estava ativa.' : `${plural(revoked, 'sessão encerrada', 'sessões encerradas')}.`);
    },
    onError: (error) => toast.show(userErrorMessage(error, 'Não foi possível encerrar as sessões.'), 'error'),
  });

  const resend = useMutation({
    mutationFn: () => adminApi.resendInvitation(user.id),
    onMutate: () => setInvitation(null),
    onSuccess: (result) => {
      setInvitation(result);
      void queryClient.invalidateQueries({ queryKey: adminKeys.user(user.id) });
      toast.show(result.sent ? result.message : `Convite não enviado. ${result.message}`, result.sent ? 'success' : 'info');
    },
    onError: (error) => toast.show(userErrorMessage(error, 'Não foi possível reenviar o convite.'), 'error'),
  });

  const open = (next: Pending) => {
    update.reset();
    revoke.reset();
    setPending(next);
  };
  const confirmBusy = update.isPending || revoke.isPending;
  const confirmError = pending?.kind === 'revoke' ? revoke.error : update.error;
  const copy = pending ? confirmCopy(pending, user, self) : null;
  const auditMine = `/admin/auditoria?actorUserId=${encodeURIComponent(user.id)}`;
  const auditAbout = `/admin/auditoria?resourceType=user&resourceId=${encodeURIComponent(user.id)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{user.roleLabel}</Badge>
        <AccountStatusBadge user={user} />
        {user.isDemo ? <DemoBadge /> : null}
        {self ? <Badge tone="info">Você</Badge> : null}
      </div>
      <KeyValueList
        items={[
          { label: 'E-mail', value: <span className="break-all">{user.email}</span> },
          ...(user.student ? [{ label: 'Matrícula (RA)', value: <span className="font-mono">{user.student.registrationNumber}</span> }] : []),
          { label: 'Conta criada em', value: formatDateTime(user.createdAt) },
          { label: 'Último acesso', value: user.lastLoginAt ? `${formatDateTime(user.lastLoginAt)} (${formatRelative(user.lastLoginAt)})` : 'Nunca entrou' },
          ...(user.invitedAt ? [{ label: 'Convidada em', value: formatDateTime(user.invitedAt) }] : []),
          { label: 'Sessões ativas', value: String(user.activeSessions) },
        ]}
      />

      <Section title="Papel">
        {user.role === 'student' ? (
          <p className="text-small text-slate">
            Contas de aluno não mudam de papel: o vínculo acadêmico vem do cadastro. Para dar acesso de equipe a esta pessoa, convide uma conta separada.
          </p>
        ) : self ? (
          <p className="text-small text-slate">Você não pode alterar o próprio papel. Peça a outra pessoa da administração.</p>
        ) : (
          <>
            <ChoiceGroup
              legend="Papel desta conta"
              value={role}
              onChange={setRole}
              options={ASSIGNABLE_ROLES.map((item) => ({ value: item, label: ROLE_LABELS[item], description: ROLE_DESCRIPTIONS[item] }))}
            />
            <div>
              <Button disabled={!role || role === user.role} onClick={() => role && role !== user.role && open({ kind: 'role', role })}>
                Alterar papel
              </Button>
            </div>
          </>
        )}
      </Section>

      <Section title="Acesso">
        {self ? <p className="text-small text-slate">Você não pode desativar a própria conta.</p> : null}
        <div className="flex flex-wrap gap-2">
          {self ? null : user.isActive ? (
            <Button variant="danger" icon={UserX} onClick={() => open({ kind: 'active', isActive: false })}>
              Desativar conta
            </Button>
          ) : (
            <Button icon={UserCheck} onClick={() => open({ kind: 'active', isActive: true })}>
              Reativar conta
            </Button>
          )}
          {can('sessions:revoke:any') ? (
            <Button icon={LogOut} onClick={() => open({ kind: 'revoke' })}>
              {self ? 'Encerrar minhas outras sessões' : 'Encerrar sessões'}
            </Button>
          ) : null}
          {canResendInvitation(user) ? (
            <Button icon={MailPlus} loading={resend.isPending} onClick={() => resend.mutate()}>
              Reenviar convite
            </Button>
          ) : null}
        </div>
        {invitation ? (
          invitation.sent ? (
            <Notice tone="success">{invitation.message}</Notice>
          ) : (
            <Notice tone="warning" title="Convite não enviado">
              {invitation.message}
            </Notice>
          )
        ) : null}
      </Section>

      <Section title="Auditoria">
        <ul className="flex flex-col gap-2 text-small">
          <li className="flex items-center gap-2">
            <ScrollText size={20} aria-hidden className="shrink-0 text-slate" />
            <TextLink to={auditMine}>Ações feitas por esta pessoa</TextLink>
          </li>
          <li className="flex items-center gap-2">
            <ScrollText size={20} aria-hidden className="shrink-0 text-slate" />
            <TextLink to={auditAbout}>Registros sobre esta conta</TextLink>
          </li>
        </ul>
      </Section>

      {copy ? (
        <ConfirmDialog
          open={pending !== null}
          title={copy.title}
          description={copy.description}
          confirmLabel={copy.confirmLabel}
          tone={copy.tone}
          loading={confirmBusy}
          error={confirmError ? userErrorMessage(confirmError, 'Não foi possível concluir.') : null}
          onClose={() => {
            if (!confirmBusy) setPending(null);
          }}
          onConfirm={() => {
            if (!pending) return;
            if (pending.kind === 'revoke') revoke.mutate();
            else if (pending.kind === 'role') update.mutate({ role: pending.role });
            else update.mutate({ isActive: pending.isActive });
          }}
        />
      ) : null}
    </div>
  );
}

/** Detalhe de uma conta (gaveta lateral): dados, papel, ativação, sessões, convite e auditoria. */
export function UserDrawer({ userId, placeholder, onClose }: { userId: string | null; placeholder?: AdminUser; onClose: () => void }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: adminKeys.user(userId ?? ''),
    queryFn: () => adminApi.user(userId ?? ''),
    enabled: Boolean(userId),
    ...(placeholder ? { placeholderData: placeholder } : {}),
  });
  const user = query.data;
  return (
    <Dialog open={Boolean(userId)} onClose={onClose} side="right" title={user?.fullName ?? 'Conta'} description={user ? user.email : undefined}>
      {!userId ? null : query.isPending ? (
        <LoadingRows rows={4} />
      ) : user === undefined ? (
        <AdminFailure error={query.error} onRetry={() => void query.refetch()} title="Não foi possível carregar a conta" />
      ) : (
        <Details key={`${user.id}:${user.role}:${String(user.isActive)}`} user={user} onChanged={(saved) => queryClient.setQueryData(adminKeys.user(saved.id), saved)} />
      )}
    </Dialog>
  );
}
