import { Copy, Info } from 'lucide-react';
import { useState } from 'react';
import { MarkdownViewer } from '@/components/content/MarkdownViewer';
import { IconButton } from '@/components/ui/Button';
import { Badge, List, ListItem } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { SegmentedControl } from '@/features/support/staff/components';
import { formatDateTime } from '@/lib/format';
import type { KnowledgeArticleStatus, KnowledgeAudience, KnowledgeManageArticle } from '@/types/api';
import { studentArticlePath } from './api';
import { helpCenterSteps } from './preview';

const isHttps = (value: string | null | undefined): value is string => Boolean(value && /^https:\/\/[^\s]+$/i.test(value));

export interface PreviewContent {
  title: string;
  summary: string;
  body: string;
  sourceLabel: string | null;
  sourceUrl: string | null;
  categoryLabel: string | null;
}

/**
 * Prévia do artigo como o aluno vê: o texto completo (Markdown restrito, o mesmo leitor seguro do portal)
 * ou o passo a passo que a Central de ajuda e o assistente montam a partir do texto.
 */
export function ArticlePreview({ content, label = 'Prévia' }: { content: PreviewContent; label?: string }) {
  const [view, setView] = useState<'full' | 'steps'>('full');
  const steps = helpCenterSteps(content.body, content.summary);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SegmentedControl
        label={`${label}: modo de visualização`}
        value={view}
        onChange={setView}
        options={[
          { value: 'full', label: 'Artigo completo' },
          { value: 'steps', label: 'Passo a passo' },
        ]}
      />
      <article className="flex min-w-0 flex-col gap-3 break-words">
        <header>
          {content.categoryLabel ? <p className="text-caption text-slate">{content.categoryLabel}</p> : null}
          <h3 className="text-h2 font-bold text-ink">{content.title.trim() || 'Sem título'}</h3>
          {content.summary.trim() ? <p className="mt-1 text-body text-slate">{content.summary.trim()}</p> : null}
        </header>
        {view === 'full' ? (
          content.body.trim() ? (
            <MarkdownViewer source={content.body} />
          ) : (
            <p className="text-small text-slate">O texto do artigo aparece aqui.</p>
          )
        ) : (
          <>
            <p className="flex items-start gap-2 text-caption text-slate">
              <Info size={20} aria-hidden className="shrink-0" />
              Como a Central de ajuda e o assistente mostram o artigo: itens de lista viram passos (até 12); sem lista, os parágrafos (até 6).
            </p>
            {steps.length > 0 ? (
              <ol className="flex flex-col gap-3">
                {steps.map((step, index) => (
                  <li key={`${index}-${step}`} className="flex items-start gap-3">
                    <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-snow text-small font-semibold text-ink">
                      {index + 1}
                    </span>
                    <span className="min-w-0 pt-0.5 text-body text-ink">{step}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-small text-slate">Sem passos: a Central de ajuda mostra só o resumo.</p>
            )}
          </>
        )}
        {content.sourceLabel || content.sourceUrl ? (
          <p className="text-small text-slate">
            Fonte:{' '}
            {isHttps(content.sourceUrl) ? (
              <a href={content.sourceUrl} target="_blank" rel="noopener noreferrer" className="break-all text-action underline underline-offset-2 hover:no-underline">
                {content.sourceLabel || content.sourceUrl}
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            ) : (
              (content.sourceLabel ?? content.sourceUrl)
            )}
          </p>
        ) : null}
      </article>
    </div>
  );
}

/** O que o editor aceita (o mesmo Markdown restrito do leitor: nada de HTML). */
export function MarkdownHelp() {
  const rows: Array<[string, string]> = [
    ['## Título', 'título de seção (### para subtítulo)'],
    ['- item ou 1. item', 'lista (cada item vira um passo)'],
    ['**negrito** · *itálico*', 'ênfase'],
    ['`código`', 'termo técnico, protocolo'],
    ['[texto](https://…)', 'link (somente https)'],
  ];
  return (
    <details className="rounded-md border border-line bg-white px-3 py-2 text-small text-slate">
      <summary className="cursor-pointer text-ink">Formatação aceita</summary>
      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        {rows.map(([syntax, meaning]) => (
          <div key={syntax} className="contents">
            <dt className="font-mono text-caption text-ink">{syntax}</dt>
            <dd className="text-caption text-slate">{meaning}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-caption text-slate">HTML e imagens não são exibidos. Linha em branco separa parágrafos.</p>
    </details>
  );
}

/**
 * Endereço do artigo na Central de ajuda do aluno. A equipe e a administração não abrem a área do aluno,
 * então o endereço é para copiar e enviar; aqui fica a prévia.
 */
export function StudentAddress({ slug, audience, status, categoryId }: { slug: string; audience: KnowledgeAudience; status: KnowledgeArticleStatus; categoryId: string | null }) {
  const toast = useToast();
  if (audience !== 'student') {
    return <p className="text-small text-slate">Artigo interno: só a equipe vê. Não aparece para alunos nem é usado pelo assistente.</p>;
  }
  const path = studentArticlePath(slug);
  const copy = () => {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;
    if (!clipboard) {
      toast.show('Não foi possível copiar. Selecione o endereço e copie manualmente.', 'error');
      return;
    }
    clipboard.writeText(url).then(
      () => toast.show('Endereço copiado.'),
      () => toast.show('Não foi possível copiar. Selecione o endereço e copie manualmente.', 'error'),
    );
  };
  const visible = status === 'published' && Boolean(categoryId);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <code className="min-w-0 flex-1 break-all rounded-xs bg-snow px-2 py-1 font-mono text-small text-ink">{path}</code>
        <IconButton size="sm" icon={Copy} label="Copiar endereço para alunos" onClick={copy} />
      </div>
      <p className="text-caption text-slate">
        {visible
          ? 'Abre só para alunos (a equipe vê a prévia aqui). A Central de ajuda mostra a versão publicada.'
          : status !== 'published'
            ? 'Só aparece para alunos depois de publicado.'
            : 'Publicado, mas sem categoria: não aparece na lista da Central de ajuda (o assistente ainda pode usá-lo).'}
      </p>
    </div>
  );
}

/** Histórico de versões (imutáveis): quem salvou, quando e a nota da alteração. */
export function VersionHistory({ article }: { article: KnowledgeManageArticle }) {
  return (
    <List label="Versões do artigo">
      {article.versions.map((version) => (
        <ListItem
          key={version.version}
          title={
            <span className="flex flex-wrap items-center gap-2">
              Versão {version.version}
              {version.version === article.currentVersion ? <Badge tone="info">Atual</Badge> : null}
              {version.version === article.publishedVersion ? <Badge tone="success">Publicada</Badge> : null}
            </span>
          }
          description={version.changeNote ?? 'Sem nota de alteração.'}
          meta={
            <>
              {version.createdBy ?? 'Autor não registrado'} · <time dateTime={version.createdAt}>{formatDateTime(version.createdAt)}</time>
            </>
          }
        />
      ))}
    </List>
  );
}
