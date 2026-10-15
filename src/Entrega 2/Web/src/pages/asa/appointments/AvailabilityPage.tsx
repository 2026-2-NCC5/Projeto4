import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarPlus, CalendarX, CheckCircle2, PauseCircle } from 'lucide-react';
import { createElement, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Badge, PageHeader, SectionHeader } from '@/components/ui/Display';
import { DataTable, type Column } from '@/components/data/DataTable';
import { AccessDenied, EmptyState, ErrorState, LoadingRows } from '@/components/feedback/States';
import { useToast } from '@/components/ui/Toast';
import { useMe, useSession } from '@/features/auth/session';
import { appointmentKeys, availabilityApi, isBlockingError, reasonOf } from '@/features/appointments/api';
import { AppointmentsFailure } from '@/features/appointments/components/common';
import { plural, WEEKDAY_LABELS, WEEKDAY_ORDER } from '@/features/appointments/dates';
import { useNow } from '@/features/appointments/hooks';
import { MODE_META } from '@/features/appointments/labels';
import { dayKey, formatCalendarDate } from '@/lib/format';
import { messageForError } from '@/services/api/client';
import type { AvailabilityRule } from '@/types/api';
import { AvailabilityFormDialog, previewSlots } from './AvailabilityFormDialog';

const weekdayRank = (weekday: number): number => WEEKDAY_ORDER.indexOf(weekday as (typeof WEEKDAY_ORDER)[number]);

const byWeekdayAndTime = (a: AvailabilityRule, b: AvailabilityRule): number =>
  weekdayRank(a.weekday) - weekdayRank(b.weekday) || a.startTime.localeCompare(b.startTime) || a.attendant.fullName.localeCompare(b.attendant.fullName, 'pt-BR');

function validity(rule: AvailabilityRule): string {
  if (rule.validUntil) return `${formatCalendarDate(rule.validFrom)} a ${formatCalendarDate(rule.validUntil)}`;
  return `Desde ${formatCalendarDate(rule.validFrom)}`;
}

type RuleState = 'active' | 'paused' | 'expired' | 'scheduled';

function ruleState(rule: AvailabilityRule, today: string): RuleState {
  if (!rule.active) return 'paused';
  if (rule.validUntil && rule.validUntil < today) return 'expired';
  if (rule.validFrom > today) return 'scheduled';
  return 'active';
}

const STATE_BADGE: Record<RuleState, { label: string; tone: 'success' | 'neutral' | 'info'; icon: typeof CheckCircle2 }> = {
  active: { label: 'Ativa', tone: 'success', icon: CheckCircle2 },
  paused: { label: 'Pausada', tone: 'neutral', icon: PauseCircle },
  expired: { label: 'Vigência encerrada', tone: 'neutral', icon: CalendarX },
  scheduled: { label: 'Começa depois', tone: 'info', icon: CalendarPlus },
};

/** Modalidade com o local logo abaixo (o local é o que o aluno vê ao escolher o horário). */
function ModeCell({ rule }: { rule: AvailabilityRule }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="inline-flex items-center gap-1.5 text-small text-ink">
        {createElement(MODE_META[rule.mode].icon, { size: 16, 'aria-hidden': true, className: 'shrink-0 text-slate' })}
        {MODE_META[rule.mode].label}
      </span>
      <span className="text-caption text-mist">{rule.location ?? 'Sem local informado'}</span>
    </span>
  );
}

/** Horário com a duração de cada atendimento e quantos horários a faixa gera. */
const timeColumn: Column<AvailabilityRule> = {
  key: 'time',
  header: 'Horário e duração',
  render: (rule) => (
    <span className="flex flex-col whitespace-nowrap">
      <span className="tabular-nums text-ink">{`${rule.startTime}–${rule.endTime}`}</span>
      <span className="text-caption text-mist">
        {rule.slotMinutes} min · {plural(previewSlots(rule.startTime, rule.endTime, rule.slotMinutes).length, 'horário', 'horários')}
      </span>
    </span>
  ),
};
const modeColumn: Column<AvailabilityRule> = { key: 'mode', header: 'Modalidade e local', className: 'min-w-[11rem]', render: (rule) => <ModeCell rule={rule} /> };
const validityColumn: Column<AvailabilityRule> = { key: 'validity', header: 'Vigência', render: (rule) => <span className="text-small text-slate">{validity(rule)}</span> };

/** "Minha disponibilidade": faixas de quem está logado (criar, editar, pausar) e, só para leitura, as da equipe. */
export default function AvailabilityPage() {
  const { can } = useSession();
  const me = useMe();
  const allowed = can('availability:manage:own') || can('availability:manage:any');
  const queryClient = useQueryClient();
  const toast = useToast();
  const now = useNow(60_000);
  const today = dayKey(now);
  const mine = useQuery({ queryKey: appointmentKeys.availabilityList('mine'), queryFn: () => availabilityApi.list('mine'), enabled: allowed });
  const team = useQuery({ queryKey: appointmentKeys.availabilityList('team'), queryFn: () => availabilityApi.list(), enabled: allowed });
  const [form, setForm] = useState<{ open: boolean; rule: AvailabilityRule | null }>({ open: false, rule: null });

  const toggle = useMutation({
    mutationFn: (rule: AvailabilityRule) => availabilityApi.update(rule.id, { active: !rule.active }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: appointmentKeys.availability });
      toast.show(
        saved.active
          ? `Faixa de ${WEEKDAY_LABELS[saved.weekday]?.toLowerCase()} reativada. Os horários voltam a aparecer para os alunos.`
          : `Faixa de ${WEEKDAY_LABELS[saved.weekday]?.toLowerCase()} pausada. Novos agendamentos param; os já marcados continuam valendo.`,
      );
    },
    onError: (error) => {
      const extra = reasonOf(error) === 'availability_overlap' ? ' Pause ou ajuste a outra faixa antes de reativar esta.' : '';
      toast.show(`${messageForError(error, 'Não foi possível alterar a faixa.')}${extra}`, 'error');
    },
  });

  if (!allowed) return <AccessDenied />;

  const blocking = [mine.error, team.error].find((error) => error && isBlockingError(error));
  const header = (
    <PageHeader
      eyebrow={
        <Link to="/asa/agendamentos" className="inline-flex items-center gap-1 rounded-sm text-small text-slate hover:text-ink">
          <ArrowLeft size={16} aria-hidden />
          Agenda do ASA
        </Link>
      }
      title="Minha disponibilidade"
      description="Faixas semanais em que você atende. Os horários livres gerados por elas são os que os alunos podem agendar."
      actions={
        blocking ? undefined : (
          <Button variant="primary" icon={CalendarPlus} onClick={() => setForm({ open: true, rule: null })}>
            Nova faixa
          </Button>
        )
      }
    />
  );
  if (blocking) {
    return (
      <>
        {header}
        <AppointmentsFailure error={blocking} area="asa" />
      </>
    );
  }

  const myRules = [...(mine.data?.items ?? [])].sort(byWeekdayAndTime);
  const teamRules = (team.data?.items ?? []).filter((rule) => ruleState(rule, today) === 'active' || ruleState(rule, today) === 'scheduled').sort(byWeekdayAndTime);

  const myColumns: Column<AvailabilityRule>[] = [
    { key: 'weekday', header: 'Dia', render: (rule) => <span className="whitespace-nowrap font-medium text-ink">{WEEKDAY_LABELS[rule.weekday]}</span> },
    timeColumn,
    modeColumn,
    validityColumn,
    {
      key: 'state',
      header: 'Ativo',
      render: (rule) => {
        const meta = STATE_BADGE[ruleState(rule, today)];
        return (
          <Badge tone={meta.tone} icon={meta.icon}>
            {meta.label}
          </Badge>
        );
      },
    },
    {
      key: 'actions',
      header: 'Ações',
      render: (rule) => {
        const label = `${WEEKDAY_LABELS[rule.weekday]} ${rule.startTime}–${rule.endTime}`;
        const busy = toggle.isPending && toggle.variables?.id === rule.id;
        return (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setForm({ open: true, rule })} aria-label={`Editar faixa ${label}`}>
              Editar
            </Button>
            <Button size="sm" loading={busy} disabled={toggle.isPending && !busy} onClick={() => toggle.mutate(rule)} aria-label={`${rule.active ? 'Pausar' : 'Reativar'} faixa ${label}`}>
              {rule.active ? 'Pausar' : 'Reativar'}
            </Button>
          </div>
        );
      },
    },
  ];

  const teamColumns: Column<AvailabilityRule>[] = [
    {
      key: 'attendant',
      header: 'Atendente',
      render: (rule) => (
        <span className="text-small text-ink">
          {rule.attendant.fullName}
          {rule.attendant.id === me.user.id ? <span className="text-mist"> (você)</span> : null}
        </span>
      ),
    },
    { key: 'weekday', header: 'Dia', render: (rule) => <span className="whitespace-nowrap">{WEEKDAY_LABELS[rule.weekday]}</span> },
    timeColumn,
    modeColumn,
    validityColumn,
  ];

  return (
    <>
      {header}
      <div className="flex flex-col gap-8">
        <section aria-labelledby="disponibilidade-minha">
          <SectionHeader
            id="disponibilidade-minha"
            title="Suas faixas"
            description="Pausar uma faixa para novos agendamentos não cancela os atendimentos já marcados nela."
          />
          {mine.isPending ? (
            <LoadingRows rows={3} />
          ) : mine.error ? (
            <ErrorState error={mine.error} onRetry={() => void mine.refetch()} title="Não foi possível carregar suas faixas" />
          ) : myRules.length === 0 ? (
            <EmptyState
              icon={CalendarPlus}
              title="Você ainda não tem faixas de atendimento"
              description="Crie uma faixa (por exemplo, segundas das 09:00 às 12:00, atendimentos de 30 min) para que os alunos possam agendar com você."
            />
          ) : (
            <DataTable caption="Suas faixas de disponibilidade" columns={myColumns} rows={myRules} rowKey={(rule) => rule.id} />
          )}
        </section>

        <section aria-labelledby="disponibilidade-equipe">
          <SectionHeader id="disponibilidade-equipe" title="Equipe" description="Faixas ativas de toda a equipe do ASA, só para consulta." />
          {team.isPending ? (
            <LoadingRows rows={3} />
          ) : team.error ? (
            <ErrorState error={team.error} onRetry={() => void team.refetch()} title="Não foi possível carregar as faixas da equipe" />
          ) : teamRules.length === 0 ? (
            <EmptyState title="Nenhuma faixa ativa na equipe" description="Sem faixas ativas, os alunos não encontram horários para agendar." />
          ) : (
            <DataTable caption="Faixas de disponibilidade da equipe" columns={teamColumns} rows={teamRules} rowKey={(rule) => rule.id} />
          )}
        </section>
      </div>
      <AvailabilityFormDialog open={form.open} rule={form.rule} today={today} onClose={() => setForm((current) => ({ ...current, open: false }))} />
    </>
  );
}
