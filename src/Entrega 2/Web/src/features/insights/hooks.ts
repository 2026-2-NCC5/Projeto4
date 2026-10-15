import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { institutionToday, periodQuery, readPeriod, type PeriodQuery, type ResolvedPeriod } from './period';

/** Período vindo da URL, a consulta para a API (null se inválido) e como alterá-lo. */
export function usePeriodFromUrl(): { period: ResolvedPeriod; query: PeriodQuery | null; today: string; update: (changes: Record<string, string | null>) => void } {
  const [params, setParams] = useSearchParams();
  const today = institutionToday();
  const period = readPeriod(params, today);
  const update = useCallback(
    (changes: Record<string, string | null>) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return { period, query: periodQuery(period), today, update };
}
