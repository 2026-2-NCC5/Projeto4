import { useCallback, useState } from 'react';
import { Linking } from 'react-native';

import { API_BASE_URL } from '../../../config/env';
import { haptics } from '../../../services/haptics';
import type { SupportAttachment, SupportTicket } from '../../../types/api';
import { getSupportApi } from '../api';
import { supportErrorMessage } from '../errors';

import { newClientRequestId } from './useCreateTicket';
import type { SupportResource } from './useSupportResource';

/** Mensagem enviada otimisticamente: aparece na hora como "Enviando..." e some quando o servidor confirma. */
export interface PendingMessage {
  clientMessageId: string;
  content: string;
  attachmentIds: string[];
  attachmentNames: string[];
  createdAt: string;
  status: 'sending' | 'failed';
  error: string | null;
}

export type TicketBusy = 'cancel' | 'reopen' | 'rate' | null;

export interface TicketActions {
  pending: PendingMessage[];
  busy: TicketBusy;
  send: (content: string, attachments: { ids: string[]; names: string[] }) => void;
  retry: (clientMessageId: string) => void;
  discard: (clientMessageId: string) => void;
  /** Cada ação devolve null em caso de sucesso ou a mensagem de erro amigável. */
  cancel: (reason?: string) => Promise<string | null>;
  reopen: (reason: string) => Promise<string | null>;
  rate: (rating: 1 | 2 | 3 | 4 | 5, comment?: string) => Promise<string | null>;
  markRead: () => void;
  openAttachment: (attachment: SupportAttachment) => Promise<string | null>;
}

export function useTicketActions(ticketId: string, resource: SupportResource<SupportTicket>): TicketActions {
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [busy, setBusy] = useState<TicketBusy>(null);
  const { mutate } = resource;

  const deliver = useCallback(
    (message: PendingMessage) => {
      getSupportApi()
        .sendMessage(ticketId, { clientMessageId: message.clientMessageId, content: message.content, attachmentIds: message.attachmentIds })
        .then((ticket) => {
          mutate(ticket);
          setPending((current) => current.filter((item) => item.clientMessageId !== message.clientMessageId));
        })
        .catch((error: unknown) => {
          haptics.error();
          setPending((current) => current.map((item) => (item.clientMessageId === message.clientMessageId ? { ...item, status: 'failed', error: supportErrorMessage(error, 'Não foi possível enviar.') } : item)));
        });
    },
    [mutate, ticketId],
  );

  const send = useCallback(
    (content: string, attachments: { ids: string[]; names: string[] }) => {
      const message: PendingMessage = {
        clientMessageId: newClientRequestId().replace(/^req-/, 'msg-'),
        content: content.trim(),
        attachmentIds: attachments.ids,
        attachmentNames: attachments.names,
        createdAt: new Date().toISOString(),
        status: 'sending',
        error: null,
      };
      setPending((current) => [...current, message]);
      deliver(message);
    },
    [deliver],
  );

  const retry = useCallback(
    (clientMessageId: string) => {
      const target = pending.find((item) => item.clientMessageId === clientMessageId);
      if (!target) return;
      // Mesmo clientMessageId: se o primeiro envio chegou ao servidor, não duplica.
      const again = { ...target, status: 'sending' as const, error: null };
      setPending((current) => current.map((item) => (item.clientMessageId === clientMessageId ? again : item)));
      deliver(again);
    },
    [deliver, pending],
  );

  const discard = useCallback((clientMessageId: string) => setPending((current) => current.filter((item) => item.clientMessageId !== clientMessageId)), []);

  const run = useCallback(
    async (kind: Exclude<TicketBusy, null>, action: () => Promise<SupportTicket>, successHaptic: boolean): Promise<string | null> => {
      if (busy) return null;
      setBusy(kind);
      try {
        mutate(await action());
        if (successHaptic) haptics.success();
        return null;
      } catch (error) {
        haptics.error();
        return supportErrorMessage(error);
      } finally {
        setBusy(null);
      }
    },
    [busy, mutate],
  );

  const cancel = useCallback((reason?: string) => run('cancel', () => getSupportApi().cancelTicket(ticketId, reason?.trim() ? { reason: reason.trim() } : {}), false), [run, ticketId]);
  const reopen = useCallback((reason: string) => run('reopen', () => getSupportApi().reopenTicket(ticketId, { reason }), true), [run, ticketId]);
  const rate = useCallback(
    (rating: 1 | 2 | 3 | 4 | 5, comment?: string) => run('rate', () => getSupportApi().rateTicket(ticketId, comment?.trim() ? { rating, comment: comment.trim() } : { rating }), true),
    [run, ticketId],
  );

  const markRead = useCallback(() => {
    getSupportApi()
      .markRead(ticketId)
      .then(mutate)
      .catch(() => undefined);
  }, [mutate, ticketId]);

  const openAttachment = useCallback(
    async (attachment: SupportAttachment): Promise<string | null> => {
      try {
        const link = await getSupportApi().getAttachmentLink(ticketId, attachment.id);
        if (!link) return 'A visualização de arquivos não está disponível no modo de demonstração.';
        await Linking.openURL(`${API_BASE_URL}${link.url}`);
        return null;
      } catch (error) {
        return supportErrorMessage(error, 'Não conseguimos abrir este arquivo agora.');
      }
    },
    [ticketId],
  );

  return { pending, busy, send, retry, discard, cancel, reopen, rate, markRead, openAttachment };
}
