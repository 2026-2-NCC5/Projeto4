import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useToast } from '@/components/ui/Toast';
import { messageForError } from '@/services/api/client';
import { supportApi } from '@/services/api/endpoints';
import type { SupportStaffMessageRequest, SupportStaffTicket, SupportTicketPriority, SupportTicketStatus } from '@/types/api';
import { isTicketChanged, staffKeys, staffTicketsApi } from './api';

/** Catálogo (categorias, equipes, limites de anexo). Muda só com nova versão do servidor. */
export function useSupportCatalog() {
  return useQuery({ queryKey: staffKeys.catalog, queryFn: supportApi.catalog, staleTime: 10 * 60_000 });
}

/** Chamado completo para a equipe (inclui eventos internos). Atualiza a cada 30 s enquanto a tela está aberta. */
export function useStaffTicket(id: string | null) {
  return useQuery({
    queryKey: staffKeys.ticket(id ?? ''),
    queryFn: () => staffTicketsApi.get(id ?? ''),
    enabled: Boolean(id),
    refetchInterval: 30_000,
  });
}

/**
 * Confirma a leitura das mensagens do aluno ao abrir o chamado (o aluno vê a confirmação) e de novo quando uma
 * atualização periódica traz mensagem nova enquanto a conversa está aberta. Falha aqui não bloqueia o atendimento.
 */
export function useMarkTicketRead(id: string | null, ticket: SupportStaffTicket | undefined) {
  const queryClient = useQueryClient();
  const openedFor = useRef<string | null>(null);
  const hasUnread = (ticket?.unreadFromStudent ?? 0) > 0;
  useEffect(() => {
    if (!id) return undefined;
    if (openedFor.current === id && !hasUnread) return undefined;
    openedFor.current = id;
    let active = true;
    staffTicketsApi
      .markRead(id)
      .then((data) => {
        // contadores de não lidas da fila e do painel mudam mesmo que a tela já tenha trocado de chamado
        void queryClient.invalidateQueries({ queryKey: staffKeys.tickets });
        void queryClient.invalidateQueries({ queryKey: staffKeys.dashboard });
        if (active) queryClient.setQueryData(staffKeys.ticket(id), data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [id, hasUnread, queryClient]);
}

export type TicketAction =
  | { kind: 'status'; status: SupportTicketStatus; publicNote?: string }
  /**
   * Mesma equipe do chamado = "Assumir" (quem age vira o atendente; evento interno, salvo se a situação mudar).
   * Outra equipe = encaminhar (evento público, aluno avisado e o chamado fica sem atendente).
   */
  | { kind: 'assign'; team: string; publicNote?: string; intent?: 'claim' | 'forward' }
  | { kind: 'message'; body: SupportStaffMessageRequest }
  | { kind: 'note'; content: string }
  | { kind: 'priority'; priority: SupportTicketPriority }
  | { kind: 'resolve'; resolution: string };

const SUCCESS: Record<Exclude<TicketAction['kind'], 'assign'>, string> = {
  status: 'Situação atualizada.',
  message: 'Resposta enviada ao aluno.',
  note: 'Nota interna registrada.',
  priority: 'Prioridade alterada.',
  resolve: 'Chamado resolvido. O aluno foi avisado.',
};

export function successMessageFor(action: TicketAction): string {
  if (action.kind !== 'assign') return SUCCESS[action.kind];
  if (action.intent === 'forward') return `Chamado encaminhado para ${action.team}. Ele fica sem atendente até alguém da equipe assumir.`;
  if (action.intent === 'claim') return 'Você assumiu o atendimento.';
  return 'Responsável atualizado.';
}

function run(id: string, action: TicketAction): Promise<SupportStaffTicket> {
  switch (action.kind) {
    case 'status':
      return staffTicketsApi.status(id, { status: action.status, ...(action.publicNote ? { publicNote: action.publicNote } : {}) });
    case 'assign':
      return staffTicketsApi.assign(id, { team: action.team, ...(action.publicNote ? { publicNote: action.publicNote } : {}) });
    case 'message':
      return staffTicketsApi.message(id, action.body);
    case 'note':
      return staffTicketsApi.note(id, action.content);
    case 'priority':
      return staffTicketsApi.priority(id, { priority: action.priority });
    case 'resolve':
      return staffTicketsApi.resolve(id, action.resolution);
  }
}

/**
 * Ações da equipe sobre um chamado. Nunca repetem sozinhas. Em 409 `ticket_changed` (outra pessoa alterou o
 * chamado), recarrega o chamado e avisa por `onConflict`; demais erros viram aviso com a mensagem do servidor.
 */
export function useTicketActions(id: string, options: { onConflict?: () => void; successMessage?: (action: TicketAction) => string | null } = {}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (action: TicketAction) => run(id, action),
    onSuccess: (data, action) => {
      queryClient.setQueryData(staffKeys.ticket(id), data);
      void queryClient.invalidateQueries({ queryKey: staffKeys.tickets });
      void queryClient.invalidateQueries({ queryKey: staffKeys.dashboard });
      const message = options.successMessage ? options.successMessage(action) : successMessageFor(action);
      if (message) toast.show(message);
    },
    onError: (error) => {
      if (isTicketChanged(error)) {
        void queryClient.invalidateQueries({ queryKey: staffKeys.ticket(id) });
        void queryClient.invalidateQueries({ queryKey: staffKeys.tickets });
        if (options.onConflict) options.onConflict();
        else toast.show('Outra pessoa atualizou este chamado enquanto você agia. Os dados foram recarregados; confira e tente de novo.', 'error');
        return;
      }
      toast.show(messageForError(error, 'Não foi possível concluir a ação.'), 'error');
    },
  });
}

/** "Assumir" na fila: atribui o chamado à equipe atual dele e a quem clicou. */
export function useClaimTicket() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (row: { id: string; protocol: string; team: string }) => staffTicketsApi.assign(row.id, { team: row.team }),
    onSuccess: (data, row) => {
      queryClient.setQueryData(staffKeys.ticket(row.id), data);
      toast.show(`Você assumiu o chamado ${row.protocol}.`);
    },
    onError: (error) => {
      if (isTicketChanged(error)) toast.show('Outra pessoa atualizou este chamado enquanto você agia. A fila foi recarregada; confira antes de assumir.', 'error');
      else toast.show(messageForError(error, 'Não foi possível assumir o chamado.'), 'error');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: staffKeys.tickets });
      void queryClient.invalidateQueries({ queryKey: staffKeys.dashboard });
    },
  });
}
