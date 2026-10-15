import { WEEKDAY_LABELS } from '@/features/appointments/dates';
import { capitalize, fieldErrors } from './api';

/**
 * Formatos dos parâmetros institucionais (espelham SETTING_DEFINITIONS em Backend/api/src/platform/settingsService.ts).
 * O servidor valida de novo cada gravação; aqui a validação existe para explicar o erro antes de enviar.
 */
export type AnnouncementValue = { text: string; tone: 'info' | 'attention' } | null;
export interface BusinessHoursValue {
  days: Array<{ weekday: number; intervals: Array<{ start: string; end: string }> }>;
  note: string | null;
}
export type PublicLinksValue = Array<{ label: string; url: string }>;
export interface AppointmentsPolicyValue {
  minLeadHours: number;
  maxDaysAhead: number;
  cancellationMinHours: number;
  maxActivePerStudent: number;
}
export interface KnowledgePolicyValue {
  requireSecondReviewer: boolean;
}
export interface FeatureTogglesValue {
  appointments: boolean;
  knowledgeBase: boolean;
  assistantKnowledgeAnswers: boolean;
  automations: boolean;
}

export const SETTING_KEYS = {
  announcement: 'institution.announcement',
  businessHours: 'asa.business_hours',
  publicLinks: 'asa.public_links',
  appointmentsPolicy: 'appointments.policy',
  knowledgePolicy: 'knowledge.policy',
  featureToggles: 'features.toggles',
} as const;

export const ANNOUNCEMENT_MAX = 280;
export const NOTE_MAX = 200;
export const LINKS_MAX = 8;
export const INTERVALS_MAX = 3;

export const POLICY_FIELDS: Array<{ key: keyof AppointmentsPolicyValue; label: string; hint: string; min: number; max: number }> = [
  { key: 'minLeadHours', label: 'Antecedência mínima para agendar (horas)', hint: 'De 0 a 72. Ex.: 2 = o aluno só agenda horários que começam daqui a 2 horas ou mais.', min: 0, max: 72 },
  { key: 'maxDaysAhead', label: 'Horizonte da agenda (dias)', hint: 'De 1 a 90. Até quantos dias à frente o aluno vê horários.', min: 1, max: 90 },
  { key: 'cancellationMinHours', label: 'Prazo para cancelar ou remarcar (horas antes)', hint: 'De 0 a 72. Depois disso, só a equipe altera o agendamento.', min: 0, max: 72 },
  { key: 'maxActivePerStudent', label: 'Agendamentos ativos por aluno', hint: 'De 1 a 5 agendamentos futuros ao mesmo tempo.', min: 1, max: 5 },
];

export const TOGGLE_FIELDS: Array<{ key: keyof FeatureTogglesValue; label: string; description: string }> = [
  { key: 'appointments', label: 'Agendamentos', description: 'Alunos agendam atendimentos com o ASA e a equipe gerencia a agenda. Desligado: telas e rotas de agendamento ficam indisponíveis.' },
  { key: 'knowledgeBase', label: 'Base de conhecimento', description: 'Central de ajuda para alunos e gestão de artigos pela equipe. Desligado: a central e a gestão de artigos saem do ar.' },
  {
    key: 'assistantKnowledgeAnswers',
    label: 'Respostas do assistente com a base de conhecimento',
    description: 'O Assistente ASA usa artigos publicados para responder. Desligado: o assistente deixa de citar artigos.',
  },
  { key: 'automations', label: 'Motor de automações', description: 'Executa as regras de Administração → Automações. Desligado: nenhuma regra roda, mesmo as ativadas.' },
];

// ---- leitura segura do valor vindo da API (formato inesperado → editor só leitura)

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isTime = (value: unknown): value is string => typeof value === 'string';

export function asAnnouncement(value: unknown): AnnouncementValue | undefined {
  if (value === null) return null;
  if (isRecord(value) && typeof value.text === 'string' && (value.tone === 'info' || value.tone === 'attention')) return { text: value.text, tone: value.tone };
  return undefined;
}

export function asBusinessHours(value: unknown): BusinessHoursValue | undefined {
  if (!isRecord(value) || !Array.isArray(value.days) || !(value.note === null || typeof value.note === 'string')) return undefined;
  const days: BusinessHoursValue['days'] = [];
  for (const day of value.days) {
    if (!isRecord(day) || typeof day.weekday !== 'number' || !Array.isArray(day.intervals)) return undefined;
    const intervals: Array<{ start: string; end: string }> = [];
    for (const interval of day.intervals) {
      if (!isRecord(interval) || !isTime(interval.start) || !isTime(interval.end)) return undefined;
      intervals.push({ start: interval.start, end: interval.end });
    }
    days.push({ weekday: day.weekday, intervals });
  }
  return { days, note: value.note };
}

export function asPublicLinks(value: unknown): PublicLinksValue | undefined {
  if (!Array.isArray(value)) return undefined;
  const links: PublicLinksValue = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.label !== 'string' || typeof item.url !== 'string') return undefined;
    links.push({ label: item.label, url: item.url });
  }
  return links;
}

export function asAppointmentsPolicy(value: unknown): AppointmentsPolicyValue | undefined {
  if (!isRecord(value)) return undefined;
  const result: Partial<AppointmentsPolicyValue> = {};
  for (const field of POLICY_FIELDS) {
    const item = value[field.key];
    if (typeof item !== 'number') return undefined;
    result[field.key] = item;
  }
  return result as AppointmentsPolicyValue;
}

export function asKnowledgePolicy(value: unknown): KnowledgePolicyValue | undefined {
  return isRecord(value) && typeof value.requireSecondReviewer === 'boolean' ? { requireSecondReviewer: value.requireSecondReviewer } : undefined;
}

export function asFeatureToggles(value: unknown): FeatureTogglesValue | undefined {
  if (!isRecord(value)) return undefined;
  const result: Partial<FeatureTogglesValue> = {};
  for (const field of TOGGLE_FIELDS) {
    const item = value[field.key];
    if (typeof item !== 'boolean') return undefined;
    result[field.key] = item;
  }
  return result as FeatureTogglesValue;
}

// ---- validação (mesmas regras do servidor + sobreposição de faixas no mesmo dia)

export type SettingErrors = Record<string, string>;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateAnnouncement(text: string): SettingErrors {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { text: 'Escreva o texto do aviso (ou use “Remover aviso”).' };
  if (trimmed.length > ANNOUNCEMENT_MAX) return { text: `Use até ${ANNOUNCEMENT_MAX} caracteres.` };
  return {};
}

export interface DayDraft {
  weekday: number;
  open: boolean;
  intervals: Array<{ start: string; end: string }>;
}

/** Chave de erro de uma faixa: "<dia da semana>.<posição>". */
export const intervalKey = (weekday: number, index: number): string => `${weekday}.${index}`;

export function validateBusinessHours(days: DayDraft[], note: string): SettingErrors {
  const errors: SettingErrors = {};
  for (const day of days) {
    if (!day.open) continue;
    if (day.intervals.length === 0) errors[intervalKey(day.weekday, 0)] = 'Adicione pelo menos uma faixa ou marque o dia como fechado.';
    day.intervals.forEach((interval, index) => {
      if (!TIME.test(interval.start) || !TIME.test(interval.end)) errors[intervalKey(day.weekday, index)] = 'Informe início e fim no formato HH:MM.';
      else if (interval.start >= interval.end) errors[intervalKey(day.weekday, index)] = 'O fim deve ser depois do início.';
    });
    const sorted = day.intervals
      .map((interval, index) => ({ ...interval, index }))
      .filter((interval) => TIME.test(interval.start) && TIME.test(interval.end) && interval.start < interval.end)
      .sort((a, b) => a.start.localeCompare(b.start));
    for (let position = 1; position < sorted.length; position += 1) {
      const current = sorted[position]!;
      if (current.start < sorted[position - 1]!.end && !errors[intervalKey(day.weekday, current.index)]) {
        errors[intervalKey(day.weekday, current.index)] = 'As faixas do mesmo dia não podem se sobrepor.';
      }
    }
  }
  if (note.trim().length > NOTE_MAX) errors.note = `Use até ${NOTE_MAX} caracteres.`;
  return errors;
}

export function businessHoursValue(days: DayDraft[], note: string): BusinessHoursValue {
  return {
    days: days
      .filter((day) => day.open && day.intervals.length > 0)
      .map((day) => ({ weekday: day.weekday, intervals: day.intervals.map((interval) => ({ start: interval.start, end: interval.end })) }))
      .sort((a, b) => a.weekday - b.weekday),
    note: note.trim() || null,
  };
}

/** Valor salvo normalizado (sem dias vazios, por dia da semana) para comparar com o rascunho. */
export function normalizeBusinessHours(value: BusinessHoursValue): BusinessHoursValue {
  return {
    days: value.days
      .filter((day) => day.intervals.length > 0)
      .map((day) => ({ weekday: day.weekday, intervals: day.intervals.map((interval) => ({ start: interval.start, end: interval.end })) }))
      .sort((a, b) => a.weekday - b.weekday),
    note: value.note,
  };
}

export function validateLinks(links: PublicLinksValue): SettingErrors {
  const errors: SettingErrors = {};
  if (links.length > LINKS_MAX) errors.list = `Use no máximo ${LINKS_MAX} links.`;
  links.forEach((link, index) => {
    const label = link.label.trim();
    if (label.length < 2 || label.length > 60) errors[`${index}.label`] = 'Use de 2 a 60 caracteres.';
    const url = link.url.trim();
    let valid = false;
    try {
      valid = new URL(url).protocol === 'https:' && url.startsWith('https://');
    } catch {
      valid = false;
    }
    if (!valid) errors[`${index}.url`] = 'Use um endereço HTTPS completo (https://…).';
  });
  return errors;
}

export function validatePolicy(draft: Record<keyof AppointmentsPolicyValue, string>): SettingErrors {
  const errors: SettingErrors = {};
  for (const field of POLICY_FIELDS) {
    const text = draft[field.key].trim();
    const value = Number(text);
    if (!text || !Number.isInteger(value) || value < field.min || value > field.max) errors[field.key] = `Use um número inteiro de ${field.min} a ${field.max}.`;
  }
  return errors;
}

// ---- erros 400 do servidor ("value.days.0.intervals.1" → texto legível)

const PATH_LABELS: Record<string, Record<string, string>> = {
  [SETTING_KEYS.announcement]: { text: 'Texto do aviso', tone: 'Tom' },
  [SETTING_KEYS.businessHours]: { note: 'Observação', days: 'Dias' },
  [SETTING_KEYS.appointmentsPolicy]: Object.fromEntries(POLICY_FIELDS.map((field) => [field.key, field.label])),
  [SETTING_KEYS.knowledgePolicy]: { requireSecondReviewer: 'Segunda pessoa para publicar' },
  [SETTING_KEYS.featureToggles]: Object.fromEntries(TOGGLE_FIELDS.map((field) => [field.key, field.label])),
};

/** Lista legível dos detalhes do 400 (com o valor enviado para traduzir posições em dias e links). */
export function describeServerErrors(key: string, error: unknown, sent: unknown): string[] {
  const details = fieldErrors(error);
  return Object.entries(details).map(([field, message]) => {
    const path = field.replace(/^value\.?/, '').split('.').filter(Boolean);
    const text = capitalize(message);
    if (key === SETTING_KEYS.businessHours && path[0] === 'days' && path[1] !== undefined) {
      const day = asBusinessHours(sent)?.days[Number(path[1])];
      const where = day ? (WEEKDAY_LABELS[day.weekday] ?? `Dia ${day.weekday}`) : `Dia ${Number(path[1]) + 1}`;
      return path[2] === 'intervals' && path[3] !== undefined ? `${where}, faixa ${Number(path[3]) + 1}: ${text}` : `${where}: ${text}`;
    }
    if (key === SETTING_KEYS.publicLinks && path[0] !== undefined && /^\d+$/.test(path[0])) {
      const part = path[1] === 'url' ? 'endereço' : path[1] === 'label' ? 'nome' : null;
      return `Link ${Number(path[0]) + 1}${part ? ` (${part})` : ''}: ${text}`;
    }
    const label = path[0] ? PATH_LABELS[key]?.[path[0]] : undefined;
    return label ? `${label}: ${text}` : path.length > 0 ? `${path.join('.')}: ${text}` : text;
  });
}

/** Âncora da seção (o banner das automações aponta para "Recursos ativos"). */
export const settingAnchor = (key: string): string => (key === SETTING_KEYS.featureToggles ? 'recursos-ativos' : `parametro-${key.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`);
