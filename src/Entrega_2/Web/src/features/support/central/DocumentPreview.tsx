import { Download, Expand, File, Minimize2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { buttonClasses, IconButton, Spinner } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { messageForError } from '@/services/api/client';
import type { SupportAttachmentLink, SupportStaffAttachment } from '@/types/api';

const PdfCanvas = lazy(() => import('./PdfCanvas').then((module) => ({ default: module.PdfCanvas })));

/** Só estes tipos são desenhados na tela. Qualquer outro aparece com os dados e o download: nada é interpretado. */
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function Unavailable({ attachment, url, reason }: { attachment: SupportStaffAttachment; url: string | null; reason: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <File size={28} className="text-slate" aria-hidden />
      <div>
        <p className="text-body font-medium text-ink break-all">{attachment.name}</p>
        <p className="text-small text-slate">{attachment.mimeType} · {formatBytes(attachment.sizeBytes)}</p>
        <p className="mt-2 text-small text-slate">{reason}</p>
      </div>
      {url ? <a href={url} download={attachment.name} className={buttonClasses('secondary', 'sm')}><Download size={16} aria-hidden /> Baixar</a> : null}
    </div>
  );
}

/**
 * Prévia dentro do workspace: fica no painel de contexto e o chat continua disponível ao lado.
 * O endereço é um link assinado de 5 minutos pedido na hora; abrir fica registrado na auditoria pela API.
 */
export function DocumentPreview({ attachment, getLink, onClose }: { attachment: SupportStaffAttachment; getLink: (id: string) => Promise<SupportAttachmentLink>; onClose: () => void }) {
  const [link, setLink] = useState<{ id: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const attachmentId = attachment.id;

  useEffect(() => {
    let active = true;
    getLink(attachmentId)
      .then((result) => {
        if (active) setLink({ id: attachmentId, url: result.url });
      })
      .catch((caught: unknown) => {
        if (active) setError(messageForError(caught, 'Não foi possível abrir o arquivo.'));
      });
    return () => {
      active = false;
    };
  }, [attachmentId, getLink]);

  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const url = link?.id === attachmentId ? link.url : null;
  const isPdf = attachment.mimeType === 'application/pdf';
  const isImage = IMAGE_TYPES.has(attachment.mimeType);

  return (
    <div role="region" aria-label={`Prévia de ${attachment.name}`} className={cn('flex min-h-0 flex-1 flex-col bg-white', fullscreen && 'fixed inset-0 z-50')}>
      <header className="flex items-center gap-1 border-b border-line px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-small font-semibold text-ink" title={attachment.name}>{attachment.name}</p>
        {url ? <a href={url} download={attachment.name} className={buttonClasses('ghost', 'sm')} aria-label={`Baixar ${attachment.name}`}><Download size={16} aria-hidden /></a> : null}
        <IconButton label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'} icon={fullscreen ? Minimize2 : Expand} size="sm" onClick={() => setFullscreen(!fullscreen)} />
        <IconButton label="Fechar a prévia" icon={X} size="sm" onClick={onClose} />
      </header>
      {error ? (
        <p role="alert" className="p-4 text-small text-danger-text">{error}</p>
      ) : !url ? (
        <div className="flex flex-1 items-center justify-center py-12"><Spinner label="Abrindo o arquivo" /></div>
      ) : isPdf && !pdfFailed ? (
        <Suspense fallback={<div className="flex flex-1 items-center justify-center py-12"><Spinner label="Abrindo o PDF" /></div>}>
          <PdfCanvas url={url} name={attachment.name} onFailure={() => setPdfFailed(true)} />
        </Suspense>
      ) : isPdf ? (
        <Unavailable attachment={attachment} url={url} reason="Este PDF não pôde ser exibido na prévia. Baixe para conferir." />
      ) : isImage ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-1 border-b border-line bg-snow px-2 py-1">
            <IconButton label="Diminuir zoom" icon={ZoomOut} size="sm" disabled={imageZoom <= 0.5} onClick={() => setImageZoom(Math.max(0.5, imageZoom - 0.25))} />
            <span className="px-1 text-small text-slate tabular-nums">{Math.round(imageZoom * 100)}%</span>
            <IconButton label="Aumentar zoom" icon={ZoomIn} size="sm" disabled={imageZoom >= 3} onClick={() => setImageZoom(Math.min(3, imageZoom + 0.25))} />
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-cloud p-2">
            <img src={url} alt={attachment.name} style={{ width: `${imageZoom * 100}%` }} className="mx-auto block max-w-none" />
          </div>
        </div>
      ) : (
        <Unavailable attachment={attachment} url={url} reason="Este tipo de arquivo não é exibido na tela por segurança." />
      )}
    </div>
  );
}
