import { Download, File, FileImage, FileText, Loader2, Paperclip, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { formatBytes, formatDateTime } from '@/lib/format';
import { messageForError } from '@/services/api/client';
import type { SupportAttachment, SupportAttachmentLink, SupportLimits, SupportUpload, SupportUploadRequest } from '@/types/api';

const iconFor = (mime: string) => (mime.startsWith('image/') ? FileImage : mime === 'application/pdf' || mime.startsWith('text/') ? FileText : File);

/**
 * Anexos do chamado. O download usa link assinado de 5 minutos pedido na hora (nunca uma URL guardada).
 */
export function AttachmentList({
  attachments,
  getLink,
  emptyText,
  ownLabel = 'Você',
}: {
  attachments: SupportAttachment[];
  getLink: (attachmentId: string) => Promise<SupportAttachmentLink>;
  emptyText?: string;
  /** como chamar o aluno (portal do aluno: "Você"; portal da equipe: "Aluno") */
  ownLabel?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (attachments.length === 0) return emptyText ? <p className="text-small text-mist">{emptyText}</p> : null;
  const open = async (id: string) => {
    setError(null);
    setBusy(id);
    try {
      const link = await getLink(id);
      window.open(link.url, '_blank', 'noopener,noreferrer');
    } catch (caught) {
      setError(messageForError(caught, 'Não foi possível abrir o arquivo.'));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-line-soft rounded-md border border-line bg-white">
        {attachments.map((attachment) => {
          const IconGlyph = iconFor(attachment.mimeType);
          return (
            <li key={attachment.id} className="flex items-center gap-3 px-3 py-2">
              <IconGlyph size={20} className="shrink-0 text-slate" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-medium text-ink">{attachment.name}</p>
                <p className="text-caption text-mist">
                  {formatBytes(attachment.sizeBytes)} · {attachment.uploadedBy === 'student' ? ownLabel : attachment.uploaderName} · {formatDateTime(attachment.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void open(attachment.id)}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-small font-semibold text-action hover:bg-action-soft disabled:opacity-50"
                aria-label={`Abrir ${attachment.name}`}
              >
                {busy === attachment.id ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Download size={16} aria-hidden />}
                Abrir
              </button>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function readBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('falha ao ler o arquivo'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

export interface PendingUpload {
  key: string;
  name: string;
  sizeBytes: number;
  status: 'uploading' | 'done' | 'error';
  upload?: SupportUpload;
  error?: string;
}

/**
 * Envio de arquivos antes de anexar à mensagem/chamado. Confere tipo e tamanho com os limites do servidor
 * (que valida de novo, inclusive o conteúdo); cada arquivo vira um envio pendente com id.
 */
export function FileUploader({
  limits,
  uploads,
  onChange,
  upload,
  remove,
  maxFiles,
  disabled,
  label = 'Anexar arquivo',
}: {
  limits: SupportLimits;
  uploads: PendingUpload[];
  onChange: (next: PendingUpload[] | ((current: PendingUpload[]) => PendingUpload[])) => void;
  upload: (body: SupportUploadRequest) => Promise<SupportUpload>;
  remove?: (uploadId: string) => Promise<void>;
  maxFiles: number;
  disabled?: boolean;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [error, setError] = useState<string | null>(null);

  const add = async (files: FileList | null) => {
    setError(null);
    if (!files || files.length === 0) return;
    const room = maxFiles - uploads.length;
    const chosen = Array.from(files).slice(0, Math.max(room, 0));
    if (files.length > room) setError(`Você pode anexar até ${maxFiles} arquivo(s) por vez.`);
    for (const file of chosen) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
      const type = file.type || 'application/octet-stream';
      if (!limits.allowedMimeTypes.includes(type)) {
        setError(`"${file.name}": tipo de arquivo não aceito.`);
        continue;
      }
      if (file.size > limits.maxAttachmentBytes) {
        setError(`"${file.name}" passa de ${formatBytes(limits.maxAttachmentBytes)}.`);
        continue;
      }
      onChange((current) => [...current, { key, name: file.name, sizeBytes: file.size, status: 'uploading' }]);
      try {
        const content = await readBase64(file);
        const result = await upload({ name: file.name, mimeType: type, contentBase64: content });
        onChange((current) => current.map((item) => (item.key === key ? { ...item, status: 'done', upload: result } : item)));
      } catch (caught) {
        onChange((current) => current.map((item) => (item.key === key ? { ...item, status: 'error', error: messageForError(caught, 'Falha no envio.') } : item)));
      }
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const discard = async (item: PendingUpload) => {
    onChange((current) => current.filter((candidate) => candidate.key !== item.key));
    if (item.upload && remove) await remove(item.upload.id).catch(() => undefined);
  };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          id={`${hintId}-input`}
          accept={limits.allowedMimeTypes.join(',')}
          aria-describedby={hintId}
          disabled={disabled || uploads.length >= maxFiles}
          onChange={(event) => void add(event.target.files)}
        />
        <label
          htmlFor={`${hintId}-input`}
          className={cn(
            'inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-line bg-white px-3 text-small font-semibold text-ink hover:border-line-strong',
            (disabled || uploads.length >= maxFiles) && 'pointer-events-none opacity-50',
          )}
        >
          <Paperclip size={16} aria-hidden />
          {label}
        </label>
        <p id={hintId} className="mt-1 text-caption text-mist">
          PDF, imagens ou documentos de até {formatBytes(limits.maxAttachmentBytes)}. Máximo de {maxFiles} por envio.
        </p>
      </div>
      {uploads.length > 0 ? (
        <ul className="flex flex-col gap-1.5" aria-label="Arquivos para enviar">
          {uploads.map((item) => (
            <li key={item.key} className="flex items-center gap-2 rounded-md bg-paper px-3 py-1.5 text-small">
              {item.status === 'uploading' ? <Loader2 size={16} className="animate-spin text-mist" aria-hidden /> : <Paperclip size={16} className="text-slate" aria-hidden />}
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className={cn('text-caption', item.status === 'error' ? 'text-danger-text' : 'text-mist')}>
                {item.status === 'uploading' ? 'enviando…' : item.status === 'error' ? item.error : formatBytes(item.sizeBytes)}
              </span>
              <button type="button" aria-label={`Remover ${item.name}`} className="rounded-sm p-0.5 text-mist hover:text-ink" onClick={() => void discard(item)}>
                <X size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="text-caption text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const uploadedIds = (uploads: PendingUpload[]): string[] => uploads.filter((item) => item.status === 'done' && item.upload).map((item) => item.upload!.id);
export const hasPendingUploads = (uploads: PendingUpload[]): boolean => uploads.some((item) => item.status === 'uploading');
