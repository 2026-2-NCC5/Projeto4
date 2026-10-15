import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { Badge, PageHeader, Surface } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { AccessDenied, EmptyState, LoadingRows } from '@/components/feedback/States';
import { adminApi, adminKeys, capitalize, fieldErrors } from '@/features/admin/api';
import { AdminFailure, LastChange, Notice } from '@/features/admin/components';
import {
  asAnnouncement,
  asAppointmentsPolicy,
  asBusinessHours,
  asFeatureToggles,
  asKnowledgePolicy,
  asPublicLinks,
  describeServerErrors,
  SETTING_KEYS,
  settingAnchor,
} from '@/features/admin/settings';
import { useSession } from '@/features/auth/session';
import { platformKeys, usePlatformInfo } from '@/features/platform/platform';
import { messageForError } from '@/services/api/client';
import type { AdminSetting } from '@/types/api';
import { AnnouncementEditor, AppointmentsPolicyEditor, BusinessHoursEditor, FeatureTogglesEditor, KnowledgePolicyEditor, PublicLinksEditor } from './SettingEditors';

/** Valor que o portal não sabe editar (chave nova ou formato inesperado): mostrado como está, sem edição. */
function ReadOnlyValue({ value, reason }: { value: unknown; reason: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Notice tone="neutral">{reason}</Notice>
      <pre className="max-h-64 overflow-auto rounded-md border border-line bg-snow p-3 font-mono text-caption text-ink" tabIndex={0} aria-label="Valor atual">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

const UNEXPECTED = 'O valor gravado não tem o formato esperado por este editor. Nada foi alterado; confira o servidor.';

function SettingEditor({ setting, saving, onSave, serverErrors, timezone }: { setting: AdminSetting; saving: boolean; onSave: (value: unknown) => void; serverErrors: Record<string, string>; timezone: string | null }) {
  const common = { saving, onSave, serverErrors };
  switch (setting.key) {
    case SETTING_KEYS.announcement: {
      const value = asAnnouncement(setting.value);
      return value === undefined ? <ReadOnlyValue value={setting.value} reason={UNEXPECTED} /> : <AnnouncementEditor value={value} {...common} />;
    }
    case SETTING_KEYS.businessHours: {
      const value = asBusinessHours(setting.value);
      return value ? <BusinessHoursEditor value={value} timezone={timezone} {...common} /> : <ReadOnlyValue value={setting.value} reason={UNEXPECTED} />;
    }
    case SETTING_KEYS.publicLinks: {
      const value = asPublicLinks(setting.value);
      return value ? <PublicLinksEditor value={value} {...common} /> : <ReadOnlyValue value={setting.value} reason={UNEXPECTED} />;
    }
    case SETTING_KEYS.appointmentsPolicy: {
      const value = asAppointmentsPolicy(setting.value);
      return value ? <AppointmentsPolicyEditor value={value} {...common} /> : <ReadOnlyValue value={setting.value} reason={UNEXPECTED} />;
    }
    case SETTING_KEYS.knowledgePolicy: {
      const value = asKnowledgePolicy(setting.value);
      return value ? <KnowledgePolicyEditor value={value} {...common} /> : <ReadOnlyValue value={setting.value} reason={UNEXPECTED} />;
    }
    case SETTING_KEYS.featureToggles: {
      const value = asFeatureToggles(setting.value);
      return value ? <FeatureTogglesEditor value={value} {...common} /> : <ReadOnlyValue value={setting.value} reason={UNEXPECTED} />;
    }
    default:
      return <ReadOnlyValue value={setting.value} reason="Este parâmetro ainda não tem editor no portal. O valor atual aparece abaixo, só para consulta." />;
  }
}

function SettingSection({ setting, timezone }: { setting: AdminSetting; timezone: string | null }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: (value: unknown) => adminApi.updateSetting(setting.key, value),
    onSuccess: (settings) => {
      queryClient.setQueryData(adminKeys.settings, settings);
      // parâmetros públicos aparecem em /api/platform/info (aviso, horário, links, recursos ativos)
      void queryClient.invalidateQueries({ queryKey: platformKeys.info });
      if (setting.key === SETTING_KEYS.featureToggles) void queryClient.invalidateQueries({ queryKey: adminKeys.automations });
      toast.show(`${setting.label}: alteração salva.`);
    },
    onError: (error) => toast.show(`${setting.label}: ${messageForError(error, 'não foi possível salvar.')}`, 'error'),
  });
  const details = save.error ? describeServerErrors(setting.key, save.error, save.variables) : [];
  const serverErrors = Object.fromEntries(Object.entries(fieldErrors(save.error)).map(([field, message]) => [field.replace(/^value\.?/, ''), capitalize(message)]));
  const anchor = settingAnchor(setting.key);
  return (
    <Surface id={anchor} aria-labelledby={`${anchor}-titulo`} className="scroll-mt-24">
      <div className="mb-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={`${anchor}-titulo`} className="text-h3 font-semibold text-ink">
            {setting.label}
          </h2>
          {setting.public ? (
            <Badge tone="neutral" icon={Eye}>
              Público
            </Badge>
          ) : (
            <Badge tone="neutral" icon={EyeOff}>
              Interno
            </Badge>
          )}
        </div>
        <p className="text-small text-slate">{setting.description}</p>
        <LastChange updatedAt={setting.updatedAt} updatedBy={setting.updatedBy} />
      </div>
      {save.error && details.length > 0 ? (
        <Notice tone="danger" title="O servidor recusou o valor" alert className="mb-4">
          <ul className="list-disc pl-5">
            {details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      <SettingEditor
        key={setting.updatedAt ?? 'padrao'}
        setting={setting}
        saving={save.isPending}
        onSave={(value) => save.mutate(value)}
        serverErrors={serverErrors}
        timezone={timezone}
      />
    </Surface>
  );
}

/** Configurações: parâmetros institucionais com editor próprio para cada chave e validação antes de enviar. */
export default function SettingsPage() {
  const { can } = useSession();
  const allowed = can('settings:manage');
  const query = useQuery({ queryKey: adminKeys.settings, queryFn: adminApi.settings, enabled: allowed });
  const platform = usePlatformInfo();
  const { hash } = useLocation();
  const loaded = Boolean(query.data);

  // âncora (ex.: #recursos-ativos vindo das automações): rola até a seção quando os dados chegam
  useEffect(() => {
    if (!loaded || !hash) return;
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    target?.scrollIntoView?.({ block: 'start' });
  }, [loaded, hash]);

  if (!allowed) return <AccessDenied />;

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Parâmetros institucionais da plataforma. Segredos e credenciais não ficam aqui: continuam nas variáveis de ambiente do servidor. Cada mudança fica na auditoria."
      />
      <Notice tone="info" className="mb-6">
        Parâmetros marcados como “Público” aparecem para todos no portal e no aplicativo, inclusive antes de entrar. Os marcados como “Interno” só mudam regras de funcionamento.
      </Notice>
      {query.isPending ? (
        <LoadingRows rows={6} />
      ) : query.data === undefined ? (
        <AdminFailure error={query.error} onRetry={() => void query.refetch()} title="Não foi possível carregar as configurações" />
      ) : query.data.length === 0 ? (
        <EmptyState title="Nenhum parâmetro" description="O servidor não devolveu parâmetros editáveis." />
      ) : (
        <div className="flex flex-col gap-6">
          {query.data.map((setting) => (
            <SettingSection key={setting.key} setting={setting} timezone={platform.data?.businessHours.timezone ?? null} />
          ))}
        </div>
      )}
    </>
  );
}
