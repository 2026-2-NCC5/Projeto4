import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Display';
import { cn } from '@/lib/cn';
import { dayKey, formatTime } from '@/lib/format';
import type { AppointmentMode, AppointmentPolicy, AppointmentSlot } from '@/types/api';
import { appointmentKeys, appointmentsApi, type SlotQuery } from '../api';
import { addDays, dayOfMonth, daysBetween, formatKeyLong, formatRange, formatTimeRange, plural, WEEKDAY_SHORT, weekdayOf } from '../dates';
import { useNow } from '../hooks';
import { MODE_META } from '../labels';
import { InlineAlert, InlineFailure } from './common';

/** Dias por página da faixa de datas ("próximas semanas" avança 14 dias). */
export const PAGE_DAYS = 14;
const DAY_MS = 86_400_000;

/**
 * Mesmo horário oferecido: início, fim, modalidade e local. O mesmo início pode existir em locais diferentes
 * (um botão por local), e o local escolhido vai na reserva (`location`), então ele faz parte da identidade.
 */
export const sameSlot = (a: AppointmentSlot | null, b: AppointmentSlot | null): boolean =>
  Boolean(a && b && a.startsAt === b.startsAt && a.endsAt === b.endsAt && a.mode === b.mode && a.location === b.location);

const slotKey = (slot: AppointmentSlot): string => `${slot.startsAt}|${slot.endsAt}|${slot.mode}|${slot.location ?? ''}`;

/** Rótulo do local de um horário: sala informada pela equipe ou a modalidade. */
export const slotPlace = (slot: Pick<AppointmentSlot, 'mode' | 'location'>): string => slot.location ?? MODE_META[slot.mode].label;

interface SlotPickerProps {
  mode: AppointmentMode;
  policy: AppointmentPolicy;
  selected: AppointmentSlot | null;
  onSelect: (slot: AppointmentSlot) => void;
  /**
   * remarcação: o horário atual aparece desabilitado. O servidor recusa o mesmo início na mesma modalidade em
   * qualquer local ("Escolha um horário diferente do atual"), então o mesmo horário em outro local também fica
   * desabilitado, com o motivo.
   */
  current?: { startsAt: string; mode: AppointmentMode; location: string | null };
}

/**
 * Escolha de horário: faixa com os próximos 14 dias (quantidade de horários livres por dia, dia sem horário
 * desabilitado), paginação até o horizonte da política e a grade de horários do dia escolhido. Tudo vem de
 * GET /api/appointments/slots; nada é inventado no portal.
 */
export function SlotPicker({ mode, policy, selected, onSelect, current }: SlotPickerProps) {
  const baseId = useId();
  const now = useNow(60_000);
  const today = dayKey(now);
  const lastDay = dayKey(new Date(now.getTime() + policy.maxDaysAhead * DAY_MS));
  const pageCount = Math.max(1, Math.ceil((Math.max(0, daysBetween(today, lastDay)) + 1) / PAGE_DAYS));
  const [page, setPage] = useState(() => {
    if (!selected) return 0;
    return Math.max(0, Math.floor(daysBetween(today, dayKey(selected.startsAt)) / PAGE_DAYS));
  });
  const [chosenDay, setChosenDay] = useState<string | null>(() => (selected ? dayKey(selected.startsAt) : null));

  const safePage = Math.min(page, pageCount - 1);
  const from = addDays(today, safePage * PAGE_DAYS);
  const pageEnd = addDays(from, PAGE_DAYS - 1);
  const to = pageEnd < lastDay ? pageEnd : lastDay;
  const query: SlotQuery = { from, to, mode };
  const slots = useQuery({ queryKey: appointmentKeys.slots(query), queryFn: () => appointmentsApi.slots(query), staleTime: 30_000 });

  const days = slots.data?.days ?? [];
  const firstWithSlots = days.find((day) => day.slots.length > 0)?.date ?? null;
  const activeDay = days.find((day) => day.date === chosenDay && day.slots.length > 0)?.date ?? firstWithSlots;
  const daySlots = days.find((day) => day.date === activeDay)?.slots ?? [];
  // mesmo início em mais de um local: o aviso deixa claro que o local também é escolhido
  const multiplePlaces = new Set(daySlots.map((slot) => slot.startsAt)).size < daySlots.length;
  const totalFree = days.reduce((sum, day) => sum + day.slots.length, 0);
  const selectedListed = selected ? days.some((day) => day.slots.some((slot) => sameSlot(slot, selected))) : true;
  const selectedInPage = selected ? dayKey(selected.startsAt) >= from && dayKey(selected.startsAt) <= to : false;

  const goToPage = (next: number) => {
    setPage(next);
    setChosenDay(null);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-small text-slate" aria-live="polite">
          <span className="sr-only">Dias exibidos: </span>
          {formatRange(from, to)}
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" icon={ChevronLeft} disabled={safePage === 0} onClick={() => goToPage(safePage - 1)} aria-label="Semanas anteriores">
            <span className="hidden sm:inline">Anteriores</span>
          </Button>
          <Button size="sm" iconRight={ChevronRight} disabled={safePage >= pageCount - 1} onClick={() => goToPage(safePage + 1)} aria-label="Próximas semanas">
            <span className="hidden sm:inline">Próximas semanas</span>
          </Button>
        </div>
      </div>

      {slots.isPending ? (
        <div aria-busy className="flex flex-col gap-4">
          <span className="sr-only">Carregando horários livres</span>
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {Array.from({ length: 14 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        </div>
      ) : slots.error ? (
        <InlineFailure error={slots.error} onRetry={() => void slots.refetch()} />
      ) : (
        <>
          <div role="group" aria-label="Dias" className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {days.map((day) => {
              const count = day.slots.length;
              const pressed = day.date === activeDay;
              return (
                <button
                  key={day.date}
                  type="button"
                  aria-pressed={pressed}
                  disabled={count === 0}
                  onClick={() => setChosenDay(day.date)}
                  aria-label={`${day.date === today ? 'hoje, ' : ''}${formatKeyLong(day.date)}: ${count === 0 ? 'sem horários livres' : plural(count, 'horário livre', 'horários livres')}`}
                  className={cn(
                    'flex min-w-0 flex-col items-center gap-0.5 rounded-md border px-0.5 py-2 text-center transition-colors duration-150',
                    pressed
                      ? 'border-action bg-action-soft text-action'
                      : count === 0
                        ? 'cursor-not-allowed border-line-soft bg-snow text-fog'
                        : 'border-line bg-white text-ink hover:border-line-strong hover:bg-paper',
                  )}
                >
                  <span className="text-caption">{day.date === today ? 'hoje' : WEEKDAY_SHORT[weekdayOf(day.date)]}</span>
                  <span className={cn('text-h4 tabular-nums', pressed ? 'font-semibold' : 'font-medium')}>{dayOfMonth(day.date)}</span>
                  <span className={cn('text-caption tabular-nums', !pressed && count > 0 && 'text-slate')}>{count === 0 ? '–' : count}</span>
                </button>
              );
            })}
          </div>
          <p className="-mt-2 text-caption text-mist">O número abaixo de cada dia é a quantidade de horários livres.</p>

          {selected && !selectedListed && selectedInPage ? (
            <InlineAlert tone="warning">
              O horário escolhido ({formatTime(selected.startsAt)}) não aparece mais como livre. Escolha outro horário.
            </InlineAlert>
          ) : null}

          {totalFree === 0 ? (
            <InlineAlert tone="info">
              Nenhum horário livre {safePage < pageCount - 1 ? 'nestes dias. Veja as próximas semanas.' : 'até o fim do período aberto para agendamento. Tente a outra modalidade ou volte mais tarde: novos horários aparecem quando a equipe abre a agenda.'}
            </InlineAlert>
          ) : activeDay ? (
            <section aria-labelledby={`${baseId}-day`} className="flex flex-col gap-2">
              <h3 id={`${baseId}-day`} className="text-h4 font-semibold text-ink">
                Horários de {formatKeyLong(activeDay)}
              </h3>
              {multiplePlaces ? <p className="text-small text-slate">Alguns horários existem em mais de um local. O local do botão escolhido é o que fica reservado.</p> : null}
              <div role="group" aria-labelledby={`${baseId}-day`} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {daySlots.map((slot) => {
                  const sameTime = current ? current.startsAt === slot.startsAt && current.mode === slot.mode : false;
                  const isCurrent = sameTime && current?.location === slot.location;
                  const pressed = sameSlot(slot, selected);
                  return (
                    <button
                      key={slotKey(slot)}
                      type="button"
                      aria-pressed={pressed}
                      disabled={sameTime}
                      onClick={() => onSelect(slot)}
                      className={cn(
                        'flex min-w-0 flex-col items-start rounded-md border px-3 py-2 text-left transition-colors duration-150',
                        pressed ? 'border-action bg-action-soft' : 'border-line bg-white hover:border-line-strong hover:bg-paper',
                        sameTime && 'cursor-not-allowed opacity-60 hover:border-line hover:bg-white',
                      )}
                    >
                      <span className={cn('text-body tabular-nums', pressed ? 'font-semibold text-action' : 'font-medium text-ink')}>{formatTimeRange(slot.startsAt, slot.endsAt)}</span>
                      <span className="line-clamp-2 w-full break-words text-caption text-slate">
                        {isCurrent ? 'Horário atual' : sameTime ? `${slotPlace(slot)} · mesmo horário do atual` : slotPlace(slot)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 text-caption text-mist">
            {slots.data ? <span>Horários consultados às {formatTime(slots.data.generatedAt)}.</span> : null}
            <Button size="sm" variant="ghost" icon={RefreshCw} loading={slots.isFetching} onClick={() => void slots.refetch()}>
              Atualizar horários
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
