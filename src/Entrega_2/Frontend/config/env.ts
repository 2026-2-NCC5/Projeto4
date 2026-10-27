import Constants from 'expo-constants';

import { DEFAULT_API_PORT } from './services';

const DEFAULT_API_URL = `http://localhost:${DEFAULT_API_PORT}`;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/** Extrai o host (sem porta) de um hostUri do Metro, ex.: "192.168.0.10:8081" → "192.168.0.10". */
export function hostFromHostUri(hostUri: string | null | undefined): string | null {
  if (!hostUri) return null;
  const withoutScheme = hostUri.replace(/^[a-z]+:\/\//i, '');
  const hostPart = withoutScheme.split('/')[0] ?? '';
  // IPv6 entre colchetes: "[::1]:8081"
  const ipv6 = hostPart.match(/^\[(.+)\](?::\d+)?$/);
  if (ipv6?.[1]) return `[${ipv6[1]}]`;
  const host = hostPart.split(':')[0] ?? '';
  return host.length > 0 ? host : null;
}

export interface ResolveApiBaseUrlOptions {
  envUrl?: string | undefined;
  hostUri?: string | null | undefined;
  port?: number;
  /** build de desenvolvimento (Metro). Em release não existe API local para onde cair. */
  isDevelopment?: boolean;
}

/**
 * Resolve a URL base da API:
 * 1. EXPO_PUBLIC_API_URL (override explícito; obrigatório em builds de release, ex.: a URL da Vercel);
 * 2. só em desenvolvimento: host do Metro (Constants.expoConfig.hostUri) na porta padrão da API — permite
 *    que o Expo Go no celular alcance a API rodando na mesma máquina do Metro;
 * 3. só em desenvolvimento: http://localhost:3000.
 * Release sem EXPO_PUBLIC_API_URL → '' (o apiClient recusa com erro claro em vez de chamar o localhost do aparelho).
 */
export function resolveApiBaseUrl(options: ResolveApiBaseUrlOptions = {}): string {
  const envUrl = options.envUrl?.trim();
  if (envUrl) return trimTrailingSlash(envUrl);
  if (options.isDevelopment === false) return '';

  const host = hostFromHostUri(options.hostUri);
  const port = options.port ?? DEFAULT_API_PORT;
  if (host) return `http://${host}:${port}`;

  return DEFAULT_API_URL;
}

function readHostUri(): string | null {
  const expoConfig = Constants.expoConfig as { hostUri?: string } | null | undefined;
  return expoConfig?.hostUri ?? null;
}

export const API_BASE_URL: string = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: readHostUri(),
  isDevelopment: typeof __DEV__ === 'undefined' ? true : __DEV__,
});

export const env = {
  API_BASE_URL,
} as const;
