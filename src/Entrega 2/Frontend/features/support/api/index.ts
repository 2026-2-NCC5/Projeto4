import { SUPPORT } from '../config';

import { httpSupportApi } from './httpSupportApi';
import { createMockSupportApi } from './mockSupportApi';
import type { SupportApi } from './types';

let current: SupportApi | null = null;

/** API do Atendimento em uso: a real ou a de demonstração (EXPO_PUBLIC_USE_MOCK_TICKETS=true). */
export function getSupportApi(): SupportApi {
  if (!current) current = SUPPORT.USE_MOCK ? createMockSupportApi() : httpSupportApi;
  return current;
}

/** Substitui a implementação (testes e previews). `null` volta ao padrão. */
export function setSupportApi(api: SupportApi | null): void {
  current = api;
}

export { createMockSupportApi, httpSupportApi };
export type { ListTicketsParams, SupportApi } from './types';
