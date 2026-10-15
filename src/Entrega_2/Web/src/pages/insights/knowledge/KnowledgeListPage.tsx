import { CalendarClock, FileText, Info, Plus, X } from 'lucide-react';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Badge, List, ListItem, PageHeader } from '@/components/ui/Display';
import { Select } from '@/components/ui/Form';
import { FilterChips, Pagination, SearchInput } from '@/components/data/DataTable';
import { AccessDenied, EmptyState, LoadingRows } from '@/components/feedback/States';
import { useSession } from '@/features/auth/session';
import { useInsightsArea } from '@/features/insights/area';
import { InsightsFailure } from '@/features/insights/components';
import { institutionToday } from '@/features/insights/period';
import { ALL_STATUSES, KB_PAGE_SIZE, type KnowledgeListQuery } from '@/features/knowledge/api';
import { useKnowledgeList } from '@/features/knowledge/hooks';
import { AUDIENCE_LABELS, DemoBadge, KB_STATUS_META, KnowledgeStatusBadge, UnpublishedChangesBadge } from '@/features/knowledge/labels';
import { usePlatformInfo } from '@/features/platform/platform';
import { useSupportCatalog } from '@/features/support/staff/hooks';
import { cn } from '@/lib/cn';
import { formatCalendarDate, formatRelative } from '@/lib/format';
import type { KnowledgeArticleStatus, KnowledgeManageSummary } from '@/types/api';

type StatusFilter = KnowledgeArticleStatus | 'all';

const isStatus = (value: string | null): value is KnowledgeArticleStatus => ALL_STATUSES.includes(value as KnowledgeArticleStatus);

function ArticleRow({ article, href, today }: { article: KnowledgeManageSummary; href: string; today: string }) {
  const reviewLate = article.reviewDueAt !== null && article.reviewDueAt < today && article.status !== 'archived';
  return (
    <ListItem
      to={href}
      leading={<FileText size={20} aria-hidden />}
      title={article.title}
      description={
        <>
          {article.categoryLabel ?? 'Sem categoria'} · {AUDIENCE_LABELS[article.audience]} · versão {article.currentVersion}
          {article.publishedVersion !== null && article.publishedVersion !== article.currentVersion ? ` (alunos veem a ${article.publishedVersion})` : ''}
        </>
      }
      meta={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate">
          <span className="sm:hidden">
            <KnowledgeStatusBadge status={article.status} />
          </span>
          {article.hasUnpublishedChanges ? <UnpublishedChangesBadge /> : null}
          {article.isDemo ? <DemoBadge /> : null}
          {article.reviewDueAt ? (
            reviewLate ? (
              <Badge tone="warning" icon={CalendarClock}>
                Revisão vencida em {formatCalendarDate(article.reviewDueAt)}
              </Badge>
            ) : (
              <span>Revisar até {formatCalendarDate(article.reviewDueAt)}</span>
            )
          ) : null}
          <span>
            Atualizado {formatRelative(article.updatedAt)}
            {article.lastEditor ? ` por ${article.lastEditor}` : ''}
          </span>
        </span>
      }
      trailing={
        <span className="hidden sm:inline-flex">
          <KnowledgeStatusBadge status={article.status} />
        </span>
      }
    />
  );
}

/** Gestão da base de conhecimento: artigos por situação, busca, categoria e paginação (filtros na URL). */
export default function KnowledgeListPage() {
  const { can } = useSession();
  const { to } = useInsightsArea();
  const allowed = can('kb:read:all');
  const canWrite = can('kb:write');
  const platform = usePlatformInfo();
  const catalog = useSupportCatalog();
  const [params, setParams] = useSearchParams();
  const status: StatusFilter = isStatus(params.get('situacao')) ? (params.get('situacao') as KnowledgeArticleStatus) : 'all';
  const search = params.get('busca')?.trim() ?? '';
  const category = params.get('categoria') ?? '';
  const page = Math.max(1, Number.parseInt(params.get('pagina') ?? '1', 10) || 1);
  const query: KnowledgeListQuery = { page, pageSize: KB_PAGE_SIZE, ...(status !== 'all' ? { status } : {}), ...(search ? { search } : {}), ...(category ? { category } : {}) };
  const list = useKnowledgeList(query, allowed);

  const update = useCallback(
    (changes: Record<string, string | null>, resetPage = true) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          if (resetPage) next.delete('pagina');
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  const onSearch = useCallback((value: string) => update({ busca: value || null }), [update]);

  if (!allowed) return <AccessDenied />;

  const counts = list.data?.counts;
  const total = counts ? ALL_STATUSES.reduce((sum, key) => sum + counts[key], 0) : undefined;
  const filtered = status !== 'all' || Boolean(search) || Boolean(category);
  const today = institutionToday();
  const categoryOptions = (catalog.data?.categories ?? []).map((item) => ({ value: item.id, label: item.label }));
  if (category && !categoryOptions.some((option) => option.value === category)) categoryOptions.push({ value: category, label: category });

  return (
    <>
      <PageHeader
        title="Base de conhecimento"
        description="Artigos que os alunos leem na Central de ajuda e que o assistente usa para responder, com a fonte citada. Cada alteração vira uma nova versão; os alunos só veem a versão publicada."
        actions={
          canWrite ? (
            <ButtonLink to={to('base-conhecimento/novo')} variant="primary" icon={Plus}>
              Novo artigo
            </ButtonLink>
          ) : null
        }
      />
      {platform.data && !platform.data.features.knowledgeBase ? (
        <p role="note" className="mb-4 flex items-start gap-2 rounded-md border border-line bg-white px-4 py-3 text-small text-slate">
          <Info size={20} aria-hidden className="mt-px shrink-0" />
          A base de conhecimento está desligada para os alunos neste ambiente. Você ainda pode escrever e revisar artigos; eles voltam a aparecer quando o recurso for religado.
        </p>
      ) : null}
      <div className="mb-4 flex flex-col gap-3">
        <FilterChips<StatusFilter>
          label="Situação"
          value={status}
          onChange={(value) => update({ situacao: value === 'all' ? null : value })}
          options={[
            { value: 'all', label: 'Todos', ...(total !== undefined ? { count: total } : {}) },
            ...ALL_STATUSES.map((key) => ({ value: key, label: KB_STATUS_META[key].label, ...(counts ? { count: counts[key] } : {}) })),
          ]}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <SearchInput value={search} onChange={onSearch} label="Buscar artigos" placeholder="Buscar no título e no texto" />
          <Select
            label="Categoria"
            hideLabel
            value={category}
            placeholder="Todas as categorias"
            options={categoryOptions}
            onChange={(event) => update({ categoria: event.target.value || null })}
            containerClassName="sm:w-60"
          />
          {filtered ? (
            <Button variant="ghost" size="sm" icon={X} onClick={() => setParams(new URLSearchParams(), { replace: true })} className="self-start sm:self-center">
              Limpar filtros
            </Button>
          ) : null}
        </div>
      </div>
      {list.isPending ? (
        <LoadingRows rows={5} />
      ) : list.data === undefined ? (
        <InsightsFailure error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.items.length === 0 ? (
        filtered ? (
          <EmptyState
            title="Nenhum artigo com esses filtros"
            description={search ? 'A busca procura palavras de 3 letras ou mais (ou o começo delas) no título, no resumo e no texto da versão atual.' : 'Tente outra situação ou categoria.'}
            action={
              <Button size="sm" icon={X} onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={FileText}
            title="Nenhum artigo ainda"
            description="Escreva o primeiro artigo: ele nasce como rascunho e só chega aos alunos depois de publicado."
            action={
              canWrite ? (
                <ButtonLink to={to('base-conhecimento/novo')} size="sm" icon={Plus}>
                  Novo artigo
                </ButtonLink>
              ) : undefined
            }
          />
        )
      ) : (
        <div className={cn('transition-opacity duration-150', list.isPlaceholderData && 'opacity-60')} aria-busy={list.isPlaceholderData || undefined}>
          {list.isRefetchError ? (
            <p role="alert" className="mb-3 text-small text-danger-text">
              Não foi possível atualizar a lista agora. Ela mostra os dados da última atualização.
            </p>
          ) : null}
          <List label="Artigos da base de conhecimento">
            {list.data.items.map((article) => (
              <ArticleRow key={article.id} article={article} href={to(`base-conhecimento/${encodeURIComponent(article.id)}`)} today={today} />
            ))}
          </List>
          <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(target) => update({ pagina: target > 1 ? String(target) : null }, false)} />
        </div>
      )}
    </>
  );
}
