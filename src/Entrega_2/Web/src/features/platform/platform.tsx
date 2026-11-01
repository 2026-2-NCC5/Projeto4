import { useQuery } from '@tanstack/react-query';
import { Info, Megaphone } from 'lucide-react';
import { platformApi } from '@/services/api/endpoints';
import type { PlatformInfo } from '@/types/api';
import { cn } from '@/lib/cn';

export const platformKeys = { info: ['platform', 'info'] as const };

/** Informações públicas da plataforma (modo de dados, recursos ativos, horário do ASA). */
export function usePlatformInfo() {
  return useQuery({ queryKey: platformKeys.info, queryFn: platformApi.info, staleTime: 60_000 });
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
