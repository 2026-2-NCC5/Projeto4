import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button, IconButton } from './Button';
import { TextArea } from './Form';

/** Modal e gaveta lateral acessíveis, com foco gerido pelo Radix Dialog. */
export function Dialog({ open, onClose, title, description, children, footer, side = 'center', size = 'md', modal = true, mobileFullScreen = false, contentStyle }: {
  open: boolean; onClose: () => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode; side?: 'center' | 'right'; size?: 'sm' | 'md' | 'lg'; modal?: boolean; mobileFullScreen?: boolean; contentStyle?: CSSProperties;
}) {
  const titleId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <DialogPrimitive.Root modal={modal} open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/35 data-[state=open]:animate-[asa-overlay-in_150ms_ease-out] data-[state=closed]:animate-[asa-overlay-out_120ms_ease-in]" />
        <DialogPrimitive.Content ref={contentRef} style={contentStyle} tabIndex={-1} onOpenAutoFocus={(event) => { event.preventDefault(); contentRef.current?.focus({ preventScroll: true }); }} aria-labelledby={titleId} className={cn(
          'fixed z-50 flex min-h-0 max-h-[min(90dvh,56rem)] flex-col border border-line bg-white text-ink shadow-lg outline-none',
          side === 'right' ? 'data-[state=open]:animate-[asa-drawer-right-in_180ms_ease-out]' : 'data-[state=open]:animate-[asa-dialog-in_180ms_ease-out] data-[state=closed]:animate-[asa-dialog-out_120ms_ease-in]',
          side === 'right' ? 'inset-y-0 right-0 h-full w-full max-h-full sm:max-w-[480px]' : mobileFullScreen
            ? 'left-0 right-0 top-[var(--dialog-viewport-top,0px)] h-[var(--dialog-viewport-height,100dvh)] max-h-[var(--dialog-viewport-height,100dvh)] w-full translate-x-0 translate-y-0 rounded-none pb-[env(safe-area-inset-bottom)] sm:left-1/2 sm:right-auto sm:top-1/2 sm:h-auto sm:max-h-[min(90dvh,56rem)] sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:pb-0'
            : 'left-1/2 top-1/2 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl',
          side === 'center' && (size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl'),
        )}>
          <div className={cn('flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4', mobileFullScreen && 'pt-[calc(1rem+env(safe-area-inset-top))] sm:pt-4')}>
            <div className="min-w-0"><DialogPrimitive.Title id={titleId} className="text-h3 font-semibold">{title}</DialogPrimitive.Title>{description ? <DialogPrimitive.Description className="mt-0.5 text-small text-slate">{description}</DialogPrimitive.Description> : null}</div>
            <DialogPrimitive.Close asChild><IconButton label="Fechar" icon={X} size="sm" /></DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
          {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Confirmação acessível para ações com impacto de acesso ou dados. */
export function ConfirmDialog({ open, title, description, confirmLabel, tone = 'primary', loading, requireReason, reasonLabel = 'Justificativa', error, onConfirm, onClose }: {
  open: boolean; title: string; description: ReactNode; confirmLabel: string; tone?: 'primary' | 'danger'; loading?: boolean; requireReason?: { min: number; max: number }; reasonLabel?: string; error?: string | null; onConfirm: (reason: string) => void; onClose: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [reason, setReason] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) { setWasOpen(open); if (!open) setReason(''); }
  const tooShort = requireReason ? reason.trim().length < requireReason.min : false;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next && !loading) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40 data-[state=open]:animate-[asa-overlay-in_150ms_ease-out]" />
        <DialogPrimitive.Content ref={contentRef} tabIndex={-1} onOpenAutoFocus={(event) => { event.preventDefault(); contentRef.current?.focus({ preventScroll: true }); }} onEscapeKeyDown={(event) => { if (loading) event.preventDefault(); }} className="fixed left-1/2 top-1/2 z-50 max-h-[min(90dvh,48rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-line bg-white p-5 text-ink shadow-lg outline-none data-[state=open]:animate-[asa-dialog-in_180ms_ease-out]">
          <DialogPrimitive.Title className="text-h3 font-semibold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description asChild><div className="mt-2 text-body leading-6 text-slate">{description}</div></DialogPrimitive.Description>
          {requireReason ? <div className="mt-4"><TextArea label={reasonLabel} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={requireReason.max} hint={requireReason.min > 0 ? `Mínimo de ${requireReason.min} caracteres.` : `Opcional · até ${requireReason.max} caracteres.`} rows={3} /></div> : null}
          {error ? <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-small text-danger-text">{error}</p> : null}
          <div className="mt-6 flex flex-wrap justify-end gap-2"><Button disabled={loading} onClick={onClose}>Voltar</Button><Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading} disabled={tooShort} onClick={() => onConfirm(reason.trim())}>{confirmLabel}</Button></div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
