import { ArrowDown, ArrowUp, Info, Megaphone, Plus, Trash2, Undo2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { Checkbox, Switch, TextArea, TextInput } from '@/components/ui/Form';
import { ChoiceGroup, Notice } from '@/features/admin/components';
import {
  ANNOUNCEMENT_MAX,
  businessHoursValue,
  INTERVALS_MAX,
  intervalKey,
  LINKS_MAX,
  normalizeBusinessHours,
  NOTE_MAX,
  POLICY_FIELDS,
  TOGGLE_FIELDS,
  validateAnnouncement,
  validateBusinessHours,
  validateLinks,
  validatePolicy,
  type AnnouncementValue,
  type AppointmentsPolicyValue,
  type BusinessHoursValue,
  type DayDraft,
  type FeatureTogglesValue,
  type KnowledgePolicyValue,
  type PublicLinksValue,
  type SettingErrors,
} from '@/features/admin/settings';
import { WEEKDAY_LABELS, WEEKDAY_ORDER } from '@/features/appointments/dates';
import { cn } from '@/lib/cn';

export interface EditorProps<V> {
  value: V;
  saving: boolean;
  onSave: (value: unknown) => void;
  /** erros 400 do servidor por campo (caminho sem o prefixo "value.") */
  serverErrors: Record<string, string>;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Botões de cada parâmetro: salvar (desabilitado sem mudança ou enquanto envia) e desfazer. */
function EditorActions({ dirty, saving, onReset, saveLabel = 'Salvar', extra }: { dirty: boolean; saving: boolean; onReset: () => void; saveLabel?: string; extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
      <Button type="submit" variant="primary" loading={saving} disabled={!dirty}>
        {saveLabel}
      </Button>
      {dirty && !saving ? (
        <Button variant="ghost" icon={Undo2} onClick={onReset}>
          Desfazer alterações
        </Button>
      ) : null}
      {extra}
      {!dirty && !saving ? <span className="text-caption text-mist">Sem alterações para salvar.</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------- aviso institucional

export function AnnouncementEditor({ value, saving, onSave, serverErrors }: EditorProps<AnnouncementValue>) {
  const [text, setText] = useState(value?.text ?? '');
  const [tone, setTone] = useState<'info' | 'attention'>(value?.tone ?? 'info');
  const [errors, setErrors] = useState<SettingErrors>({});
  const [removing, setRemoving] = useState(false);
  const trimmed = text.trim();
  const dirty = value ? trimmed !== value.text || tone !== value.tone : trimmed.length > 0;
  const textError = errors.text ?? serverErrors.text ?? null;
  const attention = tone === 'attention';
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const found = validateAnnouncement(text);
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        setRemoving(false);
        onSave({ text: trimmed, tone });
      }}
    >
      {value === null ? <p className="text-small text-slate">Nenhum aviso publicado agora.</p> : null}
      <TextArea
        label="Texto do aviso"
        rows={3}
        maxLength={ANNOUNCEMENT_MAX}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          if (errors.text) setErrors({});
        }}
        hint={`${trimmed.length}/${ANNOUNCEMENT_MAX} caracteres. Aparece no topo do portal e do aplicativo para todos.`}
        error={textError}
      />
      <ChoiceGroup
        legend="Tom"
        layout="inline"
        value={tone}
        onChange={setTone}
        options={[
          { value: 'info', label: 'Informativo', description: 'Faixa neutra, para recados do dia a dia.' },
          { value: 'attention', label: 'Atenção', description: 'Faixa azul com megafone, para mudanças importantes.' },
        ]}
        error={serverErrors.tone}
      />
      {trimmed ? (
        <div>
          <p className="mb-1 text-caption text-mist">Prévia</p>
          <div className={cn('flex items-start gap-2 rounded-md border px-4 py-2 text-small', attention ? 'border-info/30 bg-info-soft text-info-text' : 'border-line bg-white text-slate')}>
            {attention ? <Megaphone size={16} aria-hidden className="mt-0.5 shrink-0" /> : <Info size={16} aria-hidden className="mt-0.5 shrink-0" />}
            <span>{trimmed}</span>
          </div>
        </div>
      ) : null}
      <EditorActions
        dirty={dirty}
        saving={saving && !removing}
        saveLabel={value ? 'Salvar aviso' : 'Publicar aviso'}
        onReset={() => {
          setText(value?.text ?? '');
          setTone(value?.tone ?? 'info');
          setErrors({});
        }}
        extra={
          value ? (
            <Button
              variant="danger"
              icon={Trash2}
              loading={saving && removing}
              disabled={saving && !removing}
              onClick={() => {
                setRemoving(true);
                onSave(null);
              }}
            >
              Remover aviso
            </Button>
          ) : null
        }
      />
    </form>
  );
}

// ---------------------------------------------------------------- horário de atendimento

function draftsFrom(value: BusinessHoursValue): DayDraft[] {
  return WEEKDAY_ORDER.map((weekday) => {
    const day = value.days.find((item) => item.weekday === weekday);
    const intervals = day?.intervals ?? [];
    return { weekday, open: intervals.length > 0, intervals: intervals.length > 0 ? intervals.map((interval) => ({ ...interval })) : [{ start: '', end: '' }] };
  });
}

export function BusinessHoursEditor({ value, saving, onSave, timezone }: EditorProps<BusinessHoursValue> & { timezone: string | null }) {
  const [days, setDays] = useState<DayDraft[]>(() => draftsFrom(value));
  const [note, setNote] = useState(value.note ?? '');
  const [errors, setErrors] = useState<SettingErrors>({});
  const dirty = !same(businessHoursValue(days, note), normalizeBusinessHours(value));

  const changeDay = (weekday: number, change: (day: DayDraft) => DayDraft) => {
    setDays((current) => current.map((day) => (day.weekday === weekday ? change(day) : day)));
    if (Object.keys(errors).length > 0) setErrors({});
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const found = validateBusinessHours(days, note);
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        onSave(businessHoursValue(days, note));
      }}
    >
      <p className="text-small text-slate">Horários no fuso da instituição{timezone ? ` (${timezone})` : ''}. Até {INTERVALS_MAX} faixas por dia; dias sem marcação ficam como fechados.</p>
      <ul className="divide-y divide-line-soft rounded-md border border-line">
        {days.map((day) => {
          const label = WEEKDAY_LABELS[day.weekday] ?? String(day.weekday);
          return (
            <li key={day.weekday} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Checkbox
                  label={label}
                  checked={day.open}
                  onChange={(event) => {
                    const open = event.target.checked;
                    changeDay(day.weekday, (current) => ({ ...current, open, intervals: current.intervals.length > 0 ? current.intervals : [{ start: '', end: '' }] }));
                  }}
                />
                {day.open ? null : <span className="text-small text-slate">Fechado</span>}
              </div>
              {day.open ? (
                <div className="flex flex-col gap-2 sm:pl-6">
                  {day.intervals.map((interval, index) => {
                    const error = errors[intervalKey(day.weekday, index)];
                    const name = `${label}, faixa ${index + 1}`;
                    return (
                      <div key={index} className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <TextInput
                            label={`Início — ${name}`}
                            hideLabel
                            type="time"
                            step={300}
                            value={interval.start}
                            containerClassName="w-32"
                            aria-invalid={error ? true : undefined}
                            onChange={(event) =>
                              changeDay(day.weekday, (current) => ({ ...current, intervals: current.intervals.map((item, position) => (position === index ? { ...item, start: event.target.value } : item)) }))
                            }
                          />
                          <span className="text-small text-slate">até</span>
                          <TextInput
                            label={`Fim — ${name}`}
                            hideLabel
                            type="time"
                            step={300}
                            value={interval.end}
                            containerClassName="w-32"
                            aria-invalid={error ? true : undefined}
                            onChange={(event) =>
                              changeDay(day.weekday, (current) => ({ ...current, intervals: current.intervals.map((item, position) => (position === index ? { ...item, end: event.target.value } : item)) }))
                            }
                          />
                          {day.intervals.length > 1 ? (
                            <IconButton
                              label={`Remover ${name}`}
                              icon={Trash2}
                              onClick={() => changeDay(day.weekday, (current) => ({ ...current, intervals: current.intervals.filter((_, position) => position !== index) }))}
                            />
                          ) : null}
                        </div>
                        {error ? <p className="text-caption text-danger-text">{error}</p> : null}
                      </div>
                    );
                  })}
                  {day.intervals.length < INTERVALS_MAX ? (
                    <div>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Plus}
                        aria-label={`Adicionar faixa em ${label}`}
                        onClick={() => changeDay(day.weekday, (current) => ({ ...current, intervals: [...current.intervals, { start: '', end: '' }] }))}
                      >
                        Adicionar faixa
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <TextArea
        label="Observação"
        rows={2}
        maxLength={NOTE_MAX}
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
          if (errors.note) setErrors((current) => ({ ...current, note: '' }));
        }}
        hint={`Opcional · ${note.trim().length}/${NOTE_MAX}. Ex.: feriados ou atendimento reduzido.`}
        error={errors.note || null}
      />
      {Object.keys(errors).some((key) => key !== 'note' && errors[key]) ? (
        <Notice tone="danger" alert>
          Corrija as faixas destacadas antes de salvar.
        </Notice>
      ) : null}
      <EditorActions
        dirty={dirty}
        saving={saving}
        saveLabel="Salvar horário"
        onReset={() => {
          setDays(draftsFrom(value));
          setNote(value.note ?? '');
          setErrors({});
        }}
      />
    </form>
  );
}

// ---------------------------------------------------------------- links institucionais

export function PublicLinksEditor({ value, saving, onSave }: EditorProps<PublicLinksValue>) {
  const [links, setLinks] = useState<PublicLinksValue>(() => value.map((link) => ({ ...link })));
  const [errors, setErrors] = useState<SettingErrors>({});
  const cleaned = links.map((link) => ({ label: link.label.trim(), url: link.url.trim() }));
  const dirty = !same(cleaned, value);

  const change = (next: PublicLinksValue) => {
    setLinks(next);
    if (Object.keys(errors).length > 0) setErrors({});
  };
  const move = (index: number, offset: -1 | 1) => {
    const next = [...links];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(index + offset, 0, item);
    change(next);
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const found = validateLinks(links);
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        onSave(cleaned);
      }}
    >
      {links.length === 0 ? (
        <p className="text-small text-slate">Nenhum link: os portais e o aplicativo não exibem links institucionais enquanto a lista estiver vazia.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {links.map((link, index) => (
            <li key={index} className="flex flex-col gap-2 rounded-md border border-line px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-small font-semibold text-ink">Link {index + 1}</span>
                <span className="flex items-center gap-1">
                  <IconButton size="sm" label={`Mover link ${index + 1} para cima`} icon={ArrowUp} disabled={index === 0} onClick={() => move(index, -1)} />
                  <IconButton size="sm" label={`Mover link ${index + 1} para baixo`} icon={ArrowDown} disabled={index === links.length - 1} onClick={() => move(index, 1)} />
                  <IconButton size="sm" label={`Remover link ${index + 1}`} icon={Trash2} onClick={() => change(links.filter((_, position) => position !== index))} />
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextInput
                  label={`Nome do link ${index + 1}`}
                  maxLength={60}
                  value={link.label}
                  placeholder="Ex.: Portal do Aluno"
                  onChange={(event) => change(links.map((item, position) => (position === index ? { ...item, label: event.target.value } : item)))}
                  error={errors[`${index}.label`] ?? null}
                />
                <TextInput
                  label={`Endereço do link ${index + 1}`}
                  type="url"
                  inputMode="url"
                  value={link.url}
                  placeholder="https://"
                  onChange={(event) => change(links.map((item, position) => (position === index ? { ...item, url: event.target.value } : item)))}
                  error={errors[`${index}.url`] ?? null}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
      {errors.list ? <p className="text-caption text-danger-text">{errors.list}</p> : null}
      <div>
        <Button size="sm" icon={Plus} disabled={links.length >= LINKS_MAX} onClick={() => change([...links, { label: '', url: '' }])}>
          Adicionar link
        </Button>
        {links.length >= LINKS_MAX ? <span className="ml-2 text-caption text-mist">Limite de {LINKS_MAX} links.</span> : null}
      </div>
      <EditorActions
        dirty={dirty}
        saving={saving}
        saveLabel="Salvar links"
        onReset={() => {
          setLinks(value.map((link) => ({ ...link })));
          setErrors({});
        }}
      />
    </form>
  );
}

// ---------------------------------------------------------------- política de agendamentos

type PolicyDraft = Record<keyof AppointmentsPolicyValue, string>;
const policyDraft = (value: AppointmentsPolicyValue): PolicyDraft => ({
  minLeadHours: String(value.minLeadHours),
  maxDaysAhead: String(value.maxDaysAhead),
  cancellationMinHours: String(value.cancellationMinHours),
  maxActivePerStudent: String(value.maxActivePerStudent),
});

export function AppointmentsPolicyEditor({ value, saving, onSave, serverErrors }: EditorProps<AppointmentsPolicyValue>) {
  const [draft, setDraft] = useState<PolicyDraft>(() => policyDraft(value));
  const [errors, setErrors] = useState<SettingErrors>({});
  const dirty = !same(draft, policyDraft(value));
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const found = validatePolicy(draft);
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        onSave(Object.fromEntries(POLICY_FIELDS.map((field) => [field.key, Number(draft[field.key])])));
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {POLICY_FIELDS.map((field) => (
          <TextInput
            key={field.key}
            label={field.label}
            type="number"
            inputMode="numeric"
            min={field.min}
            max={field.max}
            step={1}
            value={draft[field.key]}
            onChange={(event) => {
              setDraft((current) => ({ ...current, [field.key]: event.target.value }));
              if (errors[field.key]) setErrors((current) => ({ ...current, [field.key]: '' }));
            }}
            hint={field.hint}
            error={errors[field.key] || serverErrors[field.key] || null}
          />
        ))}
      </div>
      <EditorActions dirty={dirty} saving={saving} saveLabel="Salvar política" onReset={() => { setDraft(policyDraft(value)); setErrors({}); }} />
    </form>
  );
}

// ---------------------------------------------------------------- base de conhecimento

export function KnowledgePolicyEditor({ value, saving, onSave }: EditorProps<KnowledgePolicyValue>) {
  const [requireSecondReviewer, setRequire] = useState(value.requireSecondReviewer);
  const dirty = requireSecondReviewer !== value.requireSecondReviewer;
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ requireSecondReviewer });
      }}
    >
      <Switch
        label="Exigir uma segunda pessoa para publicar"
        description="Quem editou um artigo por último não pode publicá-lo: outra pessoa da equipe revisa e publica."
        checked={requireSecondReviewer}
        onChange={setRequire}
      />
      <EditorActions dirty={dirty} saving={saving} onReset={() => setRequire(value.requireSecondReviewer)} />
    </form>
  );
}

// ---------------------------------------------------------------- recursos ativos

export function FeatureTogglesEditor({ value, saving, onSave }: EditorProps<FeatureTogglesValue>) {
  const [draft, setDraft] = useState<FeatureTogglesValue>(() => ({ ...value }));
  const changes = TOGGLE_FIELDS.filter((field) => draft[field.key] !== value[field.key]);
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <ul className="flex flex-col gap-4">
        {TOGGLE_FIELDS.map((field) => (
          <li key={field.key}>
            <Switch label={field.label} description={field.description} checked={draft[field.key]} onChange={(checked) => setDraft((current) => ({ ...current, [field.key]: checked }))} />
          </li>
        ))}
      </ul>
      {changes.length > 0 ? (
        <p className="text-small text-slate" aria-live="polite">
          Ao salvar:{' '}
          {changes.map((field, index) => (
            <span key={field.key}>
              {index > 0 ? '; ' : ''}
              {draft[field.key] ? 'liga' : 'desliga'} <span className="font-medium text-ink">{field.label}</span>
            </span>
          ))}
          .
        </p>
      ) : null}
      <EditorActions dirty={changes.length > 0} saving={saving} saveLabel="Salvar recursos" onReset={() => setDraft({ ...value })} />
    </form>
  );
}
