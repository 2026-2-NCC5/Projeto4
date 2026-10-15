import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { KeyValueList } from '@/components/ui/Display';
import { TextInput } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { adminApi, adminKeys } from '@/features/admin/api';
import { ChoiceGroup, Notice } from '@/features/admin/components';
import { ASSIGNABLE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type AssignableRole } from '@/features/admin/labels';
import { inviteErrorsFrom, validateInvite, type InviteErrors, type InviteForm } from '@/features/admin/users';
import type { AdminUserCreateResult } from '@/types/api';

const EMPTY: InviteForm = { fullName: '', email: '', role: '' };

/**
 * Convite de equipe ASA ou administração. A conta nasce na hora; o e-mail com o código para criar a senha só
 * sai quando o envio está ativo no ambiente — o resultado diz exatamente o que aconteceu.
 */
export function InviteUserDialog({ open, onClose, onOpenUser }: { open: boolean; onClose: () => void; onOpenUser: (id: string) => void }) {
  const formId = useId();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<InviteForm>(EMPTY);
  const [errors, setErrors] = useState<InviteErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<AdminUserCreateResult | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  // cada abertura começa do zero
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setForm(EMPTY);
      setErrors({});
      setFormError(null);
      setResult(null);
    }
  }

  const invite = useMutation({
    mutationFn: (state: InviteForm) => adminApi.inviteUser({ fullName: state.fullName.trim(), email: state.email.trim(), role: state.role as AssignableRole }),
    onMutate: () => setFormError(null),
    onSuccess: (created) => {
      setResult(created);
      void queryClient.invalidateQueries({ queryKey: adminKeys.users });
      void queryClient.invalidateQueries({ queryKey: adminKeys.overview });
      toast.show(created.invitation.sent ? `Convite enviado para ${created.user.email}.` : 'Conta criada. O e-mail de convite não foi enviado.', created.invitation.sent ? 'success' : 'info');
    },
    onError: (error) => {
      const { fields, message } = inviteErrorsFrom(error);
      setErrors(fields);
      setFormError(message);
      toast.show(`Convite não concluído: ${message}`, 'error');
    },
  });

  const set = <K extends keyof InviteForm>(field: K, value: InviteForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = () => {
    const found = validateInvite(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    invite.mutate(form);
  };

  const close = () => {
    if (!invite.isPending) onClose();
  };

  if (result) {
    const { user, invitation } = result;
    return (
      <Dialog
        open={open}
        onClose={close}
        title={invitation.sent ? 'Convite enviado' : 'Conta criada sem envio de e-mail'}
        footer={
          <>
            <Button
              onClick={() => {
                setForm(EMPTY);
                setErrors({});
                setFormError(null);
                setResult(null);
              }}
            >
              Convidar outra pessoa
            </Button>
            <Button onClick={() => onOpenUser(user.id)}>Ver conta</Button>
            <Button variant="primary" onClick={onClose}>
              Concluir
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {invitation.sent ? (
            <Notice tone="success" title={invitation.message}>
              A pessoa recebe um código por e-mail para criar a própria senha e entrar no portal.
            </Notice>
          ) : (
            <Notice tone="warning" title="A conta existe, mas nenhum e-mail foi enviado.">
              <p>{invitation.message}</p>
              <p className="mt-1">Você pode usar “Reenviar convite” no detalhe da conta quando o envio de e-mail estiver funcionando.</p>
            </Notice>
          )}
          <KeyValueList
            columns={2}
            items={[
              { label: 'Nome', value: user.fullName },
              { label: 'E-mail', value: <span className="break-all">{user.email}</span> },
              { label: 'Papel', value: user.roleLabel },
              { label: 'Situação', value: user.isActive ? 'Ativa (ainda sem senha definida)' : 'Inativa' },
            ]}
          />
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Convidar pessoa"
      description="Para a equipe ASA e a administração. Alunos não são convidados: eles se cadastram com o e-mail institucional."
      footer={
        <>
          <Button onClick={onClose} disabled={invite.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={invite.isPending}>
            Enviar convite
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {formError ? (
          <Notice tone="danger" alert>
            {formError}
          </Notice>
        ) : null}
        <TextInput label="Nome completo" required autoComplete="off" maxLength={120} value={form.fullName} onChange={(event) => set('fullName', event.target.value)} error={errors.fullName} />
        <TextInput
          label="E-mail institucional"
          type="email"
          required
          autoComplete="off"
          maxLength={160}
          value={form.email}
          onChange={(event) => set('email', event.target.value)}
          hint="O servidor só aceita os domínios institucionais configurados."
          error={errors.email}
        />
        <ChoiceGroup
          legend="Papel"
          value={form.role}
          onChange={(role) => set('role', role)}
          options={ASSIGNABLE_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role], description: ROLE_DESCRIPTIONS[role] }))}
          error={errors.role}
        />
      </form>
    </Dialog>
  );
}
