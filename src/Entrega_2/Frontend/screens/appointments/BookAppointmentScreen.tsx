import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton, AppText, EmptyState, List, ListItem, ScheduleSkeleton, Skeleton, Surface } from '../../components/ui';
import {
  appointmentErrorMessage,
  appointmentLoadErrorMessage,
  appointmentStatusMeta,
  APPOINTMENTS,
  BOOKING_STEP_LABELS,
  ChoiceRow,
  DayStrip,
  formatAppointmentDate,
  formatCalendarDay,
  formatTimeRange,
  InlineNotice,
  isAppointmentsRouteMissing,
  isAppointmentsUnavailable,
  MODE_META,
  modeLabel,
  placeLabel,
  timezoneLabel,
  TimeGrid,
  useAppointment,
  useAppointmentBooking,
  type BookingController,
  type BookingStep,
} from '../../features/appointments';
import { categoryIcon } from '../../features/support/labels';
import { useNavBarInset } from '../../hooks/useNavBarInset';
import { useResponsive } from '../../hooks/useResponsive';
import { useAppNavigation } from '../../navigation/AppNavigator';
import { haptics } from '../../services/haptics';
import { makeStyles, useTheme } from '../../theme';
import type { Appointment } from '../../types/api';

const useStyles = makeStyles((theme) => ({
  scroll: { paddingBottom: theme.spacing.xxl },
  title: { marginBottom: theme.spacing.xs },
  subtitle: { marginBottom: theme.spacing.lg },
  progress: { marginBottom: theme.spacing.xl, gap: theme.spacing.xs },
  track: { flexDirection: 'row', gap: theme.spacing.xxs },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: theme.colors.surface.muted },
  segmentDone: { backgroundColor: theme.colors.brand.primaryStrong },
  bar: { flexDirection: 'row', gap: theme.spacing.sm, paddingTop: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.border.default, backgroundColor: theme.colors.background.primary },
  review: { paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg, gap: 2 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.md },
  edit: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  input: { ...theme.typography.input, color: theme.colors.text.primary, borderWidth: 1, borderColor: theme.colors.control.inputBorder, borderRadius: theme.radius.md, padding: theme.spacing.md, minHeight: 112, textAlignVertical: 'top', backgroundColor: theme.colors.control.inputBackground },
  bullet: { flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-start' },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md, marginBottom: theme.spacing.md },
  stripSkeleton: { flexDirection: 'row', gap: theme.spacing.sm },
  protocol: { alignItems: 'center', paddingVertical: theme.spacing.lg, gap: 2 },
  timeNotice: { marginBottom: theme.spacing.md },
  timeHint: { marginTop: theme.spacing.md },
}));

export interface BookAppointmentScreenProps {
  /** Remarca o agendamento informado (o assunto continua o mesmo). */
  rescheduleId?: string | undefined;
  /** Injetável em testes (dia de hoje determinístico). */
  now?: Date;
}

/** Agendar (ou remarcar) um atendimento: assunto → modalidade → dia → horário → observações e confirmação. */
export function BookAppointmentScreen({ rescheduleId, now }: BookAppointmentScreenProps) {
  return rescheduleId ? <RescheduleLoader id={rescheduleId} now={now} /> : <BookingFlow now={now} />;
}

/** Remarcar precisa do agendamento atual (do cache, na hora; ou da rede). */
function RescheduleLoader({ id, now }: { id: string; now?: Date | undefined }) {
  const theme = useTheme();
  const navigation = useAppNavigation();
  const resource = useAppointment(id, { poll: false });
  // O fluxo usa o agendamento como estava ao começar: atualizações em segundo plano não o interrompem.
  const [source, setSource] = useState<Appointment | null>(null);
  if (!source && resource.data) setSource(resource.data);

  if (source && source.canReschedule) return <BookingFlow reschedule={source} now={now} />;
  return (
    <Screen testID="appointment-book">
      <ScreenHeader title="Remarcar atendimento" onBack={navigation.goBack} />
      {source ? (
        <EmptyState
          title="Não é possível remarcar pelo app"
          message="O prazo para alterar este agendamento terminou ou ele não está mais ativo. Se precisar, fale com o ASA."
          icon="calendar-outline"
          actionLabel="Voltar"
          onAction={navigation.goBack}
          testID="reschedule-blocked"
        />
      ) : resource.status === 'error' ? (
        <InlineNotice
          message={appointmentErrorMessage(resource.error, 'Não conseguimos carregar este agendamento.')}
          tone="danger"
          actionLabel="Tentar novamente"
          onAction={resource.reload}
          style={{ marginTop: theme.spacing.sm }}
          testID="reschedule-error"
        />
      ) : (
        <ScheduleSkeleton rows={3} />
      )}
    </Screen>
  );
}

function BookingFlow({ reschedule = null, now }: { reschedule?: Appointment | null; now?: Date | undefined }) {
  const theme = useTheme();
  const styles = useStyles();
  const navigation = useAppNavigation();
  const navInset = useNavBarInset();
  const responsive = useResponsive();
  const scrollRef = useRef<ScrollView>(null);
  const booking = useAppointmentBooking(now ? { reschedule, now } : { reschedule });
  const { state, catalog, steps, stepIndex } = booking;

  // Cada etapa começa do topo.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [state.step]);

  if (state.result) {
    const created = state.result;
    return (
      <BookingDone
        appointment={created}
        rescheduled={Boolean(reschedule)}
        timeZone={booking.timezone}
        onOpen={() => navigation.openAppointment(created.id, { replace: true, dropPreviousDetail: Boolean(reschedule) })}
        onDone={navigation.goBack}
      />
    );
  }

  const handleBack = () => {
    if (!booking.back()) navigation.goBack();
  };
  const step = steps[stepIndex] ?? 'review';

  return (
    <Screen scroll={false} withNavSpace={false} keyboardAvoiding contentStyle={{ paddingBottom: 0 }} testID="appointment-book">
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <ScreenHeader title={reschedule ? 'Remarcar atendimento' : 'Agendar atendimento'} onBack={handleBack} backLabel={stepIndex > 0 ? 'Etapa anterior' : 'Voltar'} />
        <StepProgress steps={steps} index={stepIndex} />
        {catalog.status === 'loading' ? <ScheduleSkeleton rows={4} /> : null}
        {catalog.status === 'error' ? (
          // recurso desligado (403 feature_disabled), sem banco ou API sem agendamentos: não adianta tentar de novo
          isAppointmentsUnavailable(catalog.error) || isAppointmentsRouteMissing(catalog.error) ? (
            <EmptyState
              title="Agendamentos indisponíveis"
              message={appointmentLoadErrorMessage(catalog.error, 'Os agendamentos com o ASA estão indisponíveis no momento.')}
              icon="calendar-outline"
              actionLabel="Voltar"
              onAction={navigation.goBack}
              testID="book-unavailable"
            />
          ) : (
            <InlineNotice message={appointmentLoadErrorMessage(catalog.error, 'Não conseguimos carregar os assuntos de atendimento.')} tone="danger" actionLabel="Tentar novamente" onAction={catalog.reload} testID="book-catalog-error" />
          )
        ) : null}
        {catalog.data ? (
          <>
            {step === 'topic' ? <TopicStep booking={booking} /> : null}
            {step === 'mode' ? <ModeStep booking={booking} /> : null}
            {step === 'day' ? <DayStep booking={booking} /> : null}
            {step === 'time' ? <TimeStep booking={booking} /> : null}
            {step === 'review' ? <ReviewStep booking={booking} /> : null}
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: navInset + theme.spacing.sm, marginHorizontal: -responsive.gutter, paddingHorizontal: responsive.gutter }]}>
        {stepIndex > 0 ? (
          <View style={{ flex: 1 }}>
            <AppButton label="Voltar" variant="secondary" onPress={handleBack} disabled={state.submitting} fullWidth testID="book-back" />
          </View>
        ) : null}
        <View style={{ flex: 2 }}>
          {step === 'review' ? (
            <AppButton
              label={reschedule ? 'Confirmar remarcação' : 'Confirmar agendamento'}
              icon="checkmark"
              onPress={() => void booking.submit()}
              loading={state.submitting}
              loadingLabel={reschedule ? 'Remarcando' : 'Agendando'}
              disabled={!booking.canContinue}
              fullWidth
              testID="book-confirm"
            />
          ) : (
            <AppButton label="Continuar" icon="arrow-forward" iconPosition="right" onPress={booking.next} disabled={!booking.canContinue || !catalog.data} fullWidth testID="book-next" />
          )}
        </View>
      </View>
    </Screen>
  );
}

function StepProgress({ steps, index }: { steps: readonly BookingStep[]; index: number }) {
  const styles = useStyles();
  const current = steps[index];
  const label = `Etapa ${index + 1} de ${steps.length}${current ? ` · ${BOOKING_STEP_LABELS[current]}` : ''}`;
  return (
    <View style={styles.progress} accessible accessibilityLabel={label} testID="book-progress">
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      <View style={styles.track}>
        {steps.map((item, position) => (
          <View key={item} style={[styles.segment, position <= index && styles.segmentDone]} />
        ))}
      </View>
    </View>
  );
}

function StepTitle({ title, subtitle }: { title: string; subtitle?: string | null }) {
  const styles = useStyles();
  return (
    <>
      <AppText variant="h2" accessibilityRole="header" style={styles.title}>
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="body" tone="secondary" style={styles.subtitle}>
          {subtitle}
        </AppText>
      ) : null}
    </>
  );
}

function TopicStep({ booking }: { booking: BookingController }) {
  const { state, dispatch } = booking;
  const topics = booking.catalog.data?.topics ?? [];
  return (
    <View>
      <StepTitle title="Qual é o assunto?" subtitle="Escolha o tema da conversa com o ASA." />
      <Surface padding={0} accessibilityRole="radiogroup" accessibilityLabel="Assuntos">
        {topics.map((topic, index) => (
          <ChoiceRow
            key={topic.id}
            icon={categoryIcon(topic.id)}
            title={topic.label}
            description={topic.description}
            selected={state.topicId === topic.id}
            divider={index > 0}
            onPress={() => dispatch({ type: 'SELECT_TOPIC', topicId: topic.id })}
            testID={`book-topic-${topic.id}`}
          />
        ))}
      </Surface>
    </View>
  );
}

function ModeStep({ booking }: { booking: BookingController }) {
  const { state, dispatch, reschedule } = booking;
  const modes = booking.catalog.data?.modes ?? [];
  return (
    <View>
      <StepTitle
        title="Como prefere ser atendido?"
        subtitle={reschedule ? `Seu agendamento atual é ${modeLabel(reschedule.mode).toLowerCase()}. Você pode manter ou trocar.` : 'Presencial, no ASA, ou online, por videochamada.'}
      />
      <Surface padding={0} accessibilityRole="radiogroup" accessibilityLabel="Modalidades">
        {modes.map((mode, index) => (
          <ChoiceRow
            key={mode.id}
            icon={MODE_META[mode.id]?.icon ?? 'help-circle-outline'}
            title={mode.label}
            description={mode.description}
            selected={state.mode === mode.id}
            divider={index > 0}
            onPress={() => dispatch({ type: 'SELECT_MODE', mode: mode.id })}
            testID={`book-mode-${mode.id}`}
          />
        ))}
      </Surface>
    </View>
  );
}

function SlotsProblem({ booking }: { booking: BookingController }) {
  return (
    <InlineNotice
      message={appointmentLoadErrorMessage(booking.slots.error, 'Não conseguimos carregar os horários livres.')}
      tone="danger"
      actionLabel="Tentar novamente"
      onAction={booking.slots.reload}
      testID="book-slots-error"
    />
  );
}

function DayStripSkeleton() {
  const styles = useStyles();
  return (
    <View style={styles.stripSkeleton} accessibilityLabel="Carregando horários livres" accessibilityLiveRegion="polite" testID="book-days-loading">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} width={80} height={92} radius={10} />
      ))}
    </View>
  );
}

function DayStep({ booking }: { booking: BookingController }) {
  const theme = useTheme();
  const { state, dispatch, slots, days, timezone } = booking;
  const empty = slots.status === 'empty' || (slots.status === 'success' && days.every((day) => day.slots.length === 0));
  return (
    <View>
      <StepTitle title="Escolha o dia" subtitle={`Próximos ${APPOINTMENTS.DAYS_SHOWN} dias · ${timezoneLabel(timezone)}.`} />
      {slots.status === 'loading' ? <DayStripSkeleton /> : null}
      {slots.status === 'error' ? <SlotsProblem booking={booking} /> : null}
      {empty ? (
        <EmptyState
          title="Nenhum horário livre nas próximas duas semanas"
          message={`Não há horários ${state.mode ? `na modalidade ${modeLabel(state.mode).toLowerCase()}` : ''} agora. Tente outra modalidade ou abra um chamado no Atendimento.`}
          icon="calendar-outline"
          actionLabel="Trocar modalidade"
          onAction={() => dispatch({ type: 'GO_TO', step: 'mode' })}
          testID="book-days-empty"
        />
      ) : null}
      {slots.status === 'success' && !empty ? (
        <>
          <DayStrip days={days} selected={state.date} onSelect={(date) => dispatch({ type: 'SELECT_DAY', date })} testID="book-day" />
          {state.date ? (
            <AppText variant="bodySmall" tone="secondary" style={{ marginTop: theme.spacing.md }} accessibilityLiveRegion="polite">
              {`${formatCalendarDay(state.date)} selecionado.`}
            </AppText>
          ) : (
            <AppText variant="bodySmall" tone="muted" style={{ marginTop: theme.spacing.md }}>
              Dias sem horários livres ficam desativados.
            </AppText>
          )}
        </>
      ) : null}
    </View>
  );
}

function TimeStep({ booking }: { booking: BookingController }) {
  const styles = useStyles();
  const { state, dispatch, slots, daySlots, timezone, reschedule } = booking;
  const currentStartsAt = reschedule && reschedule.mode === state.mode ? reschedule.startsAt : null;
  return (
    <View>
      <StepTitle title="Escolha o horário" />
      <View style={styles.dayHeader}>
        <AppText variant="bodyStrong" style={{ flex: 1 }}>
          {state.date ? formatCalendarDay(state.date) : 'Nenhum dia escolhido'}
        </AppText>
        <AppButton label="Trocar dia" variant="ghost" size="small" onPress={() => dispatch({ type: 'GO_TO', step: 'day' })} testID="book-change-day" />
      </View>
      <InlineNotice message={state.notice} tone="warning" icon="alert-circle-outline" style={styles.timeNotice} testID="book-notice" />
      {slots.status === 'loading' ? <ScheduleSkeleton rows={2} testID="book-times-loading" /> : null}
      {slots.status === 'error' ? <SlotsProblem booking={booking} /> : null}
      {slots.status !== 'loading' && slots.status !== 'error' ? (
        daySlots.length === 0 ? (
          <EmptyState
            title="Nenhum horário livre neste dia"
            message="Não há mais horários livres neste dia. Escolha outro dia."
            icon="time-outline"
            actionLabel="Escolher outro dia"
            onAction={() => dispatch({ type: 'GO_TO', step: 'day' })}
            testID="book-times-empty"
          />
        ) : (
          <>
            <TimeGrid slots={daySlots} selected={state.slot} onSelect={(slot) => dispatch({ type: 'SELECT_SLOT', slot })} timeZone={timezone} currentStartsAt={currentStartsAt} testID="book-time" />
            <AppText variant="caption" tone="muted" style={styles.timeHint}>
              {`Horários no ${timezoneLabel(timezone)}.`}
            </AppText>
          </>
        )
      ) : null}
    </View>
  );
}

function ReviewStep({ booking }: { booking: BookingController }) {
  const theme = useTheme();
  const styles = useStyles();
  const { state, dispatch, reschedule, timezone } = booking;
  const catalog = booking.catalog.data;
  const topic = catalog?.topics.find((item) => item.id === state.topicId);
  const slot = state.slot;
  const rows: { label: string; value: string; step: BookingStep | null }[] = [
    { label: 'Assunto', value: topic?.label ?? reschedule?.topicLabel ?? '—', step: reschedule ? null : 'topic' },
    { label: 'Modalidade', value: state.mode ? modeLabel(state.mode) : '—', step: 'mode' },
    { label: 'Data', value: slot ? formatAppointmentDate(slot.startsAt, timezone) : '—', step: 'day' },
    { label: 'Horário', value: slot ? `${formatTimeRange(slot.startsAt, slot.endsAt, timezone)} (${timezoneLabel(timezone)})` : '—', step: 'time' },
    ...(slot && slot.mode === 'presencial' && slot.location ? [{ label: 'Local', value: slot.location, step: null }] : []),
    ...(slot && slot.mode === 'online' ? [{ label: 'Link', value: 'Combinado pela equipe do ASA na confirmação.', step: null }] : []),
  ];

  return (
    <View>
      <StepTitle title={reschedule ? 'Confira o novo horário' : 'Confira e confirme'} subtitle="Revise os dados antes de confirmar. Você pode alterar qualquer parte." />
      <Surface padding={0} testID="book-summary">
        {rows.map((row, index) => (
          <View key={row.label} style={[styles.review, index > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border.subtle } : null]}>
            <View style={styles.reviewHeader}>
              <AppText variant="caption" tone="muted">
                {row.label}
              </AppText>
              {row.step ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Alterar ${row.label.toLowerCase()}`} onPress={() => dispatch({ type: 'GO_TO', step: row.step as BookingStep })} hitSlop={theme.hitSlop} style={styles.edit} testID={`book-edit-${row.step}`}>
                  <AppText variant="bodySmallStrong" tone="link">
                    Alterar
                  </AppText>
                </Pressable>
              ) : null}
            </View>
            <AppText variant="body">{row.value}</AppText>
          </View>
        ))}
      </Surface>

      {reschedule ? (
        <Surface tone="secondary" style={{ marginTop: theme.spacing.lg }} testID="book-current">
          <AppText variant="caption" tone="muted">
            Horário atual (será liberado)
          </AppText>
          <AppText variant="body" style={{ marginTop: 2 }}>
            {`${formatAppointmentDate(reschedule.startsAt, timezone)}, ${formatTimeRange(reschedule.startsAt, reschedule.endsAt, timezone)}`}
          </AppText>
        </Surface>
      ) : (
        <View style={{ marginTop: theme.spacing.xl }}>
          <AppText variant="bodyStrong">Observações (opcional)</AppText>
          <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 2, marginBottom: theme.spacing.sm }}>
            Conte em poucas palavras o que você quer tratar. Só a equipe do ASA vê.
          </AppText>
          <TextInput
            value={state.notes}
            onChangeText={(notes) => dispatch({ type: 'SET_NOTES', notes })}
            multiline
            maxLength={APPOINTMENTS.NOTES_MAX_LENGTH}
            placeholder="Ex.: preciso de orientação sobre trancamento"
            placeholderTextColor={theme.colors.text.placeholder}
            style={styles.input}
            accessibilityLabel="Observações para o ASA (opcional)"
            testID="book-notes"
          />
          <AppText variant="caption" tone="muted" align="right" style={{ marginTop: theme.spacing.xxs }} accessibilityLabel={`${state.notes.length} de ${APPOINTMENTS.NOTES_MAX_LENGTH} caracteres`}>
            {`${state.notes.length} / ${APPOINTMENTS.NOTES_MAX_LENGTH}`}
          </AppText>
        </View>
      )}

      {catalog ? (
        <View style={[styles.bullet, { marginTop: theme.spacing.lg }]}>
          <Ionicons name="time-outline" size={20} color={theme.colors.text.secondary} />
          <AppText variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
            {`Você pode cancelar ou remarcar pelo app até ${catalog.policy.cancellationMinHours} h antes do horário.`}
          </AppText>
        </View>
      ) : null}
      {state.error ? <InlineNotice message={state.error} tone="danger" style={{ marginTop: theme.spacing.lg }} testID="book-error" /> : null}
    </View>
  );
}

interface BookingDoneProps {
  appointment: Appointment;
  rescheduled: boolean;
  timeZone: string;
  onOpen: () => void;
  onDone: () => void;
}

/** Confirmação: o que foi marcado, o protocolo (copiável) e o próximo passo. Nada é adicionado a calendários. */
function BookingDone({ appointment, rescheduled, timeZone, onOpen, onDone }: BookingDoneProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'danger' } | null>(null);
  const status = appointmentStatusMeta(appointment);

  const copy = () => {
    Clipboard.setStringAsync(appointment.protocol)
      .then(() => {
        haptics.selection();
        setNotice({ message: 'Protocolo copiado', tone: 'success' });
      })
      .catch(() => setNotice({ message: 'Não foi possível copiar. Anote o protocolo.', tone: 'danger' }));
  };

  return (
    <Screen testID="appointment-booked">
      <View style={{ alignItems: 'center', paddingTop: theme.spacing.xxl }} accessibilityLiveRegion="polite">
        <Ionicons name="checkmark-circle" size={56} color={theme.colors.status.success} />
        <AppText variant="h1" align="center" style={{ marginTop: theme.spacing.lg }} accessibilityRole="header">
          {rescheduled ? 'Atendimento remarcado!' : 'Atendimento agendado!'}
        </AppText>
        <AppText variant="body" tone="secondary" align="center" style={{ marginTop: theme.spacing.xs }}>
          {rescheduled ? 'O horário anterior foi liberado.' : status.description}
        </AppText>
      </View>

      <List style={{ marginTop: theme.spacing.xl }} testID="booked-summary">
        <ListItem title="Assunto" value={appointment.topicLabel} />
        <ListItem title="Data" value={formatAppointmentDate(appointment.startsAt, timeZone)} />
        <ListItem title="Horário" value={formatTimeRange(appointment.startsAt, appointment.endsAt, timeZone)} />
        <ListItem title="Modalidade" value={placeLabel(appointment.mode, appointment.location)} />
      </List>

      <Surface style={[styles.protocol, { marginTop: theme.spacing.lg }]}>
        <AppText variant="caption" tone="muted">
          Protocolo
        </AppText>
        <AppText variant="h2" selectable style={{ letterSpacing: 0.5 }} testID="booked-protocol">
          {appointment.protocol}
        </AppText>
        <AppButton label="Copiar protocolo" icon="copy-outline" variant="ghost" size="small" onPress={copy} testID="booked-copy" />
      </Surface>
      <InlineNotice message={notice?.message ?? null} tone={notice?.tone ?? 'success'} autoHideMs={2400} onHide={() => setNotice(null)} style={{ marginTop: theme.spacing.md }} />

      <View style={[styles.bullet, { marginTop: theme.spacing.xl }]}>
        <Ionicons name="notifications-outline" size={20} color={theme.colors.text.secondary} />
        <AppText variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
          Você recebe um aviso na central de avisos quando o ASA confirmar ou alterar este atendimento.
        </AppText>
      </View>

      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xxl }}>
        <AppButton label="Ver agendamento" icon="arrow-forward" iconPosition="right" onPress={onOpen} fullWidth testID="booked-open" />
        {!rescheduled ? <AppButton label="Concluir" variant="ghost" onPress={onDone} fullWidth testID="booked-done" /> : null}
      </View>
    </Screen>
  );
}
