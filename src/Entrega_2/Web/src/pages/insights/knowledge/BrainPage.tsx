import { BrainCircuit, Check, EyeOff, FileText, Mic, Network, RotateCcw, Type } from 'lucide-react';
import { useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Badge, KeyValueList, List, ListItem, PageHeader, SectionHeader, Surface } from '@/components/ui/Display';
import { FilterChips } from '@/components/data/DataTable';
import { AccessDenied, EmptyState, LoadingRows } from '@/components/feedback/States';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/features/auth/session';
import { useBrainOverview, useUpdateGap } from '@/features/brain/api';
import { useInsightsArea } from '@/features/insights/area';
import { InsightsFailure } from '@/features/insights/components';
import { formatRelative } from '@/lib/format';
import type { AssistantKnowledgeGap, AssistantKnowledgeGapStatus } from '@/types/api';

const STATUS_LABELS: Record<AssistantKnowledgeGapStatus, string> = { open: 'A responder', resolved: 'Respondidas', ignored: 'Ignoradas' };

function GapRow({ gap, canWrite }: { gap: AssistantKnowledgeGap; canWrite: boolean }) {
  const update = useUpdateGap();
  const toast = useToast();
  const { to } = useInsightsArea();
  const change = (status: AssistantKnowledgeGapStatus, message: string) =>
    update.mutate({ id: gap.id, status }, { onSuccess: () => toast.show(message), onError: () => toast.show('Não foi possível salvar agora. Tente de novo.', 'error') });
  return (
    <ListItem
      leading={gap.lastChannel === 'voice' ? <Mic size={20} aria-label="Perguntada por voz" /> : <Type size={20} aria-label="Perguntada por texto" />}
      title={gap.question}
      description={gap.resolutionNote ?? undefined}
      meta={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge tone={gap.timesAsked >= 3 ? 'warning' : 'neutral'}>{gap.timesAsked === 1 ? '1 vez' : `${gap.timesAsked} vezes`}</Badge>
          <span>Última vez {formatRelative(gap.lastAskedAt)}</span>
        </span>
      }
      trailing={
        canWrite ? (
          gap.status === 'open' ? (
            <>
              <ButtonLink to={to('base-conhecimento/novo')} size="sm" icon={FileText} className="hidden md:inline-flex">
                Escrever artigo
              </ButtonLink>
              <Button size="sm" variant="primary" icon={Check} loading={update.isPending} onClick={() => change('resolved', 'Pergunta marcada como respondida.')}>
                Respondida
              </Button>
              <Button size="sm" variant="ghost" icon={EyeOff} disabled={update.isPending} onClick={() => change('ignored', 'Pergunta ignorada.')}>
                Ignorar
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" icon={RotateCcw} loading={update.isPending} onClick={() => change('open', 'Pergunta reaberta.')}>
              Reabrir
            </Button>
          )
        ) : null
      }
    />
  );
}

/** Cérebro do assistente: o que ele sabe (notas do vault) e o que ainda não sabe (perguntas sem resposta). */
export default function BrainPage() {
  const { can } = useSession();
  const allowed = can('kb:read:all');
  const canWrite = can('kb:write');
  const [status, setStatus] = useState<AssistantKnowledgeGapStatus>('open');
  const overview = useBrainOverview(status, allowed);
  const { to } = useInsightsArea();

  if (!allowed) return <AccessDenied />;
  const data = overview.data;

  return (
    <>
      <PageHeader
        title="Cérebro do assistente"
        description="O assistente responde só com a base oficial: os artigos publicados desta base e as notas do cérebro da FECAP (um vault do Obsidian revisado pela equipe). Quando não encontra resposta, a pergunta aparece aqui para a equipe ensinar."
        actions={
          <ButtonLink to={to('cerebro-assistente/mapa')} variant="primary" icon={Network}>
            Ver mapa do cérebro
          </ButtonLink>
        }
      />
      {overview.isPending ? (
        <LoadingRows rows={4} />
      ) : data === undefined ? (
        <InsightsFailure error={overview.error} onRetry={() => void overview.refetch()} />
      ) : (
        <div className="flex flex-col gap-6">
          <Surface>
            <SectionHeader title="O que o assistente sabe" description="Notas do vault (Backend/cerebro, compiladas no deploy) e páginas do site público da FECAP, relidas todo dia sem novo deploy." />
            <KeyValueList
              columns={2}
              items={[
                { label: 'Notas', value: `${data.brain.notes} (${data.brain.sections} trechos pesquisáveis)` },
                { label: 'Ligações entre notas', value: data.brain.links },
                {
                  label: 'Site da FECAP (automático)',
                  value: data.brain.site
                    ? data.brain.site.lastFetchedAt
                      ? `${data.brain.site.pages} páginas, lidas ${formatRelative(data.brain.site.lastFetchedAt)}`
                      : 'Aguardando a primeira leitura diária'
                    : 'Desligado neste ambiente',
                },
                { label: 'Por pasta', value: Object.entries(data.brain.folders).map(([folder, total]) => `${folder}: ${total}`).join(' · ') || '—' },
                {
                  label: 'Linguagem natural',
                  value: data.brain.llmEnabled ? <Badge tone="success">Ligada</Badge> : <Badge tone="warning">Desligada: responde com o trecho da nota</Badge>,
                },
              ]}
            />
            {data.brain.danglingLinks.length > 0 ? (
              <p className="mt-3 text-small text-slate">
                Assuntos citados sem nota ainda: {data.brain.danglingLinks.join(', ')}.
              </p>
            ) : null}
          </Surface>
          <section aria-labelledby="gaps-title">
            <SectionHeader id="gaps-title" title="Perguntas sem resposta" description="Sem nome nem RA de quem perguntou; números e e-mails aparecem mascarados. Escreva um artigo (ou uma nota no cérebro) e marque como respondida. Se a dúvida voltar, ela reabre sozinha." />
            <div className="mb-3">
              <FilterChips<AssistantKnowledgeGapStatus>
                label="Situação"
                value={status}
                onChange={setStatus}
                options={(Object.keys(STATUS_LABELS) as AssistantKnowledgeGapStatus[]).map((key) => ({ value: key, label: STATUS_LABELS[key], count: data.gaps.counts[key] }))}
              />
            </div>
            {data.gaps.items.length === 0 ? (
              <EmptyState icon={BrainCircuit} title={status === 'open' ? 'Nenhuma pergunta sem resposta' : 'Nada por aqui'} description={status === 'open' ? 'Quando o assistente não encontrar base oficial para uma dúvida, ela aparece aqui.' : undefined} />
            ) : (
              <List label="Perguntas sem resposta">
                {data.gaps.items.map((gap) => (
                  <GapRow key={gap.id} gap={gap} canWrite={canWrite} />
                ))}
              </List>
            )}
          </section>
        </div>
      )}
    </>
  );
}
