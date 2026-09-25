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
 * Os tamanhos escalam com a fonte dinâmica do sistema (Text sem allowFontScaling=false).
 */
export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.5 },
  h1: { fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.3 },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: '800' },
  h3: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  h4: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  bodySmall: { fontSize: 13, lineHeight: 19, fontWeight: '400' },
  bodySmallStrong: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 0.9 },
  mono: { fontSize: 11, lineHeight: 16, fontWeight: '400' },
  button: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  buttonSmall: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  input: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  metric: { fontSize: 24, lineHeight: 28, fontWeight: '800', letterSpacing: -0.4 },
  metricLarge: { fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8 },
} as const satisfies Record<string, TypeStyle>;

export type TypographyVariant = keyof typeof typography;
