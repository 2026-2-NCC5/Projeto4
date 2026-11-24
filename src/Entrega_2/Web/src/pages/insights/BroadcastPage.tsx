import { Megaphone, Send, Smartphone } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { PageHeader, SectionHeader, Surface } from '@/components/ui/Display';
import { TextArea, TextInput } from '@/components/ui/Form';
import { AccessDenied } from '@/components/feedback/States';
import { useSession } from '@/features/auth/session';
import { BROADCAST_LIMITS, useSendBroadcast } from '@/features/notifications/broadcast';
import { messageForError } from '@/services/api/client';
import type { NotificationBroadcastResult } from '@/types/api';

const plural = (count: number, one: string, many: string) => `${count.toLocaleString('pt-BR')} ${count === 1 ? one : many}`;

/** Prévia de como o aviso aparece na tela de bloqueio do celular. */
function PhonePreview({ title, body }: { title: string; body: string }) {
  return (
    <div aria-hidden className="rounded-xl border border-line bg-paper p-3">
      <div className="flex items-start gap-3 rounded-lg bg-white p-3 shadow-sm">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-action text-white">
          <Smartphone size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-caption text-mist">ASA Conecta · agora</p>
          <p className="truncate text-body font-semibold text-ink">{title || 'Título do aviso'}</p>
          <p className="line-clamp-3 text-small text-slate">{body || 'O texto do aviso aparece aqui.'}</p>
        </div>
      </div>
    </div>
  );
}

/** Enviar aviso: a equipe do ASA escreve uma vez e todos os alunos recebem na central e por push no app. */
export default function BroadcastPage() {
  const { can } = useSession();
  const send = useSendBroadcast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<NotificationBroadcastResult | null>(null);

  if (!can('notifications:broadcast')) return <AccessDenied />;

  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  const valid = trimmedTitle.length >= BROADCAST_LIMITS.title.min && trimmedBody.length >= BROADCAST_LIMITS.body.min;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) setConfirming(true);
  };
  const confirm = () => {
    send.mutate(
      { title: trimmedTitle, body: trimmedBody },
      {
        onSuccess: (data) => {
          setResult(data);
          setConfirming(false);
          setTitle('');
          setBody('');
        },
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Enviar aviso"
        description="O aviso vai para todos os alunos ativos: aparece na central de avisos do app e do portal e chega como notificação no celular de quem ativou as notificações."
      />
      {result ? (
        <p role="status" className="mb-4 rounded-md border border-line bg-white px-4 py-3 text-small text-ink">
          {result.recipients === 0
            ? 'Este aviso já tinha sido enviado há pouco; ninguém recebeu em dobro.'
            : `Aviso enviado para ${plural(result.recipients, 'aluno', 'alunos')}. ${result.pushEnabled ? `${plural(result.pushSent, 'notificação chegou', 'notificações chegaram')} ao celular.` : 'O envio por push está desligado neste ambiente; o aviso ficou só na central.'}`}
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Surface>
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <TextInput
              label="Título"
              required
              value={title}
              maxLength={BROADCAST_LIMITS.title.max}
              onChange={(event) => setTitle(event.target.value)}
              hint={`${title.length}/${BROADCAST_LIMITS.title.max} · curto e direto (ex.: "Rematrícula aberta")`}
            />
            <TextArea
              label="Mensagem"
              required
              rows={4}
              value={body}
              maxLength={BROADCAST_LIMITS.body.max}
              onChange={(event) => setBody(event.target.value)}
              hint={`${body.length}/${BROADCAST_LIMITS.body.max} · diga o que fazer e até quando. Não inclua dados pessoais.`}
            />
            <div>
              <Button type="submit" variant="primary" icon={Send} disabled={!valid}>
                Revisar e enviar
              </Button>
            </div>
          </form>
        </Surface>
        <section aria-labelledby="preview-title">
          <SectionHeader id="preview-title" title="Prévia no celular" />
          <PhonePreview title={trimmedTitle} body={trimmedBody} />
          <p className="mt-3 flex items-start gap-2 text-small text-slate">
            <Megaphone size={20} aria-hidden className="mt-px shrink-0" />
            Quem desligou "Avisos da plataforma" nas preferências recebe só na central, sem notificação.
          </p>
        </section>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Enviar para todos os alunos?"
        description={
          <>
            <strong className="text-ink">{trimmedTitle}</strong>
            <br />
            {trimmedBody}
            <br />
            <br />
            Depois de enviado, o aviso não pode ser apagado do celular dos alunos.
          </>
        }
        confirmLabel="Enviar aviso"
        loading={send.isPending}
        error={send.isError ? messageForError(send.error, 'Não foi possível enviar o aviso agora. Tente novamente.') : null}
        onConfirm={confirm}
        onClose={() => {
          setConfirming(false);
          send.reset();
        }}
      />
    </>
  );
}
