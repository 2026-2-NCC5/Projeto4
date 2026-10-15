import { BookOpenText, MessageSquarePlus, SearchX, Sparkles } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Button, ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/Display';
import { Select } from '@/components/ui/Form';
import { Pagination, SearchInput } from '@/components/data/DataTable';
import { EmptyState, LoadingRows } from '@/components/feedback/States';
import { CategoryGlyph, DemoContentNote } from '@/features/support/student/components';
import { useSupportCatalog } from '@/features/support/student/hooks';
import { useKnowledgeList } from '@/features/support/student/knowledge';
import type { KnowledgeSearchHit } from '@/types/api';
import { ArticleLinkList, articleCount, HelpFailure } from './shared';

const OTHER = '__outros';

interface Group {
  id: string;
  label: string;
  items: KnowledgeSearchHit[];
}

/** Agrupa por assunto na ordem das categorias do catálogo do Atendimento (artigos sem assunto vão para "Outros"). */
function groupByCategory(items: KnowledgeSearchHit[], order: string[]): Group[] {
  const groups = new Map<string, Group>();
  for (const item of items) {
    const id = item.categoryId ?? OTHER;
    const group = groups.get(id) ?? { id, label: item.categoryLabel ?? 'Outros assuntos', items: [] };
    group.items.push(item);
    groups.set(id, group);
  }
  const rank = (id: string) => (id === OTHER ? Number.MAX_SAFE_INTEGER : order.indexOf(id) === -1 ? order.length : order.indexOf(id));
  return [...groups.values()].sort((a, b) => rank(a.id) - rank(b.id) || a.label.localeCompare(b.label, 'pt-BR'));
}

/**
 * Central de ajuda: artigos PUBLICADOS da base de conhecimento (GET /api/knowledge-base), com busca no servidor
 * (?q=), filtro por assunto (?categoria=) e páginas (?pagina=).
 */
export default function HelpCenterPage() {
  const [params, setParams] = useSearchParams();
  const search = (params.get('q') ?? '').trim();
  const category = params.get('categoria') ?? '';
  const page = Math.max(1, Math.trunc(Number(params.get('pagina'))) || 1);
  const list = useKnowledgeList({ search: search || undefined, category: category || undefined, page });
  const catalog = useSupportCatalog();
  const categories = catalog.data?.categories ?? [];
  const categoryLabel = categories.find((item) => item.id === category)?.label ?? list.data?.items.find((item) => item.categoryId === category)?.categoryLabel ?? null;

  const change = (patch: Record<string, string | null>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        // nova busca ou novo assunto sempre começa da primeira página
        if (!('pagina' in patch)) next.delete('pagina');
        return next;
      },
      { replace: true },
    );

  const header = (
    <PageHeader
      title="Central de ajuda"
      description="Orientações publicadas pelo ASA para as dúvidas mais comuns. Se não resolver, abra um chamado."
      actions={
        <>
          <ButtonLink to="/aluno/assistente" icon={Sparkles}>
            Perguntar ao assistente
          </ButtonLink>
          <ButtonLink to="/aluno/chamados/novo" variant="primary" icon={MessageSquarePlus}>
            Abrir chamado
          </ButtonLink>
        </>
      }
    />
  );

  const filters = (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-1.5 sm:flex-1">
        <span className="text-small font-semibold text-ink" aria-hidden>
          Buscar na ajuda
        </span>
        {/* mesma busca já aplicada: não navega de novo (o campo repete o aviso enquanto houver espaço no fim) */}
        <SearchInput label="Buscar na ajuda" value={search} onChange={(value) => (value === search ? undefined : change({ q: value || null }))} placeholder="Ex.: boleto, histórico, wi-fi" />
      </div>
      {categories.length > 0 ? (
        <Select
          label="Assunto"
          value={categories.some((item) => item.id === category) ? category : ''}
          onChange={(event) => change({ categoria: event.target.value || null })}
          placeholder="Todos os assuntos"
          options={categories.map((item) => ({ value: item.id, label: item.label }))}
          containerClassName="sm:w-64"
        />
      ) : null}
    </div>
  );

  if (list.isPending) {
    return (
      <>
        {header}
        {filters}
        <LoadingRows rows={5} />
      </>
    );
  }
  if (list.error) {
    return (
      <>
        {header}
        <HelpFailure error={list.error} onRetry={() => void list.refetch()} title="Não foi possível carregar a Central de ajuda" />
      </>
    );
  }

  const { items, total, pageSize } = list.data;
  const filtered = Boolean(search || category);
  const mixedDemo = items.some((item) => item.isDemo) && items.some((item) => !item.isDemo);
  const groups = filtered ? [] : groupByCategory(items, categories.map((item) => item.id));
  const status = search
    ? `${articleCount(total)} para “${search}”${categoryLabel ? ` em ${categoryLabel}` : ''}`
    : category
      ? `${articleCount(total)} em ${categoryLabel ?? 'este assunto'}`
      : `${articleCount(total)}${groups.length > 1 ? ` em ${groups.length} assuntos` : ''}`;

  return (
    <>
      {header}
      {filters}
      <div className="mb-5 flex flex-col gap-1">
        <p role="status" className="text-small text-slate">
          {/* enquanto a nova busca não chega, a lista anterior continua na tela, mas o total não é dela */}
          {list.isPlaceholderData ? 'Buscando…' : status}
        </p>
        {items.some((item) => item.isDemo) ? <DemoContentNote /> : null}
      </div>
      {items.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title={search ? `Nenhum artigo encontrado para “${search}”` : `Ainda não há artigos sobre ${categoryLabel ?? 'este assunto'}`}
            description="Tente outras palavras ou pergunte ao Assistente ASA. Se a dúvida continuar, abra um chamado para o ASA."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => change({ q: null, categoria: null })}>Ver todos os artigos</Button>
                <ButtonLink to="/aluno/chamados/novo" icon={MessageSquarePlus}>
                  Abrir chamado
                </ButtonLink>
              </div>
            }
          />
        ) : (
          <EmptyState icon={BookOpenText} title="Nenhum artigo publicado ainda" description="Quando o ASA publicar orientações, elas aparecem aqui. Enquanto isso, abra um chamado para tirar sua dúvida." />
        )
      ) : filtered ? (
        <ArticleLinkList label={search ? 'Resultados da busca' : `Artigos de ${categoryLabel ?? 'este assunto'}`} articles={items} details={search ? 'excerpt' : 'summary'} showCategory={!category} showDemo={mixedDemo} />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.id} aria-labelledby={`ajuda-${group.id}`}>
              <h2 id={`ajuda-${group.id}`} className="mb-2 flex items-center gap-2 text-h3 font-semibold text-ink">
                <CategoryGlyph categoryId={group.id} className="shrink-0 text-slate" />
                {group.label}
              </h2>
              <ArticleLinkList label={`Artigos de ${group.label}`} articles={group.items} showDemo={mixedDemo} />
            </section>
          ))}
        </div>
      )}
      {total > pageSize ? <Pagination page={list.data.page} pageSize={pageSize} total={total} onPage={(next) => change({ pagina: next > 1 ? String(next) : null })} /> : null}
    </>
  );
}
