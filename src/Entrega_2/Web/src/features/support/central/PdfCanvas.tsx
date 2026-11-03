import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { IconButton, Spinner } from '@/components/ui/Button';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

/**
 * Prévia de PDF desenhada em canvas com pdf.js, sem plugin do navegador. O conteúdo do arquivo nunca vira HTML nem
 * executa script: sem XFA, sem camada de scripts do documento e sem fontes do arquivo instaladas na página (compatível
 * com a CSP `font-src 'self'`; WebAssembly fica desligado pelo mesmo motivo). A biblioteca só é baixada quando alguém abre um PDF.
 */
export function PdfCanvas({ url, name, onFailure }: { url: string; name: string; onFailure: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const failureHandler = useRef(onFailure);
  useEffect(() => {
    failureHandler.current = onFailure;
  }, [onFailure]);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;
    (async () => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      const task = pdfjs.getDocument({ url, disableFontFace: true, enableXfa: false, useWasm: false, withCredentials: false });
      destroy = () => void task.destroy();
      if (cancelled) {
        destroy();
        return;
      }
      const opened = await task.promise;
      if (!cancelled) setDoc(opened);
    })().catch(() => {
      if (!cancelled) failureHandler.current();
    });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [url]);

  useEffect(() => {
    if (!doc || !canvas.current) return undefined;
    let task: RenderTask | null = null;
    let cancelled = false;
    const target = canvas.current;
    (async () => {
      const current = await doc.getPage(page);
      if (cancelled) return;
      const viewport = current.getViewport({ scale: zoom * (window.devicePixelRatio || 1) });
      target.width = viewport.width;
      target.height = viewport.height;
      target.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`;
      task = current.render({ canvas: target, viewport });
      await task.promise;
    })().catch((error: unknown) => {
      if (!cancelled && (error as { name?: string }).name !== 'RenderingCancelledException') failureHandler.current();
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, zoom]);

  if (!doc) return <div className="flex flex-1 items-center justify-center py-12"><Spinner label="Abrindo o PDF" /></div>;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-line bg-snow px-2 py-1">
        <IconButton label="Página anterior" icon={ChevronLeft} size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} />
        <span className="px-1 text-small text-slate tabular-nums" aria-live="polite">Página {page} de {doc.numPages}</span>
        <IconButton label="Próxima página" icon={ChevronRight} size="sm" disabled={page >= doc.numPages} onClick={() => setPage(page + 1)} />
        <span className="mx-1 h-4 w-px bg-line" aria-hidden />
        <IconButton label="Diminuir zoom" icon={ZoomOut} size="sm" disabled={zoom <= MIN_ZOOM} onClick={() => setZoom(Math.max(MIN_ZOOM, zoom - ZOOM_STEP))} />
        <span className="px-1 text-small text-slate tabular-nums">{Math.round(zoom * 100)}%</span>
        <IconButton label="Aumentar zoom" icon={ZoomIn} size="sm" disabled={zoom >= MAX_ZOOM} onClick={() => setZoom(Math.min(MAX_ZOOM, zoom + ZOOM_STEP))} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-cloud p-2">
        <canvas ref={canvas} role="img" aria-label={`Página ${page} de ${name}`} className="mx-auto block bg-white" />
      </div>
    </div>
  );
}
