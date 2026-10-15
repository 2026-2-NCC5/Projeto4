import { BookOpenText, BookX, DatabaseZap, FlaskConical, MessageSquarePlus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { parseBlocks, renderInline } from '@/components/content/MarkdownViewer';
import { EmptyState } from '@/components/feedback/States';
import { Pill } from '@/features/academic/components';
import { QueryFailure } from '@/features/support/student/components';
import { isKnowledgeDisabled, isKnowledgeUnavailable } from '@/features/support/student/knowledge';
import { normalizeText } from '@/features/support/student/utils';
import { isApiError } from '@/services/api/client';
import type { KnowledgeArticleSummary } from '@/types/api';

const OPEN_TICKET = (
  <ButtonLink to="/aluno/chamados/novo" icon={MessageSquarePlus}>
    Abrir chamado
  </ButtonLink>
);

/** Base de conhecimento desligada (403 feature_disabled), sem banco (503) ou erro comum (com nova tentativa). */
export function HelpFailure({ error, onRetry, title, notFound }: { error: unknown; onRetry: () => void; title: string; notFound?: ReactNode }) {
  if (isKnowledgeDisabled(error)) {
    return <EmptyState icon={BookX} title="Central de ajuda desativada" description="A base de conhecimento está desligada neste ambiente. Para tirar uma dúvida, abra um chamado para o ASA." action={OPEN_TICKET} />;
  }
  if (isKnowledgeUnavailable(error)) {
    return (
      <EmptyState
        icon={DatabaseZap}
        title="Central de ajuda indisponível neste ambiente"
        description={isApiError(error) && error.message ? error.message : 'A base de conhecimento não está disponível agora.'}
        action={OPEN_TICKET}
      />
    );
  }
  return <QueryFailure error={error} onRetry={onRetry} title={title} notFound={notFound} />;
}

/**
 * Corpo do artigo (markdown restrito, sem HTML bruto). Listas numeradas viram o passo a passo com marcadores;
 * o primeiro parágrafo é omitido quando só repete o resumo já mostrado no topo.
 */
export function ArticleBody({ body, summary }: { body: string; summary: string }) {
  const blocks = parseBlocks(body);
  const first = blocks[0];
  const repeatsSummary = blocks.length > 1 && first?.type === 'p' && normalizeText(first.text) === normalizeText(summary);
  const shown = repeatsSummary ? blocks.slice(1) : blocks;
  return (
    <div className="flex flex-col gap-3 text-body text-ink">
      {shown.map((block, index) => {
        switch (block.type) {
          case 'h2':
            return (
              <h2 key={index} className="text-h3 font-semibold text-ink">
                {renderInline(block.text)}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={index} className="text-h4 font-semibold text-ink">
                {renderInline(block.text)}
              </h3>
            );
          case 'ol':
            return (
              <ol key={index} className="flex flex-col gap-3">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="flex items-start gap-3">
                    <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-snow text-small text-ink">
                      {itemIndex + 1}
                    </span>
                    <span className="min-w-0 pt-0.5 wrap-break-word">{renderInline(item)}</span>
                  </li>
                ))}
              </ol>
            );
          case 'ul':
            return (
              <ul key={index} className="flex list-disc flex-col gap-1 pl-5">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="wrap-break-word">
                    {renderInline(item)}
                  </li>
                ))}
              </ul>
            );
          default:
            return (
              <p key={index} className="wrap-break-word leading-relaxed">
                {renderInline(block.text)}
              </p>
            );
        }
      })}
    </div>
  );
}

export const articleCount = (count: number): string => (count === 1 ? '1 artigo' : `${count} artigos`);

/**
 * Artigos numa lista com divisórias. O título quebra a linha (nunca é cortado: numa central de ajuda ele é a
 * informação principal); resumo ou trecho encontrado logo abaixo.
 */
export function ArticleLinkList({
  label,
  articles,
  details = 'summary',
  showCategory = false,
  showDemo = false,
}: {
  label: string;
  articles: Array<KnowledgeArticleSummary & { excerpt?: string }>;
  details?: 'summary' | 'excerpt' | 'none';
  showCategory?: boolean;
  showDemo?: boolean;
}) {
  return (
    <ul aria-label={label} className="divide-y divide-line-soft overflow-hidden rounded-lg border border-line bg-white">
      {articles.map((article) => {
        const description = details === 'none' ? null : details === 'excerpt' && article.excerpt ? article.excerpt : article.summary;
        return (
          <li key={article.id}>
            <Link to={`/aluno/ajuda/${encodeURIComponent(article.slug)}`} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-paper focus-visible:bg-paper">
              <BookOpenText size={20} aria-hidden className="mt-0.5 shrink-0 text-slate" />
              <span className="min-w-0 flex-1">
                <span className="block wrap-break-word text-body font-medium text-ink">{article.title}</span>
                {description ? <span className="mt-0.5 line-clamp-2 wrap-break-word text-small text-slate">{description}</span> : null}
                {showCategory && article.categoryLabel ? <span className="mt-1 block text-caption text-mist">{article.categoryLabel}</span> : null}
              </span>
              {showDemo && article.isDemo ? (
                <Pill tone="warning" icon={FlaskConical} className="shrink-0">
                  Demonstração
                </Pill>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
