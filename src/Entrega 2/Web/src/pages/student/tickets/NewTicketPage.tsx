import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Lightbulb, Paperclip, Pencil, Send, Sparkles } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { Button, ButtonLink } from '@/components/ui/Button';
import { KeyValueList, PageHeader, Surface } from '@/components/ui/Display';
import { Select, TextArea, TextInput } from '@/components/ui/Form';
import { LoadingRows } from '@/components/feedback/States';
import { readTicketDraft } from '@/features/assistant/handoff';
import { FileUploader, hasPendingUploads, uploadedIds, type PendingUpload } from '@/features/support/components/Attachments';
import { StatusBadge } from '@/features/support/labels';
import { BackLink, CategoryGlyph, DemoContentNote, lengthHint, ProtocolCopy, QueryFailure } from '@/features/support/student/components';
import { applyTicketUpdate, useSupportCatalog } from '@/features/support/student/hooks';
import { businessDays, fieldErrorsFrom, isTransientError, newClientId } from '@/features/support/student/utils';
import { cn } from '@/lib/cn';
import { formatBytes, formatDateTime } from '@/lib/format';
import { isApiError, messageForError } from '@/services/api/client';
import { supportApi } from '@/services/api/endpoints';
import type { SupportCatalog, SupportCategory, SupportTicket } from '@/types/api';

/** Arquivos por envio (constante do servidor: MAX_ATTACHMENTS_PER_SUBMISSION). */
const MAX_FILES_PER_SUBMISSION = 5;
const SUGGESTIONS = 3;

const STEPS = [
  { title: 'Solicitação', heading: 'Sobre o que é a solicitação?' },
  { title: 'Detalhes', heading: 'Conte os detalhes' },
  { title: 'Anexos', heading: 'Anexos (opcional)' },
  { title: 'Revisão', heading: 'Revise e envie' },
] as const;
type Step = 0 | 1 | 2 | 3;

interface Draft {
  categoryId: string;
  subcategoryId: string;
  subject: string;
  description: string;
}

type Errors = Partial<Record<'categoryId' | 'subcategoryId' | 'subject' | 'description' | 'attachmentIds', string>>;

/** Em que etapa cada campo vive (erros do servidor levam o aluno de volta ao lugar certo). */
const FIELD_STEP: Record<keyof Errors, Step> = { categoryId: 0, subcategoryId: 0, subject: 1, description: 1, attachmentIds: 2 };

function validate(step: Step, draft: Draft, category: SupportCategory | undefined, catalog: SupportCatalog, uploads: PendingUpload[]): Errors {
  const errors: Errors = {};
  const limits = catalog.limits;
  if (step === 0) {
    if (!category) errors.categoryId = 'Escolha o assunto da solicitação.';
    else if (category.subcategories.length > 0 && !category.subcategories.some((item) => item.id === draft.subcategoryId)) errors.subcategoryId = 'Escolha o tipo da solicitação.';
  }
  if (step === 1) {
    const subject = draft.subject.trim().length;
    const description = draft.description.trim().length;
    if (subject < limits.subjectMinLength) errors.subject = `Descreva o assunto com pelo menos ${limits.subjectMinLength} caracteres.`;
    else if (subject > limits.subjectMaxLength) errors.subject = `O assunto deve ter no máximo ${limits.subjectMaxLength} caracteres.`;
    if (description < limits.descriptionMinLength) errors.description = `Conte um pouco mais: pelo menos ${limits.descriptionMinLength} caracteres.`;
    else if (description > limits.descriptionMaxLength) errors.description = `A descrição deve ter no máximo ${limits.descriptionMaxLength} caracteres.`;
  }
  if (step === 2 && hasPendingUploads(uploads)) errors.attachmentIds = 'Aguarde o envio dos arquivos terminar.';
  return errors;
}

function StepIndicator({ step, maxStep, disabled, onSelect }: { step: Step; maxStep: Step; disabled: boolean; onSelect: (step: Step) => void }) {
  return (
    <nav aria-label="Etapas da abertura do chamado" className="mb-4">
      <p className="mb-2 text-small text-slate sm:hidden">
        Etapa {step + 1} de {STEPS.length}: <span className="font-semibold text-ink">{STEPS[step].title}</span>
      </p>
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((item, index) => {
          const state = index < step ? 'done' : index === step ? 'current' : 'upcoming';
          const reachable = !disabled && index !== step && index <= maxStep;
          const content = (
            <>
              <span aria-hidden className={cn('block h-1 w-full rounded-full transition-colors duration-200', state === 'upcoming' ? 'bg-line' : 'bg-action')} />
              <span className="mt-2 flex items-center gap-1.5 text-small">
                <span
                  aria-hidden
                  className={cn(
                    'hidden h-5 w-5 shrink-0 items-center justify-center rounded-full text-caption sm:inline-flex',
                    state === 'done' ? 'bg-action-soft text-action' : state === 'current' ? 'bg-action text-white' : 'border border-line text-mist',
                  )}
                >
                  {state === 'done' ? <Check size={12} /> : index + 1}
                </span>
                <span className={cn('sr-only sm:not-sr-only sm:truncate', state === 'current' ? 'font-semibold text-ink' : 'text-slate')}>{item.title}</span>
                <span className="sr-only">{state === 'done' ? ' (concluída)' : state === 'current' ? ' (etapa atual)' : ''}</span>
              </span>
            </>
          );
          return (
            <li key={item.title} aria-current={state === 'current' ? 'step' : undefined} className="min-w-0">
              {reachable ? (
                <button type="button" onClick={() => onSelect(index as Step)} className="block w-full rounded-sm text-left hover:opacity-80">
                  {content}
                </button>
              ) : (
                <span className="block">{content}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function CategoryStep({ catalog, draft, errors, onCategory, onSubcategory }: { catalog: SupportCatalog; draft: Draft; errors: Errors; onCategory: (id: string) => void; onSubcategory: (id: string) => void }) {
  const baseId = useId();
  const category = catalog.categories.find((item) => item.id === draft.categoryId);
  return (
    <div className="flex flex-col gap-5">
      <fieldset aria-describedby={errors.categoryId ? `${baseId}-error` : undefined}>
        <legend className="text-small font-semibold text-ink">
          Categoria<span className="text-danger-text" aria-hidden> *</span>
        </legend>
        <div className="mt-2 divide-y divide-line-soft overflow-hidden rounded-lg border border-line">
          {catalog.categories.map((item) => {
            const selected = item.id === draft.categoryId;
            return (
              <label
                key={item.id}
                className={cn(
                  'flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors duration-150 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-action',
                  selected ? 'bg-action-soft' : 'bg-white hover:bg-paper',
                )}
              >
                <input type="radio" name={`${baseId}-category`} value={item.id} checked={selected} onChange={() => onCategory(item.id)} aria-describedby={`${baseId}-${item.id}`} className="mt-1 h-4 w-4 shrink-0 accent-action" />
                <CategoryGlyph categoryId={item.id} className={cn('mt-0.5 shrink-0', selected ? 'text-action' : 'text-slate')} />
                <span className="min-w-0">
                  <span className={cn('block text-body text-ink', selected ? 'font-semibold' : 'font-medium')}>{item.label}</span>
                  <span id={`${baseId}-${item.id}`} className="block text-small text-slate">
                    {item.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        {errors.categoryId ? (
          <p id={`${baseId}-error`} role="alert" className="mt-1.5 text-caption text-danger-text">
            {errors.categoryId}
          </p>
        ) : null}
      </fieldset>
      {category && category.subcategories.length > 0 ? (
        <Select
          label="Tipo de solicitação"
          required
          placeholder="Selecione o tipo"
          value={draft.subcategoryId}
          onChange={(event) => onSubcategory(event.target.value)}
          options={category.subcategories.map((item) => ({ value: item.id, label: item.label }))}
          error={errors.subcategoryId}
          containerClassName="sm:max-w-md"
        />
      ) : null}
      {category ? (
        <p className="text-small text-slate">
          O ASA faz a triagem e encaminha para <span className="font-semibold text-ink">{category.defaultTeam}</span>. Prazo de resposta: até {businessDays(category.slaBusinessDays)}.
        </p>
      ) : null}
    </div>
  );
}

function DetailsStep({ catalog, draft, errors, onChange }: { catalog: SupportCatalog; draft: Draft; errors: Errors; onChange: (field: 'subject' | 'description', value: string) => void }) {
  const limits = catalog.limits;
  const category = catalog.categories.find((item) => item.id === draft.categoryId);
  const articles = catalog.articles.filter((article) => article.categoryId === draft.categoryId).slice(0, SUGGESTIONS);
  const headingId = useId();
  return (
    <div className="flex flex-col gap-5">
      <TextInput
        label="Assunto"
        required
        value={draft.subject}
        maxLength={limits.subjectMaxLength}
        onChange={(event) => onChange('subject', event.target.value)}
        placeholder="Ex.: Declaração de matrícula para estágio"
        hint={lengthHint(draft.subject.trim().length, limits.subjectMinLength, limits.subjectMaxLength)}
        error={errors.subject}
      />
      <TextArea
        label="Descrição"
        required
        rows={6}
        value={draft.description}
        maxLength={limits.descriptionMaxLength}
        onChange={(event) => onChange('description', event.target.value)}
        placeholder="O que aconteceu, o que você precisa e qualquer informação que ajude o ASA (disciplina, período, finalidade do documento...)."
        hint={lengthHint(draft.description.trim().length, limits.descriptionMinLength, limits.descriptionMaxLength)}
        error={errors.description}
      />
      {articles.length > 0 ? (
        <section aria-labelledby={headingId} className="rounded-lg border border-line">
          <div className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
            <Lightbulb size={20} className="shrink-0 text-slate" aria-hidden />
            <h3 id={headingId} className="text-h4 font-semibold text-ink">
              Talvez isto resolva
            </h3>
          </div>
          <p className="px-4 pt-3 text-small text-slate">Orientações rápidas{category ? ` sobre ${category.label}` : ''}. Você pode continuar com o chamado de qualquer forma.</p>
          <ul className="divide-y divide-line-soft">
            {articles.map((article) => (
              <li key={article.id}>
                <details className="group px-4 py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-sm text-body font-medium text-ink [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">{article.title}</span>
                    <ChevronDown size={18} className="shrink-0 text-slate transition-transform duration-200 group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="mt-2 text-small text-slate">{article.summary}</p>
                  {article.steps.length > 0 ? (
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-small text-ink">
                      {article.steps.map((stepText) => (
                        <li key={stepText}>{stepText}</li>
                      ))}
                    </ol>
                  ) : null}
                </details>
              </li>
            ))}
          </ul>
          <DemoContentNote className="px-4 pb-3" />
        </section>
      ) : null}
    </div>
  );
}

function ReviewSection({ title, onEdit, disabled, children }: { title: string; onEdit: () => void; disabled: boolean; children: ReactNode }) {
  return (
    <section className="border-b border-line-soft pb-4 last:border-b-0 last:pb-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-h4 font-semibold text-ink">{title}</h3>
        <Button variant="ghost" size="sm" icon={Pencil} onClick={onEdit} disabled={disabled} aria-label={`Editar ${title.toLowerCase()}`}>
          Editar
        </Button>
      </div>
      {children}
    </section>
  );
}

function SuccessView({ ticket, category }: { ticket: SupportTicket; category: SupportCategory | undefined }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const days = ticket.sla.targetBusinessDays;
  const nextTeam = category && category.defaultTeam !== ticket.assignedTeam ? category.defaultTeam : null;
  return (
    <>
      <PageHeader title="Chamado enviado" description="O ASA recebeu sua solicitação. Você recebe um aviso a cada atualização, aqui no portal e no app." />
      <Surface className="max-w-3xl">
        <div className="mb-4 flex items-center gap-2">
          <CheckCircle2 size={20} className="shrink-0 text-success" aria-hidden />
          <h2 ref={headingRef} tabIndex={-1} className="text-h3 font-semibold text-ink focus:outline-none">
            Solicitação registrada
          </h2>
        </div>
        <KeyValueList
          columns={2}
          items={[
            { label: 'Protocolo', value: <ProtocolCopy protocol={ticket.protocol} /> },
            { label: 'Situação', value: <StatusBadge status={ticket.status} /> },
            { label: 'Equipe responsável', value: nextTeam ? `${ticket.assignedTeam} (triagem), depois ${nextTeam}` : ticket.assignedTeam },
            { label: 'Prazo de resposta', value: `Até ${businessDays(days)} · previsão ${formatDateTime(ticket.sla.dueAt)}` },
          ]}
        />
        <p className="mt-4 text-small text-slate">Guarde o protocolo: ele identifica esta solicitação no ASA, no portal e no aplicativo.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <ButtonLink to={`/aluno/chamados/${encodeURIComponent(ticket.id)}`} variant="primary">
            Acompanhar chamado
          </ButtonLink>
          <ButtonLink to="/aluno/chamados">Voltar aos chamados</ButtonLink>
        </div>
      </Surface>
    </>
  );
}

function Wizard({ catalog }: { catalog: SupportCatalog }) {
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const location = useLocation();
  // rascunho opcional vindo de outra tela (Assistente ASA) por `location.state.ticketDraft`; sem ele, nada muda
  const [prefill] = useState(() => readTicketDraft(location.state));
  const [draft, setDraft] = useState<Draft>(() => {
    const known = (id: string | null | undefined): id is string => Boolean(id) && catalog.categories.some((item) => item.id === id);
    const preselected = known(prefill?.categoryId) ? prefill.categoryId : params.get('categoria');
    return {
      categoryId: known(preselected) ? preselected : '',
      subcategoryId: '',
      subject: (prefill?.subject ?? '').slice(0, catalog.limits.subjectMaxLength),
      description: (prefill?.description ?? '').slice(0, catalog.limits.descriptionMaxLength),
    };
  });
  const [step, setStep] = useState<Step>(0);
  const [maxStep, setMaxStep] = useState<Step>(0);
  const [errors, setErrors] = useState<Errors>({});
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  // uma chave por rascunho: repetir o envio (falha de rede) devolve o mesmo chamado em vez de duplicar
  const [clientRequestId] = useState(() => newClientId('req'));
  const [created, setCreated] = useState<SupportTicket | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef<Step>(step);

  const category = catalog.categories.find((item) => item.id === draft.categoryId);
  const subcategory = category?.subcategories.find((item) => item.id === draft.subcategoryId);
  const readyFiles = uploads.filter((item) => item.status === 'done' && item.upload);
  const failedFiles = uploads.filter((item) => item.status === 'error');

  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    headingRef.current?.focus();
  }, [step]);

  const submit = useMutation({
    mutationFn: () => {
      const ids = uploadedIds(uploads);
      return supportApi.create({
        clientRequestId,
        categoryId: draft.categoryId,
        ...(category && category.subcategories.length > 0 ? { subcategoryId: draft.subcategoryId } : {}),
        subject: draft.subject.trim(),
        description: draft.description.trim(),
        ...(ids.length > 0 ? { attachmentIds: ids } : {}),
      });
    },
    onSuccess: (ticket) => {
      applyTicketUpdate(queryClient, ticket);
      setCreated(ticket);
    },
    onMutate: () => setNotice(null),
    onError: (error) => {
      const fields = fieldErrorsFrom(error) as Errors;
      const known = (Object.keys(fields) as Array<keyof Errors>).filter((field) => field in FIELD_STEP);
      if (known.length > 0 && isApiError(error) && error.kind === 'validation') {
        // mensagem específica do serviço (ex.: arquivo expirado) quando há um só campo; senão a de cada campo
        const specific = known.length === 1 && error.message && error.message !== 'Dados inválidos.' ? error.message : null;
        const mapped: Errors = {};
        for (const field of known) mapped[field] = specific ?? fields[field];
        setErrors(mapped);
        setStep(Math.min(...known.map((field) => FIELD_STEP[field])) as Step);
        setNotice('Revise as informações destacadas e envie de novo.');
        return;
      }
      setNotice(
        isTransientError(error)
          ? `${messageForError(error)} Seu rascunho continua aqui: tente de novo — o envio não será duplicado.`
          : messageForError(error, 'Não foi possível enviar o chamado. Tente novamente.'),
      );
    },
  });

  if (created) return <SuccessView ticket={created} category={category} />;

  const update = (patch: Partial<Draft>, clear: Array<keyof Errors>) => {
    setDraft((current) => ({ ...current, ...patch }));
    if (clear.some((field) => errors[field])) setErrors((current) => Object.fromEntries(Object.entries(current).filter(([field]) => !clear.includes(field as keyof Errors))));
  };

  /** Avança validando cada etapa no caminho; volta sem validar. */
  const goTo = (target: Step) => {
    if (target <= step) {
      setStep(target);
      return;
    }
    for (let index = step; index < target; index += 1) {
      const found = validate(index as Step, draft, category, catalog, uploads);
      if (Object.keys(found).length > 0) {
        setErrors(found);
        setStep(index as Step);
        return;
      }
    }
    setErrors({});
    setStep(target);
    setMaxStep((current) => (target > current ? target : current));
  };

  const maxFiles = Math.min(MAX_FILES_PER_SUBMISSION, catalog.limits.maxAttachmentsPerTicket);

  return (
    <>
      <PageHeader eyebrow={<BackLink to="/aluno/chamados">Meus chamados</BackLink>} title="Abrir chamado" description="Em quatro etapas rápidas. Você acompanha a resposta do ASA aqui e no aplicativo." />
      <div className="max-w-3xl">
        <StepIndicator step={step} maxStep={maxStep} disabled={submit.isPending} onSelect={goTo} />
        <Surface aria-labelledby="etapa-titulo">
          <h2 id="etapa-titulo" ref={headingRef} tabIndex={-1} className="mb-4 text-h3 font-semibold text-ink focus:outline-none">
            {STEPS[step].heading}
          </h2>
          {prefill ? (
            <p role="status" className="mb-4 flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-small text-info-text">
              <Sparkles size={20} className="shrink-0" aria-hidden />
              <span>
                Rascunho preparado pelo Assistente ASA{prefill.reason ? ` (${prefill.reason})` : ''}. Revise e complete antes de enviar: nada é enviado sem a sua confirmação.
              </span>
            </p>
          ) : null}
          {notice ? (
            <p role="alert" className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-small text-danger-text">
              {notice}
            </p>
          ) : null}

          {step === 0 ? (
            <CategoryStep
              catalog={catalog}
              draft={draft}
              errors={errors}
              onCategory={(id) => update({ categoryId: id, ...(id !== draft.categoryId ? { subcategoryId: '' } : {}) }, ['categoryId', 'subcategoryId'])}
              onSubcategory={(id) => update({ subcategoryId: id }, ['subcategoryId'])}
            />
          ) : null}
          {step === 1 ? <DetailsStep catalog={catalog} draft={draft} errors={errors} onChange={(field, value) => update(field === 'subject' ? { subject: value } : { description: value }, [field])} /> : null}
          {step === 2 ? (
            <div className="flex flex-col gap-3">
              <p className="text-small text-slate">Comprovantes, atestados ou documentos ajudam o ASA a resolver mais rápido. Você também pode enviar arquivos depois, pela conversa do chamado.</p>
              <FileUploader
                limits={catalog.limits}
                uploads={uploads}
                onChange={(next) => {
                  setUploads(next);
                  if (errors.attachmentIds) setErrors((current) => ({ ...current, attachmentIds: undefined }));
                }}
                upload={supportApi.upload}
                remove={supportApi.deleteUpload}
                maxFiles={maxFiles}
              />
              {errors.attachmentIds ? (
                <p role="alert" className="text-caption text-danger-text">
                  {errors.attachmentIds}
                </p>
              ) : null}
            </div>
          ) : null}
          {step === 3 ? (
            <div className="flex flex-col gap-4">
              <ReviewSection title="Solicitação" onEdit={() => goTo(0)} disabled={submit.isPending}>
                <KeyValueList
                  columns={2}
                  items={[
                    { label: 'Categoria', value: category?.label ?? '—' },
                    { label: 'Tipo', value: subcategory?.label ?? 'Não se aplica' },
                  ]}
                />
              </ReviewSection>
              <ReviewSection title="Detalhes" onEdit={() => goTo(1)} disabled={submit.isPending}>
                <KeyValueList
                  items={[
                    { label: 'Assunto', value: draft.subject.trim() },
                    { label: 'Descrição', value: <span className="whitespace-pre-wrap">{draft.description.trim()}</span> },
                  ]}
                />
              </ReviewSection>
              <ReviewSection title="Anexos" onEdit={() => goTo(2)} disabled={submit.isPending}>
                {readyFiles.length > 0 ? (
                  <ul className="flex flex-col gap-1 text-small text-ink">
                    {readyFiles.map((item) => (
                      <li key={item.key} className="flex min-w-0 items-center gap-2">
                        <Paperclip size={16} className="shrink-0 text-slate" aria-hidden />
                        <span className="min-w-0 truncate">{item.name}</span>
                        <span className="shrink-0 text-caption text-mist">{formatBytes(item.sizeBytes)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-small text-slate">Nenhum arquivo anexado.</p>
                )}
                {failedFiles.length > 0 ? <p className="mt-2 text-caption text-warning-text">{failedFiles.length === 1 ? '1 arquivo falhou no envio e não será anexado.' : `${failedFiles.length} arquivos falharam no envio e não serão anexados.`}</p> : null}
              </ReviewSection>
              {category ? (
                <p className="rounded-md bg-snow px-3 py-2 text-small text-slate">
                  O ASA faz a triagem e encaminha para {category.defaultTeam}. Prazo de resposta: até {businessDays(category.slaBusinessDays)} — o prazo pausa enquanto o ASA aguarda uma resposta sua.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-4">
            {step === 0 ? (
              <ButtonLink to="/aluno/chamados">Cancelar</ButtonLink>
            ) : (
              <Button icon={ChevronLeft} onClick={() => goTo((step - 1) as Step)} disabled={submit.isPending}>
                Voltar
              </Button>
            )}
            {step < 3 ? (
              <Button variant="primary" iconRight={ChevronRight} onClick={() => goTo((step + 1) as Step)}>
                Continuar
              </Button>
            ) : (
              <Button variant="primary" icon={Send} loading={submit.isPending} onClick={() => submit.mutate()}>
                Enviar chamado
              </Button>
            )}
          </div>
        </Surface>
      </div>
    </>
  );
}

/**
 * Abertura de chamado em quatro etapas (Solicitação, Detalhes, Anexos, Revisão). `?categoria=<id>` pré-seleciona;
 * `location.state.ticketDraft` (Assistente ASA) começa com categoria, assunto e descrição preenchidos para revisão.
 */
export default function NewTicketPage() {
  const catalog = useSupportCatalog();
  if (catalog.isPending) {
    return (
      <>
        <PageHeader title="Abrir chamado" />
        <LoadingRows rows={5} />
      </>
    );
  }
  if (catalog.error) {
    return (
      <>
        <PageHeader eyebrow={<BackLink to="/aluno/chamados">Meus chamados</BackLink>} title="Abrir chamado" />
        <QueryFailure error={catalog.error} onRetry={() => void catalog.refetch()} title="Não foi possível carregar as categorias" />
      </>
    );
  }
  return <Wizard catalog={catalog.data} />;
}
