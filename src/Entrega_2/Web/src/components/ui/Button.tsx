import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ComponentType, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg';
type Icon = ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-action text-white hover:bg-action-hover active:bg-action-pressed border border-action',
  secondary: 'bg-white text-ink border border-line hover:border-line-strong hover:bg-paper',
  ghost: 'bg-transparent text-action border border-transparent hover:bg-action-soft',
  danger: 'bg-white text-danger-text border border-line hover:border-danger hover:bg-danger-soft',
  subtle: 'bg-snow text-ink border border-transparent hover:bg-cloud',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-small gap-1.5 rounded-md',
  md: 'h-10 px-4 text-body gap-2 rounded-md',
  lg: 'h-12 px-5 text-body gap-2 rounded-md',
};

export function buttonClasses(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra?: string): string {
  return cn(
    'inline-flex items-center justify-center font-semibold whitespace-nowrap transition-colors duration-150 select-none',
    'disabled:opacity-55 disabled:cursor-not-allowed aria-disabled:opacity-55 aria-disabled:pointer-events-none',
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: Icon;
  iconRight?: Icon;
  fullWidth?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', loading = false, icon: IconLeft, iconRight: IconRight, fullWidth, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  const iconSize = size === 'sm' ? 16 : 18;
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, cn(fullWidth && 'w-full', className))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 size={iconSize} className="animate-spin" aria-hidden /> : IconLeft ? <IconLeft size={iconSize} aria-hidden /> : null}
      {children}
      {IconRight && !loading ? <IconRight size={iconSize} aria-hidden /> : null}
    </button>
  );
}

export interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: Icon;
}

export function ButtonLink({ variant = 'secondary', size = 'md', icon: IconLeft, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, typeof className === 'string' ? className : undefined)} {...rest}>
      {IconLeft ? <IconLeft size={size === 'sm' ? 16 : 18} aria-hidden /> : null}
      {children as ReactNode}
    </Link>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: Icon;
  size?: 'sm' | 'md';
  tone?: 'neutral' | 'action';
  badge?: number;
}

/** Botão só com ícone: sempre com nome acessível e área de toque de 40px. */
export function IconButton({ label, icon: IconGlyph, size = 'md', tone = 'neutral', badge, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex items-center justify-center rounded-md transition-colors duration-150',
        size === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
        tone === 'action' ? 'text-action hover:bg-action-soft' : 'text-slate hover:bg-snow hover:text-ink',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...rest}
    >
      <IconGlyph size={size === 'sm' ? 18 : 20} aria-hidden />
      {badge !== undefined && badge > 0 ? (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[11px] leading-[18px] font-semibold text-center" aria-hidden>
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </button>
  );
}

export function Spinner({ label = 'Carregando', size = 20 }: { label?: string; size?: number }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-mist">
      <Loader2 size={size} className="animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
