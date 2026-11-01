const BASE_URL = 'http://127.0.0.1:8765';

export interface LocalCollectorStatus {
  status: 'not_scanned' | 'ready' | 'not_authenticated';
  authenticated: boolean;
  pagesDiscovered?: number;
  pagesVisited: number;
  lastSyncAt: string | null;
  errors?: number;
  scan: { status: string; startedAt: string | null; finishedAt: string | null; pagesVisited?: number; errors?: number; error: string | null };
}

export interface LocalCollectorRecord {
  id: string;
  title: string;
  category: string;
  capturedAt: string;
  text: string;
  tables: Array<{ headers: string[]; rows: string[][] }>;
}

export interface LocalCollectorData {
  source: string;
  authenticatedAt: string | null;
  totalAvailable: number;
  returned: number;
  records: LocalCollectorRecord[];
}

async function request<T>(path: string, token: string, init: { method?: 'GET' | 'POST'; query?: Record<string, string> } = {}): Promise<T> {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(init.query ?? {})) url.searchParams.set(key, value);
  let response: Response;
  try {
    const requestOptions = {
      method: init.method ?? 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(init.method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      ...(init.method === 'POST' ? { body: '{}' } : {}),
      targetAddressSpace: 'loopback',
    } as RequestInit & { targetAddressSpace: 'loopback' };
    response = await fetch(url, requestOptions);
  } catch {
    throw new Error('Agente local indisponível. Inicie `fecap-portal serve` neste computador.');
  }
  const payload = await response.json().catch(() => null) as { detail?: unknown } | null;
  if (!response.ok) {
    const detail = typeof payload?.detail === 'string' ? payload.detail : null;
    throw new Error(detail ?? `O agente local respondeu com HTTP ${response.status}.`);
  }
  return payload as T;
}

export const fecapCollectorApi = {
  status: (token: string) => request<LocalCollectorStatus>('/api/v1/portal/status', token),
  startScan: (token: string) => request<{ status: string; message: string }>('/api/v1/portal/scan', token, { method: 'POST' }),
  scanStatus: (token: string) => request<LocalCollectorStatus['scan']>('/api/v1/portal/scan', token),
  data: (token: string, query?: string) => request<LocalCollectorData>('/api/v1/portal/data', token, { query: query ? { q: query } : {} }),
};
