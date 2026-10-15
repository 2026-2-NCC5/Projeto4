import { useCallback, useEffect, useState } from 'react';

import { haptics } from '../../../services/haptics';
import type { SupportLimits } from '../../../types/api';
import { getSupportApi } from '../api';
import { pickSupportFile, readAsBase64, type PickedFile } from '../attachments';
import { supportErrorMessage } from '../errors';

export type AttachmentStatus = 'reading' | 'uploading' | 'uploaded' | 'failed';

export interface UploadItem {
  localId: string;
  file: PickedFile;
  status: AttachmentStatus;
  /** alvo da barra de progresso (0–1): leitura → envio → confirmado */
  progress: number;
  uploadId: string | null;
  error: string | null;
}

export interface AttachmentUploads {
  items: UploadItem[];
  /** algum arquivo ainda está sendo lido ou enviado */
  busy: boolean;
  uploadedIds: string[];
  /** abre o seletor; devolve a mensagem de erro (tipo/tamanho) ou null */
  pick: () => Promise<string | null>;
  remove: (localId: string) => void;
  retry: (localId: string) => void;
  /** esquece os itens enviados (depois de vinculados a um chamado/mensagem) */
  clear: () => void;
}

let counter = 0;
const nextLocalId = () => {
  counter += 1;
  return `local-${Date.now().toString(36)}-${counter}`;
};

/**
 * Envio de anexos em duas fases: o arquivo sobe assim que é escolhido (com progresso por etapa) e depois é vinculado
 * ao chamado ou à mensagem. Remover durante o envio cancela a requisição; remover depois apaga o envio pendente.
 */
export function useAttachmentUploads(limits: SupportLimits | null, maxFiles = 5): AttachmentUploads {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [controllers] = useState(() => new Map<string, AbortController>());

  const update = useCallback((localId: string, changes: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.localId === localId ? { ...item, ...changes } : item)));
  }, []);

  const upload = useCallback(
    (localId: string, file: PickedFile) => {
      const controller = new AbortController();
      controllers.set(localId, controller);
      update(localId, { status: 'reading', progress: 0.15, error: null });
      readAsBase64(file)
        .then((contentBase64) => {
          if (controller.signal.aborted) return null;
          update(localId, { status: 'uploading', progress: 0.9 });
          return getSupportApi().uploadFile({ name: file.name, mimeType: file.mimeType, contentBase64 }, { signal: controller.signal });
        })
        .then((uploaded) => {
          if (!uploaded) return;
          update(localId, { status: 'uploaded', progress: 1, uploadId: uploaded.id });
          haptics.success();
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          update(localId, { status: 'failed', progress: 0, error: supportErrorMessage(error, 'Não conseguimos enviar este arquivo.') });
          haptics.error();
        })
        .finally(() => controllers.delete(localId));
    },
    [controllers, update],
  );

  const pick = useCallback(async (): Promise<string | null> => {
    if (!limits) return 'Ainda carregando as regras de anexos. Tente novamente em instantes.';
    if (items.length >= maxFiles) return `Você pode anexar até ${maxFiles} arquivos por vez.`;
    try {
      const result = await pickSupportFile(limits);
      if (result.kind === 'cancelled') return null;
      if (result.kind === 'invalid') {
        haptics.error();
        return result.message;
      }
      const localId = nextLocalId();
      setItems((current) => [...current, { localId, file: result.file, status: 'reading', progress: 0, uploadId: null, error: null }]);
      upload(localId, result.file);
      return null;
    } catch {
      return 'Não conseguimos abrir seus arquivos agora.';
    }
  }, [items.length, limits, maxFiles, upload]);

  const remove = useCallback(
    (localId: string) => {
      controllers.get(localId)?.abort();
      const target = items.find((item) => item.localId === localId);
      if (target?.uploadId) getSupportApi().deleteUpload(target.uploadId).catch(() => undefined);
      setItems((current) => current.filter((item) => item.localId !== localId));
    },
    [controllers, items],
  );

  const retry = useCallback(
    (localId: string) => {
      const target = items.find((item) => item.localId === localId);
      if (target) upload(localId, target.file);
    },
    [items, upload],
  );

  const clear = useCallback(() => setItems([]), []);

  // Sair da tela no meio de um envio cancela as requisições em andamento.
  useEffect(() => () => controllers.forEach((controller) => controller.abort()), [controllers]);

  return {
    items,
    busy: items.some((item) => item.status === 'reading' || item.status === 'uploading'),
    uploadedIds: items.filter((item) => item.status === 'uploaded' && item.uploadId).map((item) => item.uploadId as string),
    pick,
    remove,
    retry,
    clear,
  };
}
