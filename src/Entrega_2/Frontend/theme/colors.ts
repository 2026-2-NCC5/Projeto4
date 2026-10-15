import { brandPalette as p } from './palette';

/**
 * Cores semânticas do ASA Conecta. Light e Dark são projetados separadamente (não invertidos).
 *
 * Regra de uso do verde: ele marca ação e seleção (botão principal, item ativo, links, progresso
 * saudável). Fundos são neutros; hierarquia vem de espaço, tipografia e bordas, não de cor.
 */
export interface ThemeColors {
  brand: {
    /** Verde do logo ASA — apenas marcas pequenas (orb, indicadores). Nunca como fundo de texto. */
    primary: string;
    /** Verde institucional — botão principal, item ativo, links e ícones de destaque. */
    primaryStrong: string;
    /** Estado pressionado do verde institucional. */
    primaryPressed: string;
    /** Fundo suave de seleção (item ativo, destaque discreto). */
    primarySoft: string;
    /** Verde FECAP — bloco de fundo do logo ASA (que é branco). */
    secondary: string;
  };
  background: {
    primary: string;
    secondary: string;
    elevated: string;
    /** Escurecimento por trás de overlays/modais. */
    backdrop: string;
  };
  surface: {
    primary: string;
    /** Preenchimento sutil dentro de superfícies brancas. */
    secondary: string;
    muted: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    placeholder: string;
    inverse: string;
    onPrimary: string;
    link: string;
  };
  border: {
    subtle: string;
    default: string;
    strong: string;
    focus: string;
  };
  status: {
    success: string;
    successSoft: string;
    successText: string;
    warning: string;
    warningSoft: string;
    warningText: string;
    error: string;
    errorSoft: string;
    errorText: string;
    info: string;
    infoSoft: string;
    infoText: string;
  };
  assistant: {
    /** Cor de identidade do assistente (núcleo do orb, anéis). */
    primary: string;
    /** Superfície da experiência do assistente (overlay, conversa); clara no tema claro. */
    surface: string;
    surfaceElevated: string;
    onSurface: string;
    onSurfaceMuted: string;
    /** Núcleo do orb, do centro para a borda — um único matiz, sem gradiente multicolorido. */
    core: readonly [string, string];
    /** Abstenção / validação humana. */
    attention: string;
    error: string;
  };
  nav: {
    background: string;
    border: string;
    active: string;
    inactive: string;
    /** Botão central do assistente. */
    prominent: string;
    prominentActive: string;
  };
  control: {
    trackOff: string;
    trackOn: string;
    thumb: string;
    segmentTrack: string;
    segmentActive: string;
    inputBackground: string;
    inputBorder: string;
    disabled: string;
    disabledText: string;
  };
  skeleton: {
    base: string;
    highlight: string;
  };
  /** Conversa com o assistente (balões, campo de mensagem, ações rápidas). */
  chat: {
    /** Balão do estudante (neutro, à direita). */
    userBubble: string;
    userText: string;
    userTextMuted: string;
    /** Resposta do assistente (sem balão; texto corrido). */
    assistantText: string;
    inputBackground: string;
    inputBorder: string;
    inputBorderFocus: string;
    chipBackground: string;
    chipBorder: string;
    /** Botão de enviar (com texto) e de falar (sem texto). */
    send: string;
    sendIcon: string;
    mic: string;
    micIcon: string;
  };
}

export const lightColors: ThemeColors = {
  brand: {
    primary: p.asa.green,
    primaryStrong: p.asa.deep,
    primaryPressed: p.asa.deepPressed,
    primarySoft: p.asa.soft,
    secondary: p.fecap.green,
  },
  background: {
    primary: p.neutral.paper,
    secondary: p.neutral.snow,
    elevated: p.neutral.white,
    backdrop: 'rgba(17, 19, 21, 0.45)',
  },
  surface: {
    primary: p.neutral.white,
    secondary: p.neutral.paper,
    muted: p.neutral.cloud,
  },
  text: {
    primary: p.neutral.ink,
    secondary: p.neutral.slate,
    muted: p.neutral.mist,
    placeholder: p.neutral.fog,
    inverse: p.neutral.white,
    onPrimary: p.neutral.white,
    link: p.asa.deep,
  },
  border: {
    subtle: p.neutral.lineSoft,
    default: p.neutral.line,
    strong: p.neutral.lineStrong,
    focus: p.asa.deep,
  },
  status: {
    success: p.status.success,
    successSoft: '#E9F5EE',
    successText: '#18693F',
    warning: p.status.warning,
    warningSoft: '#FBF3E3',
    warningText: '#8A5A12',
    error: p.status.error,
    errorSoft: '#FCEDEC',
    errorText: '#A93430',
    info: p.status.info,
    infoSoft: '#ECF2FB',
    infoText: '#2B579F',
  },
  assistant: {
    primary: p.asa.deep,
    surface: p.neutral.white,
    surfaceElevated: p.neutral.paper,
    onSurface: p.neutral.ink,
    onSurfaceMuted: p.neutral.slate,
    core: ['#16866A', p.asa.deep],
    attention: p.status.warning,
    error: '#D9822B',
  },
  nav: {
    background: p.neutral.white,
    border: p.neutral.line,
    active: p.asa.deep,
    inactive: p.neutral.mist,
    prominent: p.asa.deep,
    prominentActive: p.asa.deepPressed,
  },
  control: {
    trackOff: '#D5D9DD',
    trackOn: p.asa.deep,
    thumb: p.neutral.white,
    segmentTrack: p.neutral.cloud,
    segmentActive: p.neutral.white,
    inputBackground: p.neutral.white,
    inputBorder: p.neutral.line,
    disabled: '#E5E7EA',
    disabledText: p.neutral.fog,
  },
  skeleton: {
    base: p.neutral.lineSoft,
    highlight: p.neutral.paper,
  },
  chat: {
    userBubble: p.neutral.cloud,
    userText: p.neutral.ink,
    userTextMuted: p.neutral.slate,
    assistantText: p.neutral.ink,
    inputBackground: p.neutral.white,
    inputBorder: p.neutral.line,
    inputBorderFocus: p.neutral.lineStrong,
    chipBackground: p.neutral.white,
    chipBorder: p.neutral.line,
    send: p.asa.deep,
    sendIcon: p.neutral.white,
    mic: p.neutral.ink,
    micIcon: p.neutral.white,
  },
};

export const darkColors: ThemeColors = {
  brand: {
    primary: p.asa.greenBright,
    primaryStrong: '#3FBF95',
    primaryPressed: '#32A37E',
    primarySoft: 'rgba(63, 191, 149, 0.14)',
    secondary: p.fecap.green,
  },
  background: {
    primary: p.neutral.night,
    secondary: p.neutral.night2,
    elevated: p.neutral.night3,
    backdrop: 'rgba(0, 0, 0, 0.6)',
  },
  surface: {
    primary: p.neutral.night3,
    secondary: p.neutral.night4,
    muted: p.neutral.night5,
  },
  text: {
    primary: '#ECEEF0',
    secondary: '#A9AFB7',
    muted: '#8B919A',
    placeholder: '#6B717A',
    inverse: p.neutral.white,
    onPrimary: '#06231A',
    link: '#5FD0A8',
  },
  border: {
    subtle: '#25292E',
    default: '#30343A',
    strong: '#3F444B',
    focus: '#3FBF95',
  },
  status: {
    success: p.status.successBright,
    successSoft: 'rgba(76, 195, 138, 0.14)',
    successText: '#86DDB2',
    warning: p.status.warningBright,
    warningSoft: 'rgba(232, 176, 75, 0.14)',
    warningText: '#F2CD85',
    error: p.status.errorBright,
    errorSoft: 'rgba(240, 113, 107, 0.14)',
    errorText: '#F7A9A5',
    info: p.status.infoBright,
    infoSoft: 'rgba(127, 166, 232, 0.14)',
    infoText: '#B3CBF2',
  },
  assistant: {
    primary: '#3FBF95',
    surface: p.neutral.night3,
    surfaceElevated: p.neutral.night4,
    onSurface: '#ECEEF0',
    onSurfaceMuted: '#A9AFB7',
    core: ['#4FCBA1', '#2A9C77'],
    attention: p.status.warningBright,
    error: '#E89A55',
  },
  nav: {
    background: p.neutral.night2,
    border: '#25292E',
    active: '#3FBF95',
    inactive: '#8B919A',
    prominent: '#3FBF95',
    prominentActive: '#32A37E',
  },
  control: {
    trackOff: '#3F444B',
    trackOn: '#3FBF95',
    thumb: p.neutral.white,
    segmentTrack: p.neutral.night4,
    segmentActive: p.neutral.night5,
    inputBackground: p.neutral.night4,
    inputBorder: '#30343A',
    disabled: '#30343A',
    disabledText: '#8B919A',
  },
  skeleton: {
    base: p.neutral.night4,
    highlight: p.neutral.night5,
  },
  chat: {
    userBubble: p.neutral.night5,
    userText: '#ECEEF0',
    userTextMuted: '#A9AFB7',
    assistantText: '#ECEEF0',
    inputBackground: p.neutral.night4,
    inputBorder: '#30343A',
    inputBorderFocus: '#3F444B',
    chipBackground: p.neutral.night4,
    chipBorder: '#30343A',
    send: '#3FBF95',
    sendIcon: '#06231A',
    mic: '#ECEEF0',
    micIcon: p.neutral.night,
  },
};
