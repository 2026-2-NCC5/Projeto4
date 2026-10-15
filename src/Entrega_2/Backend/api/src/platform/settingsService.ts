import { z } from 'zod';
import type { Logger } from '../config/logger.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';
import type { SettingsRepository } from './types.js';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM.');
const interval = z.object({ start: time, end: time }).strict().refine((value) => value.start < value.end, 'O fim deve ser depois do início.');
/** Intervalos de um mesmo dia não podem se sobrepor (nem o mesmo dia aparecer duas vezes). */
const businessDays = z
  .array(z.object({ weekday: z.number().int().min(0).max(6), intervals: z.array(interval).max(3) }).strict())
  .max(7)
  .superRefine((days, ctx) => {
    const seen = new Set<number>();
    days.forEach((day, index) => {
      if (seen.has(day.weekday)) ctx.addIssue({ code: 'custom', path: [index, 'weekday'], message: 'Dia da semana repetido.' });
      seen.add(day.weekday);
      const sorted = [...day.intervals].sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 1; i < sorted.length; i += 1) {
        if (sorted[i]!.start < sorted[i - 1]!.end) ctx.addIssue({ code: 'custom', path: [index, 'intervals'], message: 'Os horários do mesmo dia não podem se sobrepor.' });
      }
    });
  });

/**
 * Parâmetros institucionais editáveis pela administração. Cada chave tem formato validado e valor padrão.
 * Segredos e credenciais NUNCA ficam aqui (continuam em variáveis de ambiente).
 */
export const SETTING_DEFINITIONS = {
  'institution.announcement': {
    label: 'Aviso institucional',
    description: 'Mensagem exibida no topo do portal e do app (ex.: mudança de horário). Vazio = sem aviso.',
    public: true,
    schema: z.object({ text: z.string().trim().min(1).max(280), tone: z.enum(['info', 'attention']) }).strict().nullable(),
    defaultValue: null as null | { text: string; tone: 'info' | 'attention' },
  },
  'asa.business_hours': {
    label: 'Horário de atendimento do ASA',
    description: 'Usado nos portais e no cálculo de disponibilidade exibido aos alunos.',
    public: true,
    schema: z
      .object({
        days: businessDays,
        note: z.string().trim().max(200).nullable(),
      })
      .strict(),
    defaultValue: {
      days: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, intervals: [{ start: '08:00', end: '21:00' }] })).concat([{ weekday: 6, intervals: [{ start: '08:00', end: '12:00' }] }]),
      note: 'Horário de referência para demonstração — confirme o horário oficial com o ASA.',
    },
  },
  'asa.public_links': {
    label: 'Links institucionais',
    description: 'Somente endereços HTTPS oficiais. Nenhum link é exibido enquanto a lista estiver vazia.',
    public: true,
    schema: z
      .array(z.object({ label: z.string().trim().min(2).max(60), url: z.string().url().refine((value) => value.startsWith('https://'), 'Use um endereço HTTPS.') }).strict())
      .max(8),
    defaultValue: [] as Array<{ label: string; url: string }>,
  },
  'appointments.policy': {
    label: 'Política de agendamentos',
    description: 'Antecedência mínima, horizonte de agenda, prazo de cancelamento e limite de agendamentos ativos.',
    public: true,
    schema: z
      .object({
        minLeadHours: z.number().int().min(0).max(72),
        maxDaysAhead: z.number().int().min(1).max(90),
        cancellationMinHours: z.number().int().min(0).max(72),
        maxActivePerStudent: z.number().int().min(1).max(5),
      })
      .strict(),
    defaultValue: { minLeadHours: 2, maxDaysAhead: 30, cancellationMinHours: 2, maxActivePerStudent: 2 },
  },
  'knowledge.policy': {
    label: 'Governança da base de conhecimento',
    description: 'Exigir que a publicação seja feita por uma pessoa diferente da última que editou o artigo.',
    public: false,
    schema: z.object({ requireSecondReviewer: z.boolean() }).strict(),
    defaultValue: { requireSecondReviewer: false },
  },
  'features.toggles': {
    label: 'Recursos ativos',
    description: 'Desliga recursos sem novo deploy. Só tem efeito quando o recurso também está habilitado no ambiente.',
    public: true,
    schema: z.object({ appointments: z.boolean(), knowledgeBase: z.boolean(), assistantKnowledgeAnswers: z.boolean(), automations: z.boolean() }).strict(),
    defaultValue: { appointments: true, knowledgeBase: true, assistantKnowledgeAnswers: true, automations: true },
  },
} as const;

export type SettingKey = keyof typeof SETTING_DEFINITIONS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_DEFINITIONS)[K]['schema']>;
export type EffectiveSettings = { [K in SettingKey]: SettingValue<K> };

export const SETTING_KEYS = Object.keys(SETTING_DEFINITIONS) as SettingKey[];

export const isSettingKey = (key: string): key is SettingKey => (SETTING_KEYS as string[]).includes(key);

export interface SettingView {
  key: SettingKey;
  label: string;
  description: string;
  public: boolean;
  value: unknown;
  isDefault: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

const CACHE_MS = 15_000;

/** Lê e valida os parâmetros (com cache curto); valores inválidos no banco voltam ao padrão com aviso no log. */
export class SettingsService {
  private cache: { at: number; values: EffectiveSettings; meta: Map<string, { updatedAt: Date; updatedBy: string | null }> } | null = null;

  constructor(
    private readonly repo: SettingsRepository,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private defaults(): EffectiveSettings {
    return Object.fromEntries(SETTING_KEYS.map((key) => [key, structuredClone(SETTING_DEFINITIONS[key].defaultValue)])) as EffectiveSettings;
  }

  private async load() {
    const at = this.now().getTime();
    if (this.cache && at - this.cache.at < CACHE_MS) return this.cache;
    const values = this.defaults() as Record<SettingKey, unknown>;
    const meta = new Map<string, { updatedAt: Date; updatedBy: string | null }>();
    for (const record of await this.repo.getAll()) {
      if (!isSettingKey(record.key)) continue;
      const parsed = SETTING_DEFINITIONS[record.key].schema.safeParse(record.value);
      if (!parsed.success) {
        this.logger.warn({ setting: record.key }, 'invalid stored setting ignored (using default)');
        continue;
      }
      values[record.key] = parsed.data;
      meta.set(record.key, { updatedAt: record.updatedAt, updatedBy: record.updatedBy });
    }
    this.cache = { at, values: values as EffectiveSettings, meta };
    return this.cache;
  }

  async all(): Promise<EffectiveSettings> {
    return (await this.load()).values;
  }

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    return (await this.load()).values[key];
  }

  async list(): Promise<SettingView[]> {
    const { values, meta } = await this.load();
    return SETTING_KEYS.map((key) => {
      const info = meta.get(key);
      const definition = SETTING_DEFINITIONS[key];
      return {
        key,
        label: definition.label,
        description: definition.description,
        public: definition.public,
        value: values[key],
        isDefault: !info,
        updatedAt: info?.updatedAt.toISOString() ?? null,
        updatedBy: info?.updatedBy ?? null,
      };
    });
  }

  /** Valida e grava; devolve o valor anterior (para auditoria) e o novo. */
  async update(key: string, value: unknown, updatedBy: string): Promise<{ key: SettingKey; previous: unknown; value: unknown }> {
    if (!isSettingKey(key)) throw new NotFoundError('Parâmetro desconhecido.');
    const parsed = SETTING_DEFINITIONS[key].schema.safeParse(value);
    if (!parsed.success) {
      throw new ValidationError(
        'Valor inválido para este parâmetro.',
        parsed.error.issues.map((issue) => ({ field: ['value', ...issue.path].join('.'), message: issue.message })),
      );
    }
    const previous = await this.get(key);
    await this.repo.upsert({ key, value: parsed.data, updatedBy, now: this.now() });
    this.cache = null;
    return { key, previous, value: parsed.data };
  }
}
