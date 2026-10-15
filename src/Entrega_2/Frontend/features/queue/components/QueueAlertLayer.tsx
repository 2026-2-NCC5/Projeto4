import React from 'react';

import { useOptionalAppNavigation } from '../../../navigation/AppNavigator';
import { useOptionalQueue } from '../hooks/useQueue';

import { QueueAlertBanner } from './QueueAlertBanner';
import { QueueCalledModal } from './QueueCalledModal';

/** Avisos da fila sobre qualquer tela do app (montado uma vez na raiz da área autenticada). */
export function QueueAlertLayer() {
  const queue = useOptionalQueue();
  const navigation = useOptionalAppNavigation();
  if (!queue) return null;
  return (
    <>
      <QueueAlertBanner
        alert={queue.banner}
        onPress={() => {
          queue.dismissBanner();
          navigation?.openQueue();
        }}
        onDismiss={queue.dismissBanner}
      />
      <QueueCalledModal
        alert={queue.called}
        onAcknowledge={() => {
          queue.acknowledgeCalled();
          navigation?.openQueue();
        }}
      />
    </>
  );
}
