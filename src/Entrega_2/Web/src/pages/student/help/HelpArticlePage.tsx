import { ExternalLink, FlaskConical, MessageSquarePlus, Sparkles } from 'lucide-react';
import { useId } from 'react';
import { useParams } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { KeyValueList, PageHeader, SectionHeader, Surface } from '@/components/ui/Display';
import { LoadingRows } from '@/components/feedback/States';
import { Pill } from '@/features/academic/components';
import { BackLink, CategoryGlyph, DemoContentNote, NotFoundState } from '@/features/support/student/components';
import { useKnowledgeArticle, useKnowledgeList } from '@/features/support/student/knowledge';
import { formatDate, formatDateTime } from '@/lib/format';
import type { KnowledgeArticle } from '@/types/api';
import { ArticleBody, ArticleLinkList, HelpFailure } from './shared';

const RELATED = 4;

function RelatedArticles({ article }: { article: KnowledgeArticle }) {
  const headingId = useId();
  const related = useKnowledgeList({ category: article.categoryId ?? undefined }, { enabled: Boolean(article.categoryId) });
  const items = (related.data?.items ?? []).filter((item) => item.id !== article.id).slice(0, RELATED);
  if (!article.categoryId || related.isError || items.length === 0) return null;
  return (
    <Surface aria-labelledby={headingId}>
      <SectionHeader id={headingId} title={`Mais sobre ${article.categoryLabel ?? 'este assunto'}`} />
      <ArticleLinkList label="Artigos relacionados" articles={items} details="none" />
    </Surface>
  );
}

function AboutArticle({ article }: { article: KnowledgeArticle }) {
  const headingId = useId();
  const sourceUrl = article.sourceUrl && /^https:\/\/\S+$/i.test(article.sourceUrl) ? article.sourceUrl : null;
  return (
    <Surface aria-labelledby={headingId}>
      <SectionHeader id={headingId} title="Sobre este artigo" />
      <KeyValueList
        items={[
          {
            label: 'Assunto',
            value: article.categoryId ? (
              <span className="inline-flex items-center gap-1.5">
                <CategoryGlyph categoryId={article.categoryId} size={16} className="shrink-0 text-slate" />
                {article.categoryLabel ?? 'Outros assuntos'}
              </span>
            ) : (
              'Outros assuntos'
            ),
          },
          { label: 'Versão publicada', value: `Versão ${article.version}${article.publishedAt ? ` · ${formatDate(article.publishedAt)}` : ''}` },
          { label: 'Última atualização', value: formatDateTime(article.updatedAt) },
          ...(article.sourceLabel || sourceUrl
            ? [
                {
                  label: 'Fonte',
                  value: (
                    <span className="flex flex-col gap-0.5">
                      {article.sourceLabel ? <span>{article.sourceLabel}</span> : null}
                      {sourceUrl ? (
                        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 rounded-sm text-action underline underline-offset-2 hover:no-underline">
                          Abrir fonte original
                          <ExternalLink size={16} aria-hidden />
                          <span className="sr-only">(abre em nova aba)</span>
                        </a>
                      ) : null}
                    </span>
                  ),
                },
              ]
            : []),
        ]}
      />
    </Surface>
  );
}

/** Artigo publicado da base de conhecimento: corpo com o passo a passo, dados da versão, relacionados e atalhos. */
export default function HelpArticlePage() {
  const { id = '' } = useParams();
  const article = useKnowledgeArticle(id);
  const contentId = useId();
  const back = <BackLink to="/aluno/ajuda">Central de ajuda</BackLink>;

  if (article.isPending) {
    return (
      <>
        <div className="mb-4">{back}</div>
        <LoadingRows rows={4} />
      </>
    );
  }
  if (article.error) {
    return (
      <>
        <div className="mb-4">{back}</div>
        <HelpFailure
          error={article.error}
          onRetry={() => void article.refetch()}
          title="Não foi possível carregar o artigo"
          notFound={<NotFoundState title="Artigo não encontrado" description="Este artigo não existe ou foi retirado da Central de ajuda." backTo="/aluno/ajuda" backLabel="Voltar à Central de ajuda" />}
        />
      </>
    );
  }

  const data = article.data;
  const ticketHref = data.categoryId ? `/aluno/chamados/novo?categoria=${encodeURIComponent(data.categoryId)}` : '/aluno/chamados/novo';

  return (
    <>
      <PageHeader
        eyebrow={back}
        title={data.title}
        description={data.summary}
        actions={
          <>
            <ButtonLink to="/aluno/assistente" icon={Sparkles}>
              Perguntar ao assistente
            </ButtonLink>
            <ButtonLink to={ticketHref} variant="primary" icon={MessageSquarePlus}>
              Abrir chamado sobre isso
            </ButtonLink>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start">
        <Surface aria-labelledby={contentId}>
          <h2 id={contentId} className="sr-only">
            Conteúdo do artigo
          </h2>
          {data.isDemo ? (
            <Pill tone="warning" icon={FlaskConical} className="mb-4">
              Conteúdo de demonstração
            </Pill>
          ) : null}
          <ArticleBody body={data.body} summary={data.summary} />
          <p className="mt-6 border-t border-line-soft pt-4 text-small text-slate">Não resolveu? Abra um chamado e o ASA responde pela conversa do chamado, aqui e no aplicativo.</p>
          {data.isDemo ? <DemoContentNote className="mt-2" /> : null}
        </Surface>
        <div className="flex min-w-0 flex-col gap-6">
          <AboutArticle article={data} />
          <RelatedArticles article={data} />
        </div>
      </div>
    </>
  );
}
