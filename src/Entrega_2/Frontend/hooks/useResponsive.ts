import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

/** Largura de referência do layout (iPhone 14/15 e a maioria dos Android médios). */
const BASE_WIDTH = 390;
const MIN_SCALE = 0.86;
const MAX_SCALE = 1.12;
/** Margem lateral base das telas (espelha `spacing.screen`). */
const BASE_GUTTER = 20;
/** Largura máxima do conteúdo em tablets/paisagem larga (linhas de texto continuam legíveis). */
const CONTENT_MAX_WIDTH = 720;
/** Abaixo desta altura (celular em paisagem, teclado aberto no Android) as telas usam layout compacto. */
const SHORT_HEIGHT = 560;

export interface Responsive {
  width: number;
  height: number;
  /** Fator de escala limitado (0.86–1.12) — nunca explode em tablets nem encolhe demais. */
  scale: number;
  /** Telas estreitas (< 360 dp): menos colunas e tipografia menor. */
  isCompact: boolean;
  /** Tablets / paisagem larga (≥ 600 dp): conteúdo centralizado com largura máxima. */
  isWide: boolean;
  /** Paisagem (largura maior que a altura). */
  isLandscape: boolean;
  /** Altura curta (< 560 dp): elementos decorativos encolhem e barras fixas ficam em uma linha. */
  isShort: boolean;
  /** Largura máxima do conteúdo (undefined em telefones: ocupa toda a largura). */
  contentMaxWidth: number | undefined;
  /** Margem lateral das telas, escalada pela largura. */
  gutter: number;
  /** Colunas de grades de cards/atalhos (1 em telefones, 2 em tablets). */
  columns: 1 | 2;
  /** Escala um tamanho de fonte/ícone pela largura da tela (arredondado). */
  fs: (size: number) => number;
  /** Escala um espaçamento pela largura da tela (arredondado). */
  sp: (size: number) => number;
}

/**
 * Tipografia e espaçamentos responsivos à largura da janela (portrait/landscape, tablets, telas
 * pequenas). Complementa a fonte dinâmica do sistema — não a substitui.
 */
export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  return useMemo(() => {
    const raw = width / BASE_WIDTH;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));
    const round = (value: number) => Math.round(value * 2) / 2;
    const isWide = width >= 600;
    const sp = (size: number) => round(size * scale);
    return {
      width,
      height,
      scale,
      isCompact: width < 360,
      isWide,
      isLandscape: width > height,
      isShort: height < SHORT_HEIGHT,
      contentMaxWidth: isWide ? CONTENT_MAX_WIDTH : undefined,
      gutter: sp(BASE_GUTTER),
      columns: isWide ? 2 : 1,
      fs: (size: number) => round(size * scale),
      sp,
    };
  }, [width, height]);
}
