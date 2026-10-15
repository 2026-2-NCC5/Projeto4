import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const CONTROL =
  'w-full rounded-md border bg-white text-ink text-body px-3 transition-colors duration-150 placeholder:text-mist ' +
  'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-action disabled:bg-snow disabled:text-mist';

const controlBorder = (invalid: boolean) => (invalid ? 'border-danger' : 'border-line hover:border-line-strong');

/*
 * `required` nos controles abaixo vira asterisco visual + aria-required, e não o atributo nativo: o atributo faz o
 * navegador bloquear o envio com o balão dele antes das mensagens da página (que valida e mostra o erro no campo)
 * e do servidor. Um aria-required passado explicitamente continua tendo prioridade.
 */
const requiredAria = (required: boolean | undefined) => (required ? { 'aria-required': true as const } : {});

export interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** rótulo visualmente oculto (ainda lido por leitores de tela) */
  hideLabel?: boolean;
  className?: string;
  children: (control: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** Rótulo + dica + erro ligados ao controle por id/aria-describedby. */
export function Field({ label, hint, error, required, hideLabel, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className={cn('text-small font-semibold text-ink', hideLabel && 'sr-only')}>
        {label}
        {required ? <span className="text-danger-text" aria-hidden> *</span> : null}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint ? (
        <p id={hintId} className="text-caption text-mist">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-caption text-danger-text" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & { label: string; hint?: ReactNode; error?: string | null; hideLabel?: boolean; containerClassName?: string };

export function TextInput({ label, hint, error, hideLabel, containerClassName, className, required, ...rest }: InputProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required} hideLabel={hideLabel} className={containerClassName}>
      {({ id, describedBy, invalid }) => (
        <input id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} {...requiredAria(required)} className={cn(CONTROL, 'h-10', controlBorder(invalid), className)} {...rest} />
      )}
    </Field>
  );
}

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & { label: string; hint?: ReactNode; error?: string | null; hideLabel?: boolean; containerClassName?: string };

export function TextArea({ label, hint, error, hideLabel, containerClassName, className, required, rows = 4, ...rest }: TextAreaProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required} hideLabel={hideLabel} className={containerClassName}>
      {({ id, describedBy, invalid }) => (
        <textarea id={id} rows={rows} aria-describedby={describedBy} aria-invalid={invalid || undefined} {...requiredAria(required)} className={cn(CONTROL, 'py-2 resize-y min-h-20', controlBorder(invalid), className)} {...rest} />
      )}
    </Field>
  );
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  hideLabel?: boolean;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
  containerClassName?: string;
};

export function Select({ label, hint, error, hideLabel, options, placeholder, containerClassName, className, required, ...rest }: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required} hideLabel={hideLabel} className={containerClassName}>
      {({ id, describedBy, invalid }) => (
        <select id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} {...requiredAria(required)} className={cn(CONTROL, 'h-10 pr-8', controlBorder(invalid), className)} {...rest}>
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Checkbox({ label, description, className, required, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 accent-action rounded-xs" {...requiredAria(required)} {...rest} />
      <label htmlFor={id} className="text-body text-ink leading-snug">
        {label}
        {required ? <span className="text-danger-text" aria-hidden> *</span> : null}
        {description ? <span className="block text-small text-mist">{description}</span> : null}
      </label>
    </div>
  );
}

/** Interruptor acessível (role="switch"). */
export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  const descriptionId = `${id}-descricao`;
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-body font-medium text-ink">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="text-small text-mist">
            {description}
          </p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 disabled:opacity-50',
          checked ? 'bg-action' : 'bg-mist',
        )}
      >
        <span className={cn('inline-block h-5 w-5 rounded-full bg-white transition-transform duration-150', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}
