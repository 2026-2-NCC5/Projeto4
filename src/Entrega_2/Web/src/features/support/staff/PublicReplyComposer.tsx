import { ChevronDown, ChevronUp, Hand } from 'lucide-react';
import { useId, useState } from 'react';
import { Checkbox, TextArea, TextInput } from '@/components/ui/Form';
import { FileUploader, hasPendingUploads, uploadedIds, type PendingUpload } from '@/features/support/components/Attachments';
import { Composer } from '@/features/support/components/Conversation';
import { cn } from '@/lib/cn';
import type { SupportLimits, SupportStaffMessageRequest } from '@/types/api';
import { staffTicketsApi } from './api';

export const REQUEST_TITLE = { min: 3, max: 120 };
export const REQUEST_DESCRIPTION = { min: 10, max: 500 };

/**
 * Resposta pública ao aluno: texto, anexos (enviados antes, com id) e, opcionalmente, um pedido de ação que
 * coloca o chamado em "Aguardando aluno" e pausa o prazo. A validação espelha a do servidor, que valida de novo.
 */
export function PublicReplyComposer({
  limits,
  attachedCount,
  sending,
  disabledReason,
  allowRequestAction = true,
  onSend,
}: {
  limits: SupportLimits;
  /** anexos já no chamado (o limite é por chamado) */
  attachedCount: number;
  sending: boolean;
  disabledReason?: string | null;
  allowRequestAction?: boolean;
  onSend: (body: SupportStaffMessageRequest) => Promise<boolean>;
}) {
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [requesting, setRequesting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expectsAttachment, setExpectsAttachment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const panelId = useId();
  const maxFiles = Math.max(0, limits.maxAttachmentsPerTicket - attachedCount);

  const resetRequest = () => {
    setRequesting(false);
    setTitle('');
    setDescription('');
    setExpectsAttachment(false);
    setTitleError(null);
    setDescriptionError(null);
  };

  const send = async (content: string): Promise<boolean> => {
    setError(null);
    if (hasPendingUploads(uploads)) {
      setError('Aguarde o fim do envio dos arquivos.');
      return false;
    }
    const body: SupportStaffMessageRequest = { content };
    const ids = uploadedIds(uploads);
    if (ids.length > 0) body.attachmentIds = ids;
    if (requesting) {
      const cleanTitle = title.trim();
      const cleanDescription = description.trim();
      const badTitle = cleanTitle.length < REQUEST_TITLE.min ? `Descreva o que o aluno deve enviar (mínimo de ${REQUEST_TITLE.min} caracteres).` : null;
      const badDescription = cleanDescription.length < REQUEST_DESCRIPTION.min ? `Explique o pedido com pelo menos ${REQUEST_DESCRIPTION.min} caracteres.` : null;
      setTitleError(badTitle);
      setDescriptionError(badDescription);
      if (badTitle || badDescription) return false;
      body.requestAction = { title: cleanTitle, description: cleanDescription, ...(expectsAttachment ? { expectsAttachment: true } : {}) };
    }
    const ok = await onSend(body);
    if (ok) {
      setUploads([]);
      resetRequest();
    }
    return ok;
  };

  return (
    <div className="flex flex-col gap-2">
      <Composer
        onSend={send}
        maxLength={limits.messageMaxLength}
        label="Resposta ao aluno"
        placeholder="Escreva a resposta para o aluno"
        sending={sending}
        disabledReason={disabledReason ?? null}
        submitLabel={requesting ? 'Enviar e pedir ação' : 'Enviar ao aluno'}
        extra={
          <div className="flex flex-col gap-3">
            <FileUploader
              limits={limits}
              uploads={uploads}
              onChange={setUploads}
              upload={staffTicketsApi.upload}
              remove={staffTicketsApi.deleteUpload}
              maxFiles={maxFiles}
              disabled={sending}
            />
            {allowRequestAction ? (
              <div className={cn('rounded-md border', requesting ? 'border-line bg-paper' : 'border-transparent')}>
                <button
                  type="button"
                  aria-expanded={requesting}
                  aria-controls={requesting ? panelId : undefined}
                  onClick={() => (requesting ? resetRequest() : setRequesting(true))}
                  className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-small font-semibold text-action hover:bg-action-soft"
                >
                  <Hand size={16} aria-hidden />
                  Pedir uma ação ao aluno
                  {requesting ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
                </button>
                {requesting ? (
                  <div id={panelId} className="flex flex-col gap-3 px-3 pb-3 pt-1">
                    <p className="text-caption text-slate">O chamado passa para “Aguardando aluno” e o prazo fica pausado até a resposta.</p>
                    <TextInput
                      label="O que o aluno precisa fazer"
                      value={title}
                      maxLength={REQUEST_TITLE.max}
                      required
                      error={titleError}
                      hint={`De ${REQUEST_TITLE.min} a ${REQUEST_TITLE.max} caracteres`}
                      placeholder="Ex.: Enviar comprovante de matrícula"
                      onChange={(event) => setTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.preventDefault();
                      }}
                    />
                    <TextArea
                      label="Detalhes do pedido"
                      value={description}
                      maxLength={REQUEST_DESCRIPTION.max}
                      required
                      rows={3}
                      error={descriptionError}
                      hint={`${description.trim().length}/${REQUEST_DESCRIPTION.max} · mínimo de ${REQUEST_DESCRIPTION.min} caracteres`}
                      onChange={(event) => setDescription(event.target.value)}
                    />
                    <Checkbox label="Pedir o envio de um arquivo" checked={expectsAttachment} onChange={(event) => setExpectsAttachment(event.target.checked)} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        }
      />
      {error ? (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
