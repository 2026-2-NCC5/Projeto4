import type { AppConfig } from '../config/env.js';
import type { PlatformInfo, PlatformLink } from '../contracts/mobileApi.v1.js';
import { AppError, DependencyError } from '../errors/AppError.js';
import type { SettingsService } from './settingsService.js';

export const DATA_MODE_LABELS = {
  demo: 'DEMONSTRAÇÃO — Dados fictícios',
  institutional: 'INSTITUCIONAL — Dados autorizados',
} as const;

const WEEKDAY_LABELS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

export const CONTRACT_VERSION = '1.8';

/** Recursos que a administração pode desligar sem novo deploy (somados à flag de ambiente). */
export type ToggleableFeature = 'appointments' | 'knowledgeBase' | 'assistantKnowledgeAnswers' | 'automations';

/** Estado do provedor de IA (preenchido pelo registro de provedores; JEV fica "planejado"). */
export interface AssistantProviderStatus {
  provider: 'existing' | 'jev';
  providerLabel: string;
  jev: { status: 'planned' | 'not_configured' | 'operational'; enabled: boolean };
}

/**
 * Informações públicas da plataforma: modo de dados (DEMONSTRAÇÃO × INSTITUCIONAL), recursos ativos,
 * fonte acadêmica, horário do ASA e links oficiais. Clientes usam para o rótulo e para esconder recursos.
 */
export class PlatformService {
  constructor(
    private readonly config: AppConfig,
    private readonly settings: SettingsService,
    private readonly apiVersion: string,
    private readonly now: () => Date,
    private readonly assistantStatus: () => AssistantProviderStatus,
  ) {}

  get dataMode(): 'demo' | 'institutional' {
    return this.config.demo.dataEnabled ? 'demo' : 'institutional';
  }

  academicSource(): PlatformInfo['academicSource'] {
    if (this.config.academic.provider === 'institutional') {
      return { provider: 'institutional', status: 'unavailable', message: 'Aguardando integração institucional: a fonte oficial de dados acadêmicos não está configurada.' };
    }
    if (!this.config.demo.dataEnabled) {
      return { provider: 'demo', status: 'unavailable', message: 'Modo demonstração desligado e nenhuma fonte institucional configurada: dados acadêmicos indisponíveis.' };
    }
    return { provider: 'demo', status: 'demo', message: 'Disciplinas, notas, frequência e pendências fictícias, criadas para demonstração.' };
  }

  /** Usado pelos serviços acadêmicos: nunca cai em dados fictícios quando a demonstração está desligada. */
  assertAcademicAvailable(): void {
    const source = this.academicSource();
    if (source.status === 'unavailable') throw new DependencyError(source.message, undefined, 'academic_source_unavailable');
  }

  async isEnabled(feature: ToggleableFeature): Promise<boolean> {
    const toggles = await this.settings.get('features.toggles');
    const env =
      feature === 'appointments'
        ? this.config.features.appointments
        : feature === 'knowledgeBase'
          ? this.config.features.knowledgeBase
          : feature === 'assistantKnowledgeAnswers'
            ? this.config.features.knowledgeBase && this.config.assistant.enabled
            : true;
    return env && toggles[feature];
  }

  /** 403 `feature_disabled` quando o recurso está desligado (ambiente ou administração). */
  async assertEnabled(feature: ToggleableFeature): Promise<void> {
    if (!(await this.isEnabled(feature))) throw new AppError(403, 'FORBIDDEN', 'Este recurso está desativado neste ambiente.', { reason: 'feature_disabled' });
  }

  async info(): Promise<PlatformInfo> {
    const settings = await this.settings.all();
    const legal: PlatformLink[] = [
      ...(this.config.auth.legal.termsUrl ? [{ label: 'Termos de uso', url: this.config.auth.legal.termsUrl }] : []),
      ...(this.config.auth.legal.privacyUrl ? [{ label: 'Política de privacidade', url: this.config.auth.legal.privacyUrl }] : []),
    ];
    const queueSource = !this.config.queue.enabled ? 'disabled' : this.config.queue.provider === 'mock' ? 'demo' : 'public_panel';
    const announcement = settings['institution.announcement'];
    const announcementMeta = (await this.settings.list()).find((item) => item.key === 'institution.announcement');
    return {
      name: 'ASA Conecta',
      institution: 'FECAP — Área do Sucesso Alvarista (ASA)',
      environment: this.config.appEnv,
      apiVersion: this.apiVersion,
      contractVersion: CONTRACT_VERSION,
      dataMode: this.dataMode,
      dataModeLabel: DATA_MODE_LABELS[this.dataMode],
      academicSource: this.academicSource(),
      features: {
        tickets: this.config.features.tickets,
        appointments: await this.isEnabled('appointments'),
        knowledgeBase: await this.isEnabled('knowledgeBase'),
        notifications: this.config.features.notifications,
        realtime: this.config.features.realtime,
        assistant: this.config.assistant.enabled,
      },
      assistant: this.assistantStatus(),
      queue: { enabled: this.config.queue.enabled, source: queueSource, authorized: this.config.queue.sourceAuthorized },
      announcement: announcement ? { ...announcement, updatedAt: announcementMeta?.updatedAt ?? this.now().toISOString() } : null,
      businessHours: {
        timezone: this.config.assistant.timezone,
        days: [...settings['asa.business_hours'].days]
          .sort((a, b) => a.weekday - b.weekday)
          .map((day) => ({ weekday: day.weekday, label: WEEKDAY_LABELS[day.weekday] ?? String(day.weekday), intervals: day.intervals })),
        note: settings['asa.business_hours'].note,
      },
      links: [...settings['asa.public_links'], ...legal],
      timezone: this.config.assistant.timezone,
      serverTime: this.now().toISOString(),
    };
  }
}
