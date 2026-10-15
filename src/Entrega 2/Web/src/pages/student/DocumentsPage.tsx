import { useQueries, useQuery } from '@tanstack/react-query';
import { BookOpenText, FilePlus2, RefreshCw } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { List, ListItem, PageHeader, SectionHeader, Surface } from '@/components/ui/Display';
import { AccessDenied, LoadingRows } from '@/components/feedback/States';
import { AttachmentList } from '@/features/support/components/Attachments';
import { StatusBadge } from '@/features/support/labels';
import { CategoryGlyph, DemoContentNote, QueryFailure } from '@/features/support/student/components';
import { useSupportCatalog } from '@/features/support/student/hooks';
import { supportKeys } from '@/features/support/student/keys';
import { businessDays, isForbidden } from '@/features/support/student/utils';
import { formatDateTime, formatRelative } from '@/lib/format';
import { supportApi } from '@/services/api/endpoints';
import type { SupportTicketSummary } from '@/types/api';

const DOCUMENTS = 'documents';
const LIST_LIMIT = 50;
/** pedidos cujos arquivos são buscados (cada um é um GET do detalhe) */
const FILES_FROM = 10;
const NEW_REQUEST = `/aluno/chamados/novo?categoria=${DOCUMENTS}`;

function SentFiles({ tickets }: { tickets: SupportTicketSummary[] }) {
  const recent = tickets.slice(0, FILES_FROM);
  const details = useQueries({ queries: recent.map((ticket) => ({ queryKey: supportKeys.ticket(ticket.id), queryFn: () => supportApi.get(ticket.id) })) });
  if (recent.length === 0) return <p className="text-small text-slate">Quando o ASA enviar um documento pelo chamado, ele aparece aqui para baixar.</p>;
  if (details.some((query) => query.isPending)) return <LoadingRows rows={2} />;
  const failed = details.filter((query) => query.isError);
  const groups = details
    .map((query) => query.data)
    .filter((ticket) => ticket !== undefined)
    .map((ticket) => ({ ticket, files: ticket.attachments.filter((attachment) => attachment.uploadedBy === 'agent') }))
    .filter((group) => group.files.length > 0);
  return (
    <div className="flex flex-col gap-4">
      {groups.length === 0 && failed.length === 0 ? <p className="text-small text-slate">Nenhum arquivo enviado pelo ASA ainda. Quando o documento ficar pronto, ele aparece aqui e no chamado.</p> : null}
      {groups.map(({ ticket, files }) => (
        <section key={ticket.id} aria-label={`Arquivos de ${ticket.subject}`} className="flex flex-col gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-h4 font-semibold text-ink">{ticket.subcategoryLabel ?? ticket.subject}</h3>
            <p className="text-caption text-mist">
              <span className="font-mono">{ticket.protocol}</span> · {ticket.subject}
            </p>
          </div>
          <AttachmentList attachments={files} getLink={(attachmentId) => supportApi.attachmentLink(ticket.id, attachmentId)} ownLabel="Você" />
        </section>
      ))}
      {failed.length > 0 ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-snow px-3 py-2 text-small text-slate">
          <span>{failed.length === 1 ? 'Não foi possível verificar os arquivos de 1 pedido.' : `Não foi possível verificar os arquivos de ${failed.length} pedidos.`}</span>
          <Button size="sm" icon={RefreshCw} onClick={() => failed.forEach((query) => void query.refetch())}>
            Tentar novamente
          </Button>
        </div>
      ) : null}
      {tickets.length > FILES_FROM ? <p className="text-caption text-mist">Mostrando arquivos dos {FILES_FROM} pedidos mais recentes. Os demais ficam no próprio chamado.</p> : null}
    </div>
  );
}

/** Documentos: como pedir (chamado da categoria Documentos), pedidos feitos e arquivos enviados pelo ASA. */
export default function DocumentsPage() {
  const catalog = useSupportCatalog();
  const list = useQuery({ queryKey: supportKeys.documents, queryFn: () => supportApi.list({ limit: LIST_LIMIT }) });

  if (list.error && isForbidden(list.error)) return <AccessDenied />;

  const category = catalog.data?.categories.find((item) => item.id === DOCUMENTS);
  const articles = catalog.data?.articles.filter((article) => article.categoryId === DOCUMENTS) ?? [];
  const tickets = list.data?.items.filter((ticket) => ticket.categoryId === DOCUMENTS) ?? [];

  return (
    <>
      <PageHeader
        title="Documentos"
        description="Declarações, histórico escolar, certificados e diploma são pedidos por um chamado da categoria Documentos. Você acompanha o pedido e baixa o arquivo por aqui."
        actions={
          <ButtonLink to={NEW_REQUEST} variant="primary" icon={FilePlus2}>
            Solicitar documento
          </ButtonLink>
        }
      />
      <div className="flex flex-col gap-6">
        <Surface aria-labelledby="como-pedir">
          <SectionHeader id="como-pedir" title="Como pedir um documento" />
          {catalog.isPending ? (
            <LoadingRows rows={2} />
          ) : catalog.error ? (
            <QueryFailure error={catalog.error} onRetry={() => void catalog.refetch()} title="Orientações indisponíveis" />
          ) : (
            <ol className="flex flex-col gap-3">
              {[
                category && category.subcategories.length > 0
                  ? `Abra um chamado em Documentos e escolha o tipo: ${category.subcategories.map((item) => item.label.toLowerCase()).join(', ')}.`
                  : 'Abra um chamado em Documentos e conte qual documento você precisa e para quê.',
                category
                  ? `O ASA faz a triagem e encaminha para ${category.defaultTeam}. Prazo de resposta: até ${businessDays(category.slaBusinessDays)}.`
                  : 'O ASA faz a triagem e encaminha para a equipe responsável.',
                'Quando o documento ficar pronto, o arquivo chega pelo chamado e também aparece abaixo, em “Arquivos enviados pelo ASA”.',
              ].map((text, index) => (
                <li key={text} className="flex items-start gap-3">
                  <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-snow text-caption font-semibold text-ink">
                    {index + 1}
                  </span>
                  <span className="min-w-0 text-body text-ink">{text}</span>
                </li>
              ))}
            </ol>
          )}
        </Surface>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Surface aria-labelledby="meus-pedidos">
            <SectionHeader id="meus-pedidos" title="Meus pedidos de documentos" />
            {list.isPending ? (
              <LoadingRows rows={3} />
            ) : list.error ? (
              <QueryFailure error={list.error} onRetry={() => void list.refetch()} title="Não foi possível carregar seus pedidos" />
            ) : tickets.length === 0 ? (
              <p className="text-small text-slate">Você ainda não pediu documentos. Use “Solicitar documento” para começar.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <List label="Pedidos de documentos">
                  {tickets.map((ticket) => (
                    <ListItem
                      key={ticket.id}
                      to={`/aluno/chamados/${encodeURIComponent(ticket.id)}`}
                      leading={<CategoryGlyph categoryId={DOCUMENTS} />}
                      unread={ticket.unreadCount > 0}
                      title={ticket.subject}
                      description={
                        <span>
                          <span className="font-mono text-ink">{ticket.protocol}</span>
                          {ticket.subcategoryLabel ? ` · ${ticket.subcategoryLabel}` : ''}
                        </span>
                      }
                      meta={
                        <span className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={ticket.status} />
                          <span title={formatDateTime(ticket.createdAt)}>Pedido {formatRelative(ticket.createdAt)}</span>
                        </span>
                      }
                    />
                  ))}
                </List>
                {list.data.nextCursor ? <p className="text-caption text-mist">Pedidos entre os seus {LIST_LIMIT} chamados mais recentes. Os mais antigos estão em Meus chamados.</p> : null}
              </div>
            )}
          </Surface>

          <Surface aria-labelledby="arquivos-asa">
            <SectionHeader id="arquivos-asa" title="Arquivos enviados pelo ASA" description="Links de download temporários, gerados na hora." />
            {list.isPending ? <LoadingRows rows={2} /> : list.error ? <p className="text-small text-slate">Disponível quando seus pedidos carregarem.</p> : <SentFiles tickets={tickets} />}
          </Surface>
        </div>

        <Surface aria-labelledby="duvidas-documentos">
          <SectionHeader id="duvidas-documentos" title="Dúvidas sobre documentos" action={<ButtonLink to="/aluno/ajuda" variant="ghost" size="sm">Central de ajuda</ButtonLink>} />
          {catalog.isPending ? (
            <LoadingRows rows={2} />
          ) : catalog.error ? (
            <p className="text-small text-slate">Artigos indisponíveis no momento.</p>
          ) : articles.length === 0 ? (
            <p className="text-small text-slate">Nenhum artigo sobre documentos por enquanto.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <List label="Artigos sobre documentos">
                {articles.map((article) => (
                  <ListItem key={article.id} to={`/aluno/ajuda/${encodeURIComponent(article.id)}`} leading={<BookOpenText size={20} aria-hidden />} title={article.title} description={article.summary} />
                ))}
              </List>
              <DemoContentNote />
            </div>
          )}
        </Surface>
      </div>
    </>
  );
}
