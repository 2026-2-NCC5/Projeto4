import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button, IconButton } from './Button';
import { TextArea } from './Form';

/**
 * Diálogo modal nativo (<dialog> + showModal): foco preso, Esc fecha, conteúdo atrás inerte e camada superior.
 * `side="right"` vira gaveta lateral (detalhes, filtros).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = 'center',
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  side?: 'center' | 'right';
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        'm-0 max-h-none max-w-none border-0 bg-transparent p-0 text-ink',
        side === 'right' ? 'fixed inset-y-0 right-0 ml-auto h-full w-full sm:w-[480px]' : 'fixed inset-0 m-auto h-fit w-[calc(100%-2rem)]',
        side === 'center' && (size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl'),
      )}
    >
      {open ? (
        <div className={cn('flex flex-col border border-line bg-white asa-appear', side === 'right' ? 'h-full' : 'max-h-[85vh] rounded-xl')}>
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-h3 font-semibold">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="mt-0.5 text-small text-slate">
                  {description}
                </p>
              ) : null}
            </div>
            <IconButton label="Fechar" icon={X} size="sm" onClick={onClose} />
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

/**
 * Confirmação de ação crítica (cancelar, revogar, mudar papel). Com `requireReason`, a justificativa
 * é obrigatória e vai para a API (e para a auditoria).
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  loading,
  requireReason,
  reasonLabel = 'Justificativa',
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
  requireReason?: { min: number; max: number };
  reasonLabel?: string;
  error?: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  // ao fechar (inclusive por código), a justificativa digitada não sobra para a próxima abertura
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setReason('');
  }
  const tooShort = requireReason ? reason.trim().length < requireReason.min : false;
  return (
    <Dialog
      open={open}
      onClose={() => {
        setReason('');
        onClose();
      }}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>
            Voltar
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading} disabled={tooShort} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="text-body text-slate">{description}</div>
        {requireReason ? (
          <TextArea
            label={reasonLabel}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={requireReason.max}
            hint={requireReason.min > 0 ? `Mínimo de ${requireReason.min} caracteres.` : `Opcional · até ${requireReason.max} caracteres.`}
            rows={3}
          />
        ) : null}
        {error ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-small text-danger-text">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
