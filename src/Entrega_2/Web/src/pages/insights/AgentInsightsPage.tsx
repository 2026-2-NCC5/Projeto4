import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, BookOpenText, Bot, CircleSlash, Cpu, RefreshCw } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Badge, KeyValueList, PageHeader, Surface } from '@/components/ui/Display';
import { AccessDenied, EmptyState, LoadingRows } from '@/components/feedback/States';
import { useSession } from '@/features/auth/session';
import { insightsApi, insightsKeys } from '@/features/insights/api';
import { useInsightsArea } from '@/features/insights/area';
import { BreakdownChart } from '@/features/insights/charts';
import { InsightsFailure, PanelHeader, PeriodPicker, RefetchFailed, SourceNote, StatGrid } from '@/features/insights/components';
import { usePeriodFromUrl } from '@/features/insights/hooks';
import {
  FALLBACK_REASON_LABELS,
  jevStatusLabel,
  labelAssistantStatuses,
  labelIntents,
  labelRecommendationTypes,
  PROVIDER_ID_LABELS,
  recommendationTypeLabel,
  RUN_STATUS_LABELS,
} from '@/features/insights/labels';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/lib/format';
import type { AgentInsights } from '@/types/api';

const share = (part: number, total: number) => (total > 0 ? formatPercent(part / total) : null);
const withShare = (part: number, total: number, suffix = 'das execuções') => {
  const value = share(part, total);
  return value ? `${value} ${suffix}` : undefined;
};

/**
 * Provedor de IA do assistente, com honestidade sobre o JEV: ele é uma integração planejada que não responde
 * perguntas. O texto aqui nunca diz que o JEV está em uso, mesmo que a configuração peça por ele.
 */
function ProviderStatus({ provider }: { provider: AgentInsights['provider'] }) {
  const fallback = provider.fallbackReason ? (FALLBACK_REASON_LABELS[provider.fallbackReason] ?? `O provedor pedido não está em uso (motivo informado: ${provider.fallbackReason}).`) : null;
  return (
    <Surface aria-labelledby="ia-provedor">
      <PanelHeader id="ia-provedor" title="Provedor de IA do assistente" description="Quem produz as respostas do Assistente ASA neste ambiente." />
      <KeyValueList
        columns={2}
        items={[
          { label: 'Em uso agora', value: provider.label },
          {
            label: 'Pedido na configuração (AI_PROVIDER)',
            value: (
              <span className="flex flex-wrap items-center gap-2">
                <code className="rounded-xs bg-snow px-1.5 font-mono text-small text-ink">{provider.requested}</code>
                <span className="text-slate">{PROVIDER_ID_LABELS[provider.requested] ?? provider.requested}</span>
              </span>
            ),
          },
        ]}
      />
      {fallback ? (
        <p role="note" className="mt-4 flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-small text-warning-text">
          <AlertTriangle size={20} aria-hidden className="mt-px shrink-0" />
          <span>{fallback}</span>
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-2 border-t border-line-soft pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body font-medium text-ink">JEV</span>
          <Badge tone="neutral" icon={CircleSlash}>
            {jevStatusLabel(provider.jev.status)}
          </Badge>
        </div>
        <p className="text-small text-slate">{provider.jev.detail}</p>
        <p className="text-small text-slate">
          O JEV é uma integração futura: hoje ele não responde perguntas e nenhuma resposta do assistente é atribuída a ele. As respostas vêm de regras do ASA Conecta e de
          artigos publicados da base de conhecimento, sem modelo de linguagem.
        </p>
      </div>
    </Surface>
  );
}

function AgentServiceConfig({ config }: { config: AgentInsights['agentConfig'] }) {
  return (
    <Surface aria-labelledby="ia-agent-service">
      <PanelHeader id="ia-agent-service" title="Agent Service" description="Versões e limiares ativos do serviço que gera as recomendações." />
      {config.available ? (
        <KeyValueList
          columns={2}
          items={[
            { label: 'Versão do agente', value: config.agentVersion ?? '—' },
            { label: 'Versão da configuração', value: config.configVersion ?? '—' },
            { label: 'Versão do contrato', value: config.contractVersion || '—' },
            { label: 'Confiança mínima para recomendar', value: config.minimumConfidence === null ? '—' : formatPercent(config.minimumConfidence) },
            {
              label: 'Regras ativas',
              value:
                config.rules.length === 0 ? (
                  'Nenhuma'
                ) : (
                  <ul className="flex flex-col gap-0.5">
                    {config.rules.map((rule) => (
                      <li key={rule}>{recommendationTypeLabel(rule)}</li>
                    ))}
                  </ul>
                ),
            },
          ]}
        />
      ) : (
        <p className="flex items-start gap-2 text-small text-slate">
          <Cpu size={20} aria-hidden className="mt-px shrink-0" />
          <span>O Agent Service não respondeu agora, então versões e limiares não estão disponíveis. Os números de execuções abaixo vêm do banco de dados e continuam válidos.</span>
        </p>
      )}
    </Surface>
  );
}

function AgentRuns({ runs, recommendations }: { runs: AgentInsights['runs']; recommendations: AgentInsights['recommendationsByType'] }) {
  return (
    <Surface aria-labelledby="ia-execucoes">
      <PanelHeader id="ia-execucoes" title="Agente para o Estudante" description="Análises pedidas pelos alunos no período." />
      {runs.total === 0 ? (
        <p className="text-small text-slate">Nenhuma análise do Agente no período.</p>
      ) : (
        <StatGrid
          columns={3}
          items={[
            { label: 'Análises', value: formatNumber(runs.total) },
            { label: RUN_STATUS_LABELS.recommendation, value: formatNumber(runs.byStatus.recommendation), hint: withShare(runs.byStatus.recommendation, runs.total) },
            { label: RUN_STATUS_LABELS.no_action, value: formatNumber(runs.byStatus.no_action), hint: withShare(runs.byStatus.no_action, runs.total) },
            {
              label: 'Abstenções',
              value: formatNumber(runs.byStatus.abstained),
              hint: runs.abstentionRate === null ? undefined : `${formatPercent(runs.abstentionRate)} das execuções (dados insuficientes ou pouca confiança)`,
            },
            { label: 'Confiança média', value: formatPercent(runs.averageConfidence), hint: runs.averageConfidence === null ? 'Sem confiança registrada' : 'Média das execuções do período' },
            { label: 'Pediram validação humana', value: formatNumber(runs.requiresHumanValidation), hint: withShare(runs.requiresHumanValidation, runs.total) },
          ]}
        />
      )}
      <div className="mt-6 max-w-3xl">
        <BreakdownChart title="Recomendações por tipo" items={labelRecommendationTypes(recommendations)} firstHeader="Tipo" emptyText="Nenhuma recomendação no período." />
      </div>
    </Surface>
  );
}

function Feedback({ feedback }: { feedback: AgentInsights['feedback'] }) {
  const total = feedback.helpful + feedback.notHelpful;
  return (
    <Surface aria-labelledby="ia-avaliacoes">
      <PanelHeader id="ia-avaliacoes" title="Avaliação das recomendações" description="Cada aluno pode marcar uma recomendação como útil ou não útil." />
      {total === 0 ? (
        <p className="text-small text-slate">Nenhuma recomendação avaliada no período.</p>
      ) : (
        <StatGrid
          columns={3}
          items={[
            { label: 'Avaliações', value: formatNumber(total) },
            { label: 'Úteis', value: formatNumber(feedback.helpful), hint: withShare(feedback.helpful, total, 'das avaliações') },
            { label: 'Não úteis', value: formatNumber(feedback.notHelpful), hint: withShare(feedback.notHelpful, total, 'das avaliações') },
          ]}
        />
      )}
      <p className="mt-4 text-caption text-mist">Os indicadores trazem só as contagens; comentários de alunos não aparecem neste painel.</p>
    </Surface>
  );
}

function Assistant({ assistant, kbLink }: { assistant: AgentInsights['assistant']; kbLink: string | null }) {
  return (
    <Surface aria-labelledby="ia-assistente">
      <PanelHeader
        id="ia-assistente"
        title="Assistente ASA"
        description="Conversas por voz ou texto no período (só metadados: o texto das mensagens não entra nestes números)."
        action={
          kbLink ? (
            <ButtonLink to={kbLink} variant="ghost" size="sm" icon={BookOpenText}>
              Base de conhecimento
            </ButtonLink>
          ) : null
        }
      />
      {assistant.interactions === 0 ? (
        <p className="text-small text-slate">Nenhuma interação com o assistente no período.</p>
      ) : (
        <>
          <StatGrid
            columns={3}
            items={[
              { label: 'Interações', value: formatNumber(assistant.interactions) },
              {
                label: 'Respondidas pela base de conhecimento',
                value: formatNumber(assistant.knowledgeAnswered),
                hint: 'Resposta de um artigo publicado, citado como fonte',
              },
              {
                label: 'Sem resposta confiável na base',
                value: formatNumber(assistant.knowledgeAbstained),
                hint: 'O assistente se absteve e sugeriu abrir um chamado',
              },
            ]}
          />
          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-2">
            <BreakdownChart title="Resultado das interações" items={labelAssistantStatuses(assistant.byStatus)} firstHeader="Resultado" emptyText="Sem interações no período." total={assistant.interactions} />
            <BreakdownChart
              title="Intenções mais frequentes"
              description="Até 12 intenções; a participação é sobre o total de interações."
              items={labelIntents(assistant.byIntent)}
              firstHeader="Intenção"
              emptyText="Sem interações no período."
              total={assistant.interactions}
            />
          </div>
        </>
      )}
    </Surface>
  );
}

/** Indicadores agregados do Agente e do Assistente (sem identificar alunos) e o provedor de IA em uso. */
export default function AgentInsightsPage() {
  const { can } = useSession();
  const { area, to } = useInsightsArea();
  const allowed = can('agent:insights:read');
  const { period, query: range, today, update } = usePeriodFromUrl();
  const query = useQuery({
    queryKey: insightsKeys.agent(range ?? { from: '', to: '' }),
    queryFn: () => insightsApi.agentInsights(range!),
    enabled: allowed && range !== null,
    placeholderData: keepPreviousData,
  });

  if (!allowed) return <AccessDenied />;

  const data = query.data;
  const stale = query.isPlaceholderData;
  return (
    <>
      <PageHeader
        title={area === 'admin' ? 'Agente e provedores de IA' : 'Agente e assistente'}
        description="Números agregados do Agente para o Estudante e do Assistente ASA. Nenhum aluno é identificado."
      />
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <PeriodPicker period={period} today={today} onChange={update} />
        {range ? (
          <Button size="sm" icon={RefreshCw} onClick={() => void query.refetch()} loading={query.isFetching && !query.isPending} className="self-start lg:self-end">
            Atualizar
          </Button>
        ) : null}
      </div>
      {period.error ? (
        <EmptyState title="Período inválido" description="Ajuste as datas acima para ver os números." />
      ) : query.isPending ? (
        <LoadingRows rows={6} />
      ) : data === undefined ? (
        <InsightsFailure error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <div className={cn('flex flex-col gap-6 transition-opacity duration-150', stale && 'opacity-60')} aria-busy={stale || undefined}>
          {query.isRefetchError ? <RefetchFailed generatedAt={data.source.generatedAt} /> : null}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <ProviderStatus provider={data.provider} />
            <AgentServiceConfig config={data.agentConfig} />
          </div>
          <AgentRuns runs={data.runs} recommendations={data.recommendationsByType} />
          <Feedback feedback={data.feedback} />
          <Assistant assistant={data.assistant} kbLink={can('kb:read:all') ? to('base-conhecimento') : null} />
          <Surface aria-label="Origem dos dados">
            <p className="mb-1 flex items-center gap-2 text-small text-ink">
              <Bot size={20} aria-hidden className="shrink-0 text-slate" />
              Origem dos números
            </p>
            <SourceNote source={data.source} className="border-t-0 pt-0" />
          </Surface>
        </div>
      )}
    </>
  );
}
