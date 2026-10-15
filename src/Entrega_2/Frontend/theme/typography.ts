import type { TextStyle } from 'react-native';

type Weight = NonNullable<TextStyle['fontWeight']>;

interface TypeStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: Weight;
  letterSpacing?: number;
}

/**
 * Hierarquia tipográfica única do app. Não crie tamanhos arbitrários nos componentes.
 * A hierarquia vem de tamanho e cor; peso 700 só em títulos de tela e números de destaque.
 * Os tamanhos escalam com a fonte dinâmica do sistema (Text sem allowFontScaling=false).
 */
export const typography = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  /** Título de tela. */
  h1: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.3 },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -0.2 },
  /** Título de seção. */
  h3: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  /** Título de componente. */
  h4: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  bodySmall: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  bodySmallStrong: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  /** Rótulo curto de grupo/campo (sem caixa alta por padrão). */
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.2 },
  /** Rótulo das abas da barra inferior. */
  tab: { fontSize: 11, lineHeight: 14, fontWeight: '500' },
  mono: { fontSize: 11, lineHeight: 16, fontWeight: '400' },
  button: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  buttonSmall: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  input: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  metric: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -0.3 },
  metricLarge: { fontSize: 32, lineHeight: 38, fontWeight: '600', letterSpacing: -0.6 },
} as const satisfies Record<string, TypeStyle>;

export type TypographyVariant = keyof typeof typography;
