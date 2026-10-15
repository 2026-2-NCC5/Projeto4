import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Archive, Save } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router';
import { Button, ButtonLink } from '@/components/ui/Button';
import { PageHeader, Surface } from '@/components/ui/Display';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Select, TextArea, TextInput } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { AccessDenied, EmptyState, LoadingRows } from '@/components/feedback/States';
import { useSession } from '@/features/auth/session';
import { useInsightsArea } from '@/features/insights/area';
import { InsightsFailure, PanelHeader } from '@/features/insights/components';
import { isArticleChanged, isSlugTaken, KB_LIMITS, knowledgeKeys } from '@/features/knowledge/api';
import { ArticlePreview, MarkdownHelp } from '@/features/knowledge/components';
import { draftFromArticle, draftToInput, EMPTY_DRAFT, FIELD_LABELS, sameDraft, validateDraft, type ArticleDraft, type DraftErrors, type DraftField } from '@/features/knowledge/draft';
import { useCreateArticle, useKnowledgeArticle, useUpdateArticle } from '@/features/knowledge/hooks';
import { AUDIENCE_LABELS } from '@/features/knowledge/labels';
import { SegmentedControl } from '@/features/support/staff/components';
import { BackLink } from '@/features/support/student/components';
import { useSupportCatalog } from '@/features/support/staff/hooks';
import { cn } from '@/lib/cn';
import { formatDateTime, formatNumber } from '@/lib/format';
import { isApiError, messageForError } from '@/services/api/client';
import type { KnowledgeManageArticle } from '@/types/api';

const count = (value: string, max: number) => `${formatNumber(value.trim().length)} de ${formatNumber(max)} caracteres`;

/** O que acontece ao salvar, conforme a situação atual (regras de knowledge/service.ts). */
function saveEffect(article: KnowledgeManageArticle): string {
  const next = article.currentVersion + 1;
  if (article.status === 'published') return `Salvar cria a versão ${next}. Os alunos continuam vendo a versão ${article.publishedVersion ?? article.currentVersion} até você publicar de novo.`;
  if (article.status === 'in_review') return `Salvar cria a versão ${next} e o artigo volta para rascunho: depois, envie para revisão de novo.`;
  return `Salvar cria a versão ${next}. O artigo continua como rascunho.`;
}

function ConflictBanner({
  latest,
  baseVersion,
  onDiscard,
  onKeepMine,
  saving,
  focusRef,
}: {
  latest: KnowledgeManageArticle | undefined;
  baseVersion: number;
  onDiscard: () => void;
  onKeepMine: () => void;
  saving: boolean;
  focusRef: RefObject<HTMLDivElement | null>;
}) {
  const newer = latest && latest.currentVersion !== baseVersion ? latest : null;
  return (
    <div ref={focusRef} tabIndex={-1} role="alert" className="mb-4 flex scroll-mt-4 items-start gap-3 rounded-md border border-warning/40 bg-warning-soft px-4 py-3 text-small text-warning-text">
      <AlertTriangle size={20} aria-hidden className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Outra pessoa salvou este artigo enquanto você editava.</p>
        <p className="mt-1">
          {newer
            ? `Agora ele está na versão ${newer.currentVersion}, salva ${newer.current.createdBy ? `por ${newer.current.createdBy} ` : ''}em ${formatDateTime(newer.current.createdAt)}${newer.current.changeNote ? ` ("${newer.current.changeNote}")` : ''}. Você começou a partir da versão ${baseVersion}.`
            : 'Estamos carregando a versão mais nova.'}{' '}
          Suas alterações continuam aqui e ainda não foram salvas. Compare na prévia antes de decidir.
        </p>
        {newer ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={onDiscard} disabled={saving}>
              Descartar as minhas e carregar a versão {newer.currentVersion}
            </Button>
            <Button size="sm" variant="primary" onClick={onKeepMine} loading={saving}>
              Salvar a minha como versão nova
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ArticleForm({ mode, article, onDiscard }: { mode: 'create' | 'edit'; article?: KnowledgeManageArticle; onDiscard?: () => void }) {
  const navigate = useNavigate();
  const { to } = useInsightsArea();
  const toast = useToast();
  const queryClient = useQueryClient();
  const catalog = useSupportCatalog();
  const create = useCreateArticle();
  const update = useUpdateArticle(article?.id ?? '');
  const [initial] = useState<ArticleDraft>(() => (article ? draftFromArticle(article) : EMPTY_DRAFT));
  const [draft, setDraft] = useState<ArticleDraft>(initial);
  const [baseVersion] = useState(article?.currentVersion ?? 0);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [panel, setPanel] = useState<'write' | 'preview'>('write');
  // 409 vindo do próprio salvamento: leva o foco (e a rolagem) ao aviso, que fica no topo da página
  const conflictRef = useRef<HTMLDivElement>(null);
  const [conflictSignal, setConflictSignal] = useState(0);
  const [previewOf, setPreviewOf] = useState<'mine' | 'latest'>('mine');
  const saving = create.isPending || update.isPending;
  const dirty = !sameDraft(draft, initial);
  const stale = mode === 'edit' && article !== undefined && article.currentVersion !== baseVersion;
  const showConflict = conflict || stale;

  // depois de salvar, a navegação acontece sem o aviso de alterações não salvas
  const blocker = useBlocker(dirty && savedTo === null);
  useEffect(() => {
    if (savedTo) navigate(savedTo);
  }, [savedTo, navigate]);
  useEffect(() => {
    if (conflictSignal > 0) conflictRef.current?.focus();
  }, [conflictSignal]);
  useEffect(() => {
    if (!dirty || savedTo) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, savedTo]);

  const set = (field: DraftField) => (value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const fail = (error: unknown) => {
    if (isArticleChanged(error)) {
      setConflict(true);
      setFormError(null);
      setPanel('write');
      setConflictSignal((value) => value + 1);
      void queryClient.invalidateQueries({ queryKey: knowledgeKeys.article(article?.id ?? '') });
      return;
    }
    if (isSlugTaken(error)) {
      setErrors((current) => ({
        ...current,
        slug: draft.slug.trim() ? 'Já existe um artigo com este endereço. Escolha outro.' : 'Já existe um artigo com o endereço gerado a partir deste título. Escreva um endereço diferente.',
      }));
      setFormError('Confira o endereço (slug) do artigo.');
      return;
    }
    if (isApiError(error) && error.kind === 'validation' && error.details.length > 0) {
      const fromServer: DraftErrors = {};
      for (const detail of error.details) if (detail.field in FIELD_LABELS) fromServer[detail.field as DraftField] = `${FIELD_LABELS[detail.field as DraftField]}: ${detail.message}`;
      setErrors((current) => ({ ...current, ...fromServer }));
      setFormError(Object.keys(fromServer).length > 0 ? 'Confira os campos destacados.' : error.message);
      return;
    }
    setFormError(messageForError(error, 'Não foi possível salvar o artigo. Tente novamente.'));
  };

  const save = (expectedVersion: number) => {
    const found = validateDraft(draft, mode);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormError(`Confira: ${(Object.keys(found) as DraftField[]).map((field) => FIELD_LABELS[field]).join(', ')}.`);
      return;
    }
    setFormError(null);
    if (mode === 'create') {
      create.mutate(draftToInput(draft, 'create'), {
        onSuccess: (saved) => {
          toast.show('Rascunho criado. Ele só chega aos alunos depois de publicado.');
          setSavedTo(to(`base-conhecimento/${encodeURIComponent(saved.id)}`));
        },
        onError: fail,
      });
      return;
    }
    update.mutate(
      { ...draftToInput(draft, 'edit'), expectedVersion },
      {
        onSuccess: (saved) => {
          toast.show(`Versão ${saved.currentVersion} salva.`);
          setSavedTo(to(`base-conhecimento/${encodeURIComponent(saved.id)}`));
        },
        onError: fail,
      },
    );
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    // com conflito pendente, salvar só pelo botão explícito do aviso (decisão consciente)
    if (showConflict) {
      setFormError('Outra pessoa salvou uma versão mais nova. Use as opções do aviso acima para decidir.');
      return;
    }
    // sem alteração não há versão nova (o histórico só guarda mudanças de verdade)
    if (mode === 'edit' && !dirty) {
      setFormError(`Nada mudou desde a versão ${baseVersion}.`);
      return;
    }
    save(baseVersion);
  };

  const categoryOptions = [{ value: '', label: 'Sem categoria' }, ...(catalog.data?.categories ?? []).map((item) => ({ value: item.id, label: item.label }))];
  if (draft.categoryId && !categoryOptions.some((option) => option.value === draft.categoryId)) categoryOptions.push({ value: draft.categoryId, label: article?.categoryLabel ?? draft.categoryId });
  const categoryLabel = categoryOptions.find((option) => option.value === draft.categoryId && option.value !== '')?.label ?? null;
  const cancelTo = article ? to(`base-conhecimento/${encodeURIComponent(article.id)}`) : to('base-conhecimento');
  const latest = stale && article ? article : null;
  const previewContent =
    latest && previewOf === 'latest'
      ? { title: latest.current.title, summary: latest.current.summary, body: latest.current.body, sourceLabel: latest.current.sourceLabel, sourceUrl: latest.current.sourceUrl, categoryLabel: latest.categoryLabel }
      : { title: draft.title, summary: draft.summary, body: draft.body, sourceLabel: draft.sourceLabel.trim() || null, sourceUrl: draft.sourceUrl.trim() || null, categoryLabel };

  return (
    <>
      <PageHeader
        eyebrow={<BackLink to={cancelTo}>{article ? 'Voltar ao artigo' : 'Base de conhecimento'}</BackLink>}
        title={mode === 'create' ? 'Novo artigo' : `Editar: ${article?.current.title ?? ''}`}
        description={
          mode === 'create'
            ? 'O artigo nasce como rascunho (versão 1). Alunos e o assistente só o veem depois de publicado.'
            : article
              ? saveEffect(article)
              : undefined
        }
      />
      {showConflict ? (
        <ConflictBanner
          focusRef={conflictRef}
          latest={article}
          baseVersion={baseVersion}
          saving={saving}
          onDiscard={() => onDiscard?.()}
          onKeepMine={() => {
            if (!article) return;
            setConflict(false);
            save(article.currentVersion);
          }}
        />
      ) : null}
      <div className="mb-4 lg:hidden">
        <SegmentedControl
          label="Editor"
          value={panel}
          onChange={setPanel}
          options={[
            { value: 'write', label: 'Escrever' },
            { value: 'preview', label: 'Prévia' },
          ]}
        />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form noValidate onSubmit={onSubmit} aria-label={mode === 'create' ? 'Novo artigo' : 'Editar artigo'} className={cn('min-w-0', panel === 'write' ? 'block' : 'hidden lg:block')}>
          <Surface as="div" className="flex flex-col gap-5">
            <TextInput label="Título" required value={draft.title} onChange={(event) => set('title')(event.target.value)} maxLength={KB_LIMITS.title.max} error={errors.title} hint={count(draft.title, KB_LIMITS.title.max)} />
            <TextArea
              label="Resumo"
              required
              rows={3}
              value={draft.summary}
              onChange={(event) => set('summary')(event.target.value)}
              maxLength={KB_LIMITS.summary.max}
              error={errors.summary}
              hint={`Uma ou duas frases: aparecem na lista da Central de ajuda e abrem a resposta do assistente. ${count(draft.summary, KB_LIMITS.summary.max)}.`}
            />
            <div className="flex flex-col gap-2">
              <TextArea
                label="Texto do artigo (Markdown)"
                required
                rows={16}
                value={draft.body}
                onChange={(event) => set('body')(event.target.value)}
                maxLength={KB_LIMITS.body.max}
                error={errors.body}
                hint={`Use listas para o passo a passo. ${count(draft.body, KB_LIMITS.body.max)}.`}
                className="font-mono text-small"
              />
              <MarkdownHelp />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Categoria"
                value={draft.categoryId}
                options={categoryOptions}
                onChange={(event) => set('categoryId')(event.target.value)}
                hint={
                  catalog.isError
                    ? 'Não foi possível carregar a lista de categorias agora. A categoria atual é mantida; recarregue a página para escolher outra.'
                    : 'Sem categoria, o artigo não aparece na lista da Central de ajuda.'
                }
              />
              <Select
                label="Público"
                value={draft.audience}
                options={[
                  { value: 'student', label: AUDIENCE_LABELS.student },
                  { value: 'staff', label: AUDIENCE_LABELS.staff },
                ]}
                onChange={(event) => set('audience')(event.target.value)}
                hint="Artigos internos não aparecem para alunos nem são usados pelo assistente."
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextInput label="Fonte" value={draft.sourceLabel} onChange={(event) => set('sourceLabel')(event.target.value)} maxLength={KB_LIMITS.sourceLabel} error={errors.sourceLabel} hint="Ex.: Regulamento de graduação, art. 12" />
              <TextInput
                label="Link da fonte"
                type="url"
                inputMode="url"
                value={draft.sourceUrl}
                onChange={(event) => set('sourceUrl')(event.target.value)}
                maxLength={KB_LIMITS.sourceUrl}
                error={errors.sourceUrl}
                hint="Opcional. Somente endereços https://"
                placeholder="https://"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextInput label="Revisar até" type="date" value={draft.reviewDueAt} onChange={(event) => set('reviewDueAt')(event.target.value)} error={errors.reviewDueAt} hint="Opcional: quando conferir se o conteúdo continua válido." />
              {mode === 'create' ? (
                <TextInput
                  label="Endereço (slug)"
                  value={draft.slug}
                  onChange={(event) => set('slug')(event.target.value.toLowerCase())}
                  maxLength={KB_LIMITS.slug}
                  error={errors.slug}
                  hint="Opcional. Vazio: geramos a partir do título. Não muda depois de criado."
                  placeholder="ex.: como-pedir-revisao-de-prova"
                />
              ) : null}
            </div>
            <TextInput
              label="Nota da alteração"
              value={draft.changeNote}
              onChange={(event) => set('changeNote')(event.target.value)}
              maxLength={KB_LIMITS.changeNote}
              error={errors.changeNote}
              hint={mode === 'create' ? 'Opcional. Aparece no histórico de versões (ex.: "Versão inicial").' : 'Opcional. Aparece no histórico de versões: o que mudou e por quê.'}
            />
            {formError ? (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-small text-danger-text">
                {formError}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft pt-4">
              <ButtonLink to={cancelTo}>Cancelar</ButtonLink>
              <Button type="submit" variant="primary" icon={Save} loading={saving}>
                {mode === 'create' ? 'Criar rascunho' : 'Salvar nova versão'}
              </Button>
            </div>
          </Surface>
        </form>
        <div className={cn('min-w-0', panel === 'preview' ? 'block' : 'hidden lg:block')}>
          <Surface aria-labelledby="editor-previa" className="lg:sticky lg:top-4">
            <PanelHeader id="editor-previa" title="Prévia para o aluno" description="Atualiza enquanto você escreve. Nada é salvo até você clicar em salvar." />
            {latest ? (
              <div className="mb-4">
                <SegmentedControl
                  label="Comparar versões"
                  value={previewOf}
                  onChange={setPreviewOf}
                  options={[
                    { value: 'mine', label: 'Minha versão' },
                    { value: 'latest', label: `Versão ${latest.currentVersion} salva` },
                  ]}
                />
              </div>
            ) : null}
            <ArticlePreview content={previewContent} />
          </Surface>
        </div>
      </div>
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Sair sem salvar?"
        description="As alterações deste artigo ainda não foram salvas e serão perdidas."
        confirmLabel="Sair sem salvar"
        tone="danger"
        onConfirm={() => blocker.proceed?.()}
        onClose={() => blocker.reset?.()}
      />
    </>
  );
}

/** Criar (/base-conhecimento/novo) ou editar (/base-conhecimento/:id/editar) um artigo. */
export default function KnowledgeEditorPage() {
  const { id } = useParams();
  const { can } = useSession();
  const { to } = useInsightsArea();
  const allowed = can('kb:read:all') && can('kb:write');
  const query = useKnowledgeArticle(id, allowed);
  // "descartar as minhas": remonta o formulário com a versão mais nova já carregada
  const [formKey, setFormKey] = useState(0);

  if (!allowed) return <AccessDenied description="Criar e editar artigos exige a permissão de escrita na base de conhecimento." />;
  if (!id) return <ArticleForm mode="create" />;
  if (query.isPending) return <LoadingRows rows={8} />;
  if (query.data === undefined) {
    return (
      <InsightsFailure
        error={query.error}
        onRetry={() => void query.refetch()}
        notFound={{ title: 'Artigo não encontrado', description: 'Ele pode ter sido removido ou o endereço está incompleto.', backTo: to('base-conhecimento'), backLabel: 'Voltar à base de conhecimento' }}
      />
    );
  }
  if (query.data.status === 'archived') {
    return (
      <EmptyState
        icon={Archive}
        title="Artigo arquivado"
        description="Restaure o artigo como rascunho antes de editar."
        action={
          <ButtonLink to={to(`base-conhecimento/${encodeURIComponent(query.data.id)}`)} size="sm">
            Abrir o artigo
          </ButtonLink>
        }
      />
    );
  }
  return <ArticleForm key={formKey} mode="edit" article={query.data} onDiscard={() => setFormKey((value) => value + 1)} />;
}
