import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useReducer } from 'react';

import { createCorrelationId } from '../../../services/apiClient';
import { haptics } from '../../../services/haptics';
import type { SupportCatalog, SupportTicket } from '../../../types/api';
import { getSupportApi } from '../api';
import { SUPPORT } from '../config';
import { supportErrorMessage } from '../errors';
import {
  canAdvance,
  createTicketReducer,
  CREATE_STEPS,
  draftHasContent,
  initialCreateState,
  toDraft,
  validateDetails,
  type CreateTicketAction,
  type CreateTicketDraft,
  type CreateTicketState,
} from '../state/createTicketReducer';

import { useAttachmentUploads, type AttachmentUploads } from './useAttachmentUploads';
import { useSupportCatalog } from './useSupportData';
import type { SupportResource } from './useSupportResource';
import { useSupportUserId } from './useSupportResource';

const DRAFT_SAVE_DELAY_MS = 600;

export const newClientRequestId = () => createCorrelationId().replace(/^corr-/, 'req-');

const draftKey = (userId: string) => `${SUPPORT.DRAFT_KEY_PREFIX}:${userId}`;

export interface CreateTicketController {
  state: CreateTicketState;
  dispatch: (action: CreateTicketAction) => void;
  catalog: SupportResource<SupportCatalog>;
  uploads: AttachmentUploads;
  canContinue: boolean;
  stepIndex: number;
  next: () => void;
  back: () => boolean;
  submit: () => Promise<SupportTicket | null>;
  discardDraft: () => void;
}

/** Estado do formulário de abertura, rascunho no aparelho e envio protegido contra duplicidade. */
export function useCreateTicket(initialCategoryId?: string): CreateTicketController {
  const userId = useSupportUserId();
  const catalog = useSupportCatalog();
  const [state, dispatch] = useReducer(createTicketReducer, undefined, () => initialCreateState(newClientRequestId(), initialCategoryId ?? null));
  const uploads = useAttachmentUploads(catalog.data?.limits ?? null);

  // Rascunho salvo: volta exatamente de onde o estudante parou (exceto anexos, que expiram).
  useEffect(() => {
    if (initialCategoryId) return undefined;
    let active = true;
    AsyncStorage.getItem(draftKey(userId))
      .then((raw) => {
        if (!active || !raw) return;
        const draft = JSON.parse(raw) as CreateTicketDraft;
        if (draft && typeof draft.subject === 'string' && typeof draft.description === 'string' && draftHasContent(draft)) dispatch({ type: 'RESTORE', draft });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [initialCategoryId, userId]);

  useEffect(() => {
    if (state.created || !draftHasContent(state)) return undefined;
    const timer = setTimeout(() => {
      AsyncStorage.setItem(draftKey(userId), JSON.stringify(toDraft(state, Date.now()))).catch(() => undefined);
    }, DRAFT_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state, userId]);

  const discardDraft = useCallback(() => {
    AsyncStorage.removeItem(draftKey(userId)).catch(() => undefined);
    uploads.clear();
    dispatch({ type: 'RESET', clientRequestId: newClientRequestId() });
  }, [uploads, userId]);

  const stepIndex = CREATE_STEPS.indexOf(state.step);
  const canContinue = canAdvance(state, catalog.data) && !(state.step === 'attachments' && uploads.busy);

  const next = useCallback(() => {
    if (state.step === 'details' && catalog.data && Object.keys(validateDetails(state, catalog.data.limits)).length > 0) {
      dispatch({ type: 'TOUCH_ALL' });
      haptics.error();
      return;
    }
    if (!canContinue) return;
    const following = CREATE_STEPS[stepIndex + 1];
    if (following) dispatch({ type: 'GO_TO', step: following });
  }, [canContinue, catalog.data, state, stepIndex]);

  /** Etapa anterior; false quando já está na primeira (a tela então sai do fluxo). */
  const back = useCallback(() => {
    const previous = CREATE_STEPS[stepIndex - 1];
    if (!previous || state.created) return false;
    dispatch({ type: 'GO_TO', step: previous });
    return true;
  }, [state.created, stepIndex]);

  const submit = useCallback(async (): Promise<SupportTicket | null> => {
    if (state.submitting || state.created || !state.categoryId) return null;
    dispatch({ type: 'SUBMIT_START' });
    try {
      const ticket = await getSupportApi().createTicket({
        clientRequestId: state.clientRequestId,
        categoryId: state.categoryId,
        subcategoryId: state.subcategoryId,
        subject: state.subject.trim(),
        description: state.description.trim(),
        attachmentIds: uploads.uploadedIds,
      });
      AsyncStorage.removeItem(draftKey(userId)).catch(() => undefined);
      haptics.success();
      dispatch({ type: 'SUBMIT_SUCCESS', ticket });
      return ticket;
    } catch (error) {
      haptics.error();
      dispatch({ type: 'SUBMIT_FAILURE', message: supportErrorMessage(error, 'Não conseguimos enviar seu chamado. Seus dados continuam aqui; tente novamente.') });
      return null;
    }
  }, [state, uploads.uploadedIds, userId]);

  return { state, dispatch, catalog, uploads, canContinue, stepIndex, next, back, submit, discardDraft };
}
