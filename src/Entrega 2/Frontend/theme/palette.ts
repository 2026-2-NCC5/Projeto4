/**
 * Paleta bruta da marca — extraída dos assets oficiais (assets/branding/*.svg).
 * NUNCA use estes valores diretamente em componentes: consuma as cores semânticas de `useTheme()`.
 *
 * Asa_Logo.svg   → verde #00AB7E · roxo #845DF2 · amarelo #FFDE33
 * FECAP_Logo.svg → verde institucional #023327
 */
export const brandPalette = {
  fecap: {
    green: '#023327',
    greenDeep: '#011F18',
    greenMid: '#034839',
    greenSoft: '#0B4A3B',
  },
  asa: {
    green: '#00AB7E',
    greenBright: '#2BC496',
    greenDark: '#008F69',
    greenDeep: '#00664B',
    greenSoft: '#E3F6F0',
    greenMist: '#DFF8F1',
    purple: '#845DF2',
    purpleBright: '#A48BFF',
    purpleDark: '#6A46D6',
    purpleSoft: '#EFEAFE',
    yellow: '#FFDE33',
    yellowDark: '#E6A700',
    yellowSoft: '#FFF8D6',
  },
  neutral: {
    white: '#FFFFFF',
    black: '#000000',
    ink: '#0F1F1A',
    ink2: '#1B2C27',
    slate: '#4E5F5A',
    mist: '#7A8A85',
    fog: '#A9B7B2',
    line: '#D6E0DB',
    lineSoft: '#E4ECE8',
    cloud: '#EEF3F1',
    snow: '#F6F9F8',
    paper: '#F4F7F6',
    night: '#0B1512',
    night2: '#0F1D19',
    night3: '#142622',
    night4: '#1A2F2A',
    night5: '#213933',
  },
  status: {
    success: '#1D9B62',
    successBright: '#3FCB8A',
    warning: '#E6A700',
    warningBright: '#FFC93C',
    error: '#D64545',
    errorBright: '#F06E6E',
    info: '#3B82F6',
    infoBright: '#7FAEFF',
  },
} as const;
