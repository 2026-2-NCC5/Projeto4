import React from 'react';

import { AppText, Badge } from '../../../components/ui';
import type { QueueDataSource } from '../../../types/api';

export const QUEUE_DEMO_LABEL = 'Simulação — dados fictícios';
export const QUEUE_UNAUTHORIZED_NOTE = 'Fonte pública sem autorização institucional registrada';

/**
 * Origem dos dados da fila (contrato v1.5, `sync.source`): o simulador aparece como "Simulação — dados fictícios";
 * o painel público sem autorização registrada ganha uma nota discreta. Fonte autorizada ou desconhecida: nada.
 */
export function QueueSourceLabel({ source }: { source: QueueDataSource | null | undefined }) {
  if (source?.kind === 'demo') {
    return <Badge label={QUEUE_DEMO_LABEL} tone="warning" icon="ⓘ" accessibilityLabel="Simulação: dados fictícios" testID="queue-source-demo" />;
  }
  if (source?.kind === 'public_panel' && source.authorized === false) {
    return (
      <AppText variant="caption" tone="muted" testID="queue-source-unauthorized">
        {QUEUE_UNAUTHORIZED_NOTE}
      </AppText>
    );
  }
  return null;
}
