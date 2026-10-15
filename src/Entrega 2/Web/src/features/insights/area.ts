import { useLocation } from 'react-router';

/**
 * Área que montou a página (as mesmas telas existem em /asa e /admin). A administração não abre conteúdo
 * de chamados, então toda ligação interna é montada a partir da área da rota — nunca fixa em /asa.
 */
export type InsightsArea = 'asa' | 'admin';

export interface InsightsAreaInfo {
  area: InsightsArea;
  /** prefixo das rotas da área ("/asa" ou "/admin") */
  base: '/asa' | '/admin';
  /** link para uma página da mesma área: `to('base-conhecimento')` → "/admin/base-conhecimento" */
  to: (path: string) => string;
}

export function areaFromPath(pathname: string): InsightsArea {
  return pathname === '/admin' || pathname.startsWith('/admin/') ? 'admin' : 'asa';
}

export function useInsightsArea(): InsightsAreaInfo {
  const { pathname } = useLocation();
  const area = areaFromPath(pathname);
  const base = area === 'admin' ? '/admin' : '/asa';
  return { area, base, to: (path: string) => `${base}/${path.replace(/^\/+/, '')}` };
}
