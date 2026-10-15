import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Archive, ArchiveRestore, CheckCircle2, Pencil, Send, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { Button, ButtonLink } from '@/components/ui/Button';
import { KeyValueList, PageHeader, Surface } from '@/components/ui/Display';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { AccessDenied, LoadingRows } from '@/components/feedback/States';
import { useSession } from '@/features/auth/session';
import { useInsightsArea } from '@/features/insights/area';
import { InsightsFailure, PanelHeader } from '@/features/insights/components';
import { isInvalidTransition, isPublishBlocked, knowledgeKeys, type KnowledgeAction } from '@/features/knowledge/api';
import { ArticlePreview, StudentAddress, VersionHistory } from '@/features/knowledge/components';
import { useArticleAction, useKnowledgeArticle } from '@/features/knowledge/hooks';
import { AUDIENCE_LABELS, AudienceBadge, DemoBadge, KB_STATUS_META, KnowledgeStatusBadge, UnpublishedChangesBadge } from '@/features/knowledge/labels';
import { SegmentedControl } from '@/features/support/staff/components';
import { BackLink } from '@/features/support/student/components';
import { formatCalendarDate, formatDateTime } from '@/lib/format';
import { isApiError, messageForError } from '@/services/api/client';
import type { KnowledgeManageArticle, KnowledgeVersion } from '@/types/api';

const SUCCESS: Record<KnowledgeAction, (article: KnowledgeManageArticle) => string> = {
  submit: () => 'Artigo enviado para revisão.',
  publish: (article) =>
    `Versão ${article.publishedVersion ?? article.currentVersion} publicada. ${article.audience === 'student' ? 'Os alunos já veem esta versão.' : 'A equipe já vê esta versão (artigo interno).'}`,
  archive: () => 'Artigo arquivado.',
  restore: () => 'Artigo restaurado como rascunho.',
};

interface Notice {
  title: string;
  body: ReactNode;
}

function contentOf(article: KnowledgeManageArticle, version: KnowledgeVersion) {
  return { title: version.title, summary: version.summary, body: version.body, sourceLabel: version.sourceLabel, sourceUrl: version.sourceUrl, categoryLabel: article.categoryLabel };
}

function Details({ article }: { article: KnowledgeManageArticle }) {
  const source = article.current;
  return (
    <KeyValueList
      items={[
        { label: 'Situação', value: <KnowledgeStatusBadge status={article.status} /> },
        { label: 'Público', value: AUDIENCE_LABELS[article.audience] },
        { label: 'Categoria', value: article.categoryLabel ?? 'Sem categoria' },
        { label: 'Endereço (slug)', value: <span className="break-all font-mono text-small">{article.slug}</span> },
        { label: 'Fonte', value: source.sourceLabel ?? source.sourceUrl ?? 'Não informada' },
        { label: 'Revisar até', value: article.reviewDueAt ? formatCalendarDate(article.reviewDueAt) : 'Sem data' },
        { label: 'Última edição', value: `${article.lastEditor ?? 'Autor não registrado'} · ${formatDateTime(article.updatedAt)}` },
        { label: 'Publicado em', value: article.publishedAt ? formatDateTime(article.publishedAt) : 'Ainda não publicado' },
      ]}
    />
  );
}

/** Um artigo da base: prévia (atual ou publicada), situação, ações editoriais e histórico de versões. */
export default function KnowledgeDetailPage() {
  const { id = '' } = useParams();
  const { can } = useSession();
  const { to } = useInsightsArea();
  const allowed = can('kb:read:all');
  const query = useKnowledgeArticle(id, allowed);
  const action = useArticleAction(id);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirming, setConfirming] = useState<Exclude<KnowledgeAction, 'restore'> | null>(null);
  const [previewVersion, setPreviewVersion] = useState<'current' | 'published'>('current');
  const listHref = to('base-conhecimento');

  if (!allowed) return <AccessDenied />;

  const back = <BackLink to={listHref}>Base de conhecimento</BackLink>;

  if (query.isPending) {
    return (
      <>
        <div className="mb-4">{back}</div>
        <LoadingRows rows={6} />
      </>
    );
  }
  if (query.data === undefined) {
    return (
      <>
        <div className="mb-4">{back}</div>
        <InsightsFailure
          error={query.error}
          onRetry={() => void query.refetch()}
          notFound={{ title: 'Artigo não encontrado', description: 'Ele pode ter sido removido ou o endereço está incompleto.', backTo: listHref, backLabel: 'Voltar à base de conhecimento' }}
        />
      </>
    );
  }

  const article = query.data;
  const canWrite = can('kb:write');
  const canPublishPermission = can('kb:publish');
  const pendingChanges = article.status === 'published' && article.hasUnpublishedChanges;
  const showEdit = canWrite && article.status !== 'archived';
  const showSubmit = canWrite && (article.status === 'draft' || pendingChanges);
  const showPublish = canPublishPermission && article.status !== 'archived' && !(article.status === 'published' && !article.hasUnpublishedChanges);
  const showArchive = canPublishPermission && article.status !== 'archived';
  const showRestore = canWrite && article.status === 'archived';
  const publishBlocked = showPublish && !article.canPublish;
  const comparing = pendingChanges && article.published !== null;
  const shown = comparing && previewVersion === 'published' && article.published ? article.published : article.current;

  const run = (kind: KnowledgeAction) => {
    setNotice(null);
    action.mutate(kind, {
      onSuccess: (data) => {
        setConfirming(null);
        toast.show(SUCCESS[kind](data));
      },
      onError: (error) => {
        setConfirming(null);
        if (isPublishBlocked(error)) {
          setNotice({
            title: 'Publicação bloqueada',
            body: (
              <>
                <p>{isApiError(error) ? error.message : 'O servidor não permitiu publicar este artigo.'}</p>
                <p className="mt-1">
                  Quando a política da base exige uma segunda pessoa, quem fez a última edição não pode publicar: peça a outra pessoa da equipe com permissão de publicação para revisar e
                  publicar esta versão. Recarregamos o artigo com a situação atual.
                </p>
              </>
            ),
          });
          void queryClient.invalidateQueries({ queryKey: knowledgeKeys.article(id) });
          return;
        }
        if (isInvalidTransition(error)) {
          setNotice({
            title: 'A situação do artigo mudou',
            body: <p>{isApiError(error) ? error.message : 'A ação não vale mais para este artigo.'} Recarregamos o artigo; confira antes de tentar de novo.</p>,
          });
          void queryClient.invalidateQueries({ queryKey: knowledgeKeys.article(id) });
          return;
        }
        toast.show(messageForError(error, 'Não foi possível concluir a ação.'), 'error');
      },
    });
  };

  const confirmCopy: Record<Exclude<KnowledgeAction, 'restore'>, { title: string; description: string; label: string; tone: 'primary' | 'danger' }> = {
    submit: {
      title: 'Enviar para revisão?',
      description: pendingChanges
        ? `A versão ${article.publishedVersion ?? ''} publicada continua na Central de ajuda e no assistente enquanto as alterações estão em revisão. Elas só aparecem para os alunos quando a nova versão for publicada.`
        : 'O artigo fica aguardando revisão e publicação. Alunos ainda não o veem.',
      label: 'Enviar para revisão',
      tone: 'primary',
    },
    publish: {
      title: `Publicar a versão ${article.currentVersion}?`,
      description:
        article.audience === 'student'
          ? 'Os alunos passam a ver esta versão na Central de ajuda e o assistente passa a usá-la nas respostas, citando o artigo como fonte.'
          : 'A equipe passa a ver esta versão. Artigos internos não aparecem para alunos nem são usados pelo assistente.',
      label: 'Publicar',
      tone: 'primary',
    },
    archive: {
      title: 'Arquivar artigo?',
      description: 'Ele sai da Central de ajuda e o assistente deixa de usá-lo. Dá para restaurar depois como rascunho, mas será preciso publicar de novo.',
      label: 'Arquivar',
      tone: 'danger',
    },
  };
  const dialog = confirming ? confirmCopy[confirming] : null;

  return (
    <>
      <PageHeader
        eyebrow={back}
        title={article.current.title}
        description={
          <span className="flex flex-col gap-2">
            <span className="flex flex-wrap items-center gap-2">
              <KnowledgeStatusBadge status={article.status} />
              {article.hasUnpublishedChanges ? <UnpublishedChangesBadge /> : null}
              {article.isDemo ? <DemoBadge /> : null}
              <AudienceBadge audience={article.audience} />
            </span>
            <span>
              {KB_STATUS_META[article.status].description}
              {pendingChanges ? ` Os alunos veem a versão ${article.publishedVersion}; a versão ${article.currentVersion} ainda não foi publicada.` : ''}
            </span>
          </span>
        }
        actions={
          <>
            {showEdit ? (
              <ButtonLink to={to(`base-conhecimento/${encodeURIComponent(article.id)}/editar`)} icon={Pencil}>
                Editar
              </ButtonLink>
            ) : null}
            {showSubmit ? (
              <Button icon={Send} onClick={() => setConfirming('submit')} disabled={action.isPending}>
                Enviar para revisão
              </Button>
            ) : null}
            {showPublish ? (
              <Button
                variant="primary"
                icon={CheckCircle2}
                onClick={() => setConfirming('publish')}
                disabled={publishBlocked || action.isPending}
                aria-describedby={publishBlocked ? 'motivo-publicacao' : undefined}
              >
                Publicar
              </Button>
            ) : null}
            {showRestore ? (
              <Button variant="primary" icon={ArchiveRestore} onClick={() => run('restore')} loading={action.isPending && action.variables === 'restore'}>
                Restaurar como rascunho
              </Button>
            ) : null}
            {showArchive ? (
              <Button variant="danger" icon={Archive} onClick={() => setConfirming('archive')} disabled={action.isPending}>
                Arquivar
              </Button>
            ) : null}
          </>
        }
      />
      {publishBlocked && article.publishBlockedReason ? (
        <p id="motivo-publicacao" className="-mt-3 mb-4 flex items-start gap-2 text-small text-slate">
          <AlertTriangle size={20} aria-hidden className="mt-px shrink-0 text-warning" />
          <span>
            <span className="text-ink">Publicar indisponível:</span> {article.publishBlockedReason}
          </span>
        </p>
      ) : null}
      {notice ? (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-md border border-warning/40 bg-warning-soft px-4 py-3 text-small text-warning-text">
          <AlertTriangle size={20} aria-hidden className="mt-px shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{notice.title}</p>
            <div className="mt-1">{notice.body}</div>
          </div>
          <button type="button" aria-label="Fechar aviso" className="rounded-sm p-0.5 hover:text-ink" onClick={() => setNotice(null)}>
            <X size={18} aria-hidden />
          </button>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Surface aria-labelledby="kb-previa" className="min-w-0 lg:self-start">
          <PanelHeader id="kb-previa" title="Prévia para o aluno" description={`Versão ${shown.version} · salva em ${formatDateTime(shown.createdAt)}${shown.createdBy ? ` por ${shown.createdBy}` : ''}`} />
          {comparing ? (
            <div className="mb-4">
              <SegmentedControl
                label="Versão exibida na prévia"
                value={previewVersion}
                onChange={setPreviewVersion}
                options={[
                  { value: 'current', label: `Atual (v${article.currentVersion})` },
                  { value: 'published', label: `Publicada (v${article.publishedVersion})` },
                ]}
              />
            </div>
          ) : null}
          <ArticlePreview key={shown.version} content={contentOf(article, shown)} />
        </Surface>
        <div className="flex min-w-0 flex-col gap-6">
          <Surface aria-labelledby="kb-detalhes">
            <PanelHeader id="kb-detalhes" title="Detalhes" />
            <Details article={article} />
          </Surface>
          <Surface aria-labelledby="kb-endereco">
            <PanelHeader id="kb-endereco" title="Para alunos" />
            <StudentAddress slug={article.slug} audience={article.audience} status={article.status} categoryId={article.categoryId} />
          </Surface>
          <Surface aria-labelledby="kb-versoes">
            <PanelHeader id="kb-versoes" title="Histórico de versões" description="Cada salvamento cria uma versão nova; as anteriores não mudam." />
            <VersionHistory article={article} />
          </Surface>
        </div>
      </div>
      <ConfirmDialog
        open={dialog !== null}
        title={dialog?.title ?? ''}
        description={dialog?.description ?? ''}
        confirmLabel={dialog?.label ?? ''}
        tone={dialog?.tone ?? 'primary'}
        loading={action.isPending}
        onConfirm={() => (confirming ? run(confirming) : undefined)}
        onClose={() => setConfirming(null)}
      />
    </>
  );
}
