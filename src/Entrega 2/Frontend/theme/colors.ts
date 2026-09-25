import { brandPalette as p } from './palette';

/** Cores semânticas do ASA Conecta. Light e Dark são projetados separadamente (não invertidos). */
export interface ThemeColors {
  brand: {
    /** Verde ASA — ações e destaques. */
    primary: string;
    primaryStrong: string;
    primarySoft: string;
    /** Verde institucional FECAP — superfícies de marca e fundos escuros. */
    secondary: string;
    secondaryStrong: string;
    /** Roxo ASA — apoio (assistente, tags de IA). */
    accent: string;
    accentSoft: string;
    /** Amarelo ASA — apenas acento (nunca texto sobre fundo claro). */
    highlight: string;
    highlightSoft: string;
  };
  background: {
    primary: string;
    secondary: string;
    elevated: string;
    /** Fundo escuro de marca (hero, assistente). */
    inverse: string;
    /** Escurecimento por trás de overlays/modais. */
    backdrop: string;
  };
  surface: {
    primary: string;
    secondary: string;
    muted: string;
    /** Vidro translúcido (glassmorphism com moderação). */
    glass: string;
    glassBorder: string;
    /** Superfície sobre fundo inverso. */
    onInverse: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    placeholder: string;
    inverse: string;
    inverseMuted: string;
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
    primary: string;
    secondary: string;
    glow: string;
    /** Superfície da experiência do assistente (overlay, cards); clara no tema claro. */
    surface: string;
    surfaceElevated: string;
    onSurface: string;
    onSurfaceMuted: string;
    /** Paradas do gradiente do núcleo do orb (de dentro para fora). */
    core: readonly [string, string, string, string];
    aurora: readonly [string, string, string];
    particle: string;
    attention: string;
    error: string;
  };
  nav: {
    background: string;
    border: string;
    active: string;
    inactive: string;
    activeSoft: string;
    /** Botão central do assistente. */
    prominent: string;
    prominentActive: string;
    prominentBorder: string;
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
    /** Balão do estudante (escuro, à direita). */
    userBubble: string;
    userText: string;
    userTextMuted: string;
    /** Área da resposta do assistente (sem balão; texto corrido). */
    assistantText: string;
    assistantAccent: string;
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
  /** Fundo "aurora": gradiente radial roxo → verde (cores do logo ASA), de dentro para fora. */
  aurora: {
    hero: readonly [string, string, string, string, string, string, string];
    subtle: readonly [string, string, string, string];
    /** Cor de foco dos campos de autenticação (acento roxo do logo). */
    focus: string;
  };
}

export const lightColors: ThemeColors = {
  brand: {
    primary: p.asa.green,
    primaryStrong: p.asa.greenDark,
    primarySoft: p.asa.greenSoft,
    secondary: p.fecap.green,
    secondaryStrong: p.fecap.greenDeep,
    accent: p.asa.purple,
    accentSoft: p.asa.purpleSoft,
    highlight: p.asa.yellow,
    highlightSoft: p.asa.yellowSoft,
  },
  background: {
    primary: p.neutral.paper,
    secondary: p.neutral.cloud,
    elevated: p.neutral.white,
    inverse: p.fecap.green,
    backdrop: 'rgba(1, 31, 24, 0.55)',
  },
  surface: {
    primary: p.neutral.white,
    secondary: p.neutral.snow,
    muted: p.neutral.cloud,
    glass: 'rgba(255, 255, 255, 0.78)',
    glassBorder: 'rgba(255, 255, 255, 0.9)',
    onInverse: 'rgba(255, 255, 255, 0.10)',
  },
  text: {
    primary: p.neutral.ink,
    secondary: p.neutral.slate,
    muted: p.neutral.mist,
    placeholder: '#98A39F',
    inverse: p.neutral.white,
    inverseMuted: 'rgba(255, 255, 255, 0.76)',
    onPrimary: p.neutral.white,
    link: '#00735A',
  },
  border: {
    subtle: p.neutral.lineSoft,
    default: p.neutral.line,
    strong: '#B9C7C1',
    focus: p.asa.green,
  },
  status: {
    success: p.status.success,
    successSoft: '#E5F7EE',
    successText: '#146B45',
    warning: p.status.warning,
    warningSoft: '#FFF6DB',
    warningText: '#6B4E00',
    error: p.status.error,
    errorSoft: '#FDECEC',
    errorText: '#B42318',
    info: p.status.info,
    infoSoft: '#EAF2FE',
    infoText: '#1D4ED8',
  },
  assistant: {
    primary: p.asa.green,
    secondary: p.asa.purple,
    glow: 'rgba(0, 171, 126, 0.38)',
    surface: p.neutral.white,
    surfaceElevated: p.asa.greenSoft,
    onSurface: p.neutral.ink,
    onSurfaceMuted: p.neutral.slate,
    core: [p.asa.greenMist, p.asa.green, p.asa.greenDark, p.fecap.green],
    aurora: [p.asa.greenMist, p.asa.greenBright, p.asa.purpleBright],
    particle: p.asa.greenMist,
    attention: p.status.warning,
    error: '#F2A65A',
  },
  nav: {
    background: p.neutral.white,
    border: p.neutral.lineSoft,
    active: p.asa.greenDark,
    inactive: '#8C9A95',
    activeSoft: p.asa.greenSoft,
    prominent: p.asa.greenDark,
    prominentActive: p.fecap.green,
    prominentBorder: p.neutral.white,
  },
  control: {
    trackOff: p.neutral.line,
    trackOn: p.asa.green,
    thumb: p.neutral.white,
    segmentTrack: '#E8EEEB',
    segmentActive: p.neutral.white,
    inputBackground: p.neutral.white,
    inputBorder: p.neutral.line,
    disabled: '#C5CECB',
    disabledText: '#5F6B67',
  },
  skeleton: {
    base: '#E6EDEA',
    highlight: '#F3F7F5',
  },
  chat: {
    userBubble: p.fecap.green,
    userText: p.neutral.white,
    userTextMuted: 'rgba(255, 255, 255, 0.72)',
    assistantText: p.neutral.ink,
    assistantAccent: p.asa.greenDark,
    inputBackground: p.neutral.white,
    inputBorder: p.neutral.line,
    inputBorderFocus: p.asa.green,
    chipBackground: p.neutral.white,
    chipBorder: p.neutral.line,
    send: p.asa.greenDark,
    sendIcon: p.neutral.white,
    mic: p.neutral.ink,
    micIcon: p.neutral.white,
  },
  aurora: {
    hero: ['#E9DFFF', '#E3E1FB', '#DDE9F4', '#D8F1EC', '#E4F6F0', '#EEF6F2', p.neutral.paper],
    subtle: ['rgba(132, 93, 242, 0.16)', 'rgba(0, 171, 126, 0.12)', 'rgba(0, 171, 126, 0.04)', 'rgba(244, 247, 246, 0)'],
    focus: p.asa.purple,
  },
};

export const darkColors: ThemeColors = {
  brand: {
    primary: p.asa.greenBright,
    primaryStrong: p.asa.green,
    primarySoft: 'rgba(43, 196, 150, 0.16)',
    secondary: '#0F3A2E',
    secondaryStrong: p.fecap.green,
    accent: p.asa.purpleBright,
    accentSoft: 'rgba(164, 139, 255, 0.18)',
    highlight: p.asa.yellow,
    highlightSoft: 'rgba(255, 222, 51, 0.16)',
  },
  background: {
    primary: p.neutral.night,
    secondary: p.neutral.night2,
    elevated: p.neutral.night3,
    inverse: '#041A14',
    backdrop: 'rgba(0, 0, 0, 0.62)',
  },
  surface: {
    primary: p.neutral.night3,
    secondary: p.neutral.night4,
    muted: p.neutral.night5,
    glass: 'rgba(20, 38, 34, 0.78)',
    glassBorder: 'rgba(255, 255, 255, 0.08)',
    onInverse: 'rgba(255, 255, 255, 0.08)',
  },
  text: {
    primary: '#F1F6F4',
    secondary: '#B6C6C0',
    muted: '#86988F',
    placeholder: '#6E807A',
    inverse: p.neutral.white,
    inverseMuted: 'rgba(255, 255, 255, 0.72)',
    onPrimary: '#04231B',
    link: p.asa.greenBright,
  },
  border: {
    subtle: '#223832',
    default: '#2C463F',
    strong: '#3B5A51',
    focus: p.asa.greenBright,
  },
  status: {
    success: p.status.successBright,
    successSoft: 'rgba(63, 203, 138, 0.16)',
    successText: '#8FE3B8',
    warning: p.status.warningBright,
    warningSoft: 'rgba(255, 201, 60, 0.16)',
    warningText: '#FFD978',
    error: p.status.errorBright,
    errorSoft: 'rgba(240, 110, 110, 0.16)',
    errorText: '#FFA3A3',
    info: p.status.infoBright,
    infoSoft: 'rgba(127, 174, 255, 0.16)',
    infoText: '#B3CDFF',
  },
  assistant: {
    primary: p.asa.greenBright,
    secondary: p.asa.purpleBright,
    glow: 'rgba(43, 196, 150, 0.42)',
    surface: '#07201A',
    surfaceElevated: '#0C2E25',
    onSurface: p.neutral.white,
    onSurfaceMuted: '#A9CFC1',
    core: [p.asa.greenMist, p.asa.greenBright, p.asa.green, '#052E24'],
    aurora: [p.asa.greenMist, p.asa.greenBright, p.asa.purpleBright],
    particle: p.asa.greenMist,
    attention: p.status.warningBright,
    error: '#F2A65A',
  },
  nav: {
    background: 'rgba(20, 38, 34, 0.96)',
    border: '#223832',
    active: p.asa.greenBright,
    inactive: '#7F918A',
    activeSoft: 'rgba(43, 196, 150, 0.16)',
    prominent: p.asa.green,
    prominentActive: p.asa.greenBright,
    prominentBorder: p.neutral.night3,
  },
  control: {
    trackOff: '#2C463F',
    trackOn: p.asa.greenBright,
    thumb: p.neutral.white,
    segmentTrack: '#1A2F2A',
    segmentActive: '#26403A',
    inputBackground: p.neutral.night4,
    inputBorder: '#2C463F',
    disabled: '#2C463F',
    disabledText: '#7F918A',
  },
  skeleton: {
    base: '#1C302B',
    highlight: '#26403A',
  },
  chat: {
    userBubble: '#213933',
    userText: '#F1F6F4',
    userTextMuted: 'rgba(241, 246, 244, 0.7)',
    assistantText: '#F1F6F4',
    assistantAccent: p.asa.greenBright,
    inputBackground: '#142622',
    inputBorder: '#2C463F',
    inputBorderFocus: p.asa.greenBright,
    chipBackground: '#142622',
    chipBorder: '#2C463F',
    send: p.asa.green,
    sendIcon: '#04231B',
    mic: '#F1F6F4',
    micIcon: '#0B1512',
  },
  aurora: {
    hero: ['#2A1C5C', '#241E52', '#182C3F', '#0F3A32', '#0C2E27', '#0C201C', p.neutral.night],
    subtle: ['rgba(164, 139, 255, 0.22)', 'rgba(43, 196, 150, 0.16)', 'rgba(43, 196, 150, 0.05)', 'rgba(11, 21, 18, 0)'],
    focus: p.asa.purpleBright,
  },
};
