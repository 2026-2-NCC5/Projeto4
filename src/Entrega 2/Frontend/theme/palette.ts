/**
 * Paleta bruta da marca — extraída dos assets oficiais (assets/branding/*.svg).
 * NUNCA use estes valores diretamente em componentes: consuma as cores semânticas de `useTheme()`.
 *
 * Asa_Logo.svg   → verde #00AB7E
 * FECAP_Logo.svg → verde institucional #023327
 *
 * O verde do logo (#00AB7E) não tem contraste suficiente para texto branco (2,95:1), então ações e
 * destaques usam o verde institucional `asa.deep` — mesmo matiz do logo, mais escuro (6,3:1).
 */
export const brandPalette = {
  fecap: {
    green: '#023327',
    greenDeep: '#011F18',
  },
  asa: {
    /** Verde do logo: só em marcas pequenas (orb, indicadores). */
    green: '#00AB7E',
    greenBright: '#2BC496',
    /** Verde institucional de ação (botões, item ativo, links). */
    deep: '#0D6D53',
    deepPressed: '#09533F',
    soft: '#E8F3EE',
    purple: '#845DF2',
    purpleBright: '#A48BFF',
  },
  /** Neutros frios, sem matiz verde: o verde fica reservado para o que importa. */
  neutral: {
    white: '#FFFFFF',
    ink: '#1A1D21',
    slate: '#555B63',
    mist: '#6B717A',
    fog: '#8E949C',
    lineStrong: '#CBD0D5',
    line: '#E2E5E8',
    lineSoft: '#ECEEF0',
    cloud: '#EEF0F2',
    snow: '#F3F4F6',
    paper: '#F6F7F8',
    night: '#111315',
    night2: '#16181B',
    night3: '#1B1E22',
    night4: '#22262B',
    night5: '#2A2F35',
  },
  status: {
    success: '#1E7F4F',
    successBright: '#4CC38A',
    warning: '#B7791F',
    warningBright: '#E8B04B',
    error: '#C93C37',
    errorBright: '#F0716B',
    info: '#3468C0',
    infoBright: '#7FA6E8',
  },
} as const;
