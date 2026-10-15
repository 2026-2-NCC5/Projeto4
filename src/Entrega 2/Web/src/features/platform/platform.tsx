import { useQuery } from '@tanstack/react-query';
import { FlaskConical, Info, Megaphone, ShieldCheck } from 'lucide-react';
import { platformApi } from '@/services/api/endpoints';
import type { PlatformInfo } from '@/types/api';
import { cn } from '@/lib/cn';

export const platformKeys = { info: ['platform', 'info'] as const };

/** Informações públicas da plataforma (modo de dados, recursos ativos, horário do ASA). */
export function usePlatformInfo() {
  return useQuery({ queryKey: platformKeys.info, queryFn: platformApi.info, staleTime: 60_000 });
}

/**
 * Faixa permanente que diz de onde vêm os dados. Em modo demonstração, nada fictício aparece
 * sem este rótulo; em modo institucional, o rótulo deixa claro que os dados são autorizados.
 */
export function DataModeBanner({ info, compact }: { info: PlatformInfo | undefined; compact?: boolean }) {
  if (!info) return null;
  const demo = info.dataMode === 'demo';
  const academicUnavailable = info.academicSource.status === 'unavailable';
  return (
    <div
      role="note"
      aria-label="Origem dos dados"
      className={cn(
        'flex items-center gap-2 border-b px-4 text-small',
        compact ? 'py-1.5' : 'py-2',
        demo ? 'border-warning/30 bg-warning-soft text-warning-text' : 'border-line bg-white text-slate',
      )}
    >
      {demo ? <FlaskConical size={16} aria-hidden className="shrink-0" /> : <ShieldCheck size={16} aria-hidden className="shrink-0 text-success" />}
      <span className="font-semibold">{info.dataModeLabel}</span>
      {!compact ? (
        <span className="hidden sm:inline truncate">
          {demo ? '· Contas, notas, chamados e agendamentos de exemplo. Não representam pessoas reais.' : academicUnavailable ? `· ${info.academicSource.message}` : null}
        </span>
      ) : null}
    </div>
  );
}

export function AnnouncementBanner({ info }: { info: PlatformInfo | undefined }) {
  if (!info?.announcement) return null;
  const attention = info.announcement.tone === 'attention';
  return (
    <div role="status" className={cn('flex items-start gap-2 border-b px-4 py-2 text-small', attention ? 'border-info/30 bg-info-soft text-info-text' : 'border-line bg-white text-slate')}>
      {attention ? <Megaphone size={16} aria-hidden className="mt-0.5 shrink-0" /> : <Info size={16} aria-hidden className="mt-0.5 shrink-0" />}
      <span>{info.announcement.text}</span>
    </div>
  );
}
