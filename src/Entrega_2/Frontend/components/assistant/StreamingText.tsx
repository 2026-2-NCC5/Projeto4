import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { NATIVE_DRIVER, useTheme, type TypographyVariant } from '../../theme';
import { AppText, toneColor, type TextTone } from '../ui/AppText';

/** Atraso entre caracteres (ms) e duração do fade de cada um — mesmos valores do padrão "Chat V1". */
export const STREAMING_CHAR_DELAY_MS = 18;
export const STREAMING_FADE_DURATION_MS = 250;
/** Acima deste tamanho a animação passa a ser por palavra (mantém 60 FPS em respostas longas). */
export const STREAMING_CHAR_MODE_MAX_LENGTH = 160;
const WORD_DELAY_MS = 42;
/** Tempo máximo aproximado da revelação completa (respostas muito longas aceleram). */
const MAX_TOTAL_MS = 4500;

export interface StreamingTextProps {
  text: string;
  /** false → texto completo imediatamente (turnos antigos, "Reduzir movimento", testes). Padrão: true. */
  animate?: boolean;
  variant?: TypographyVariant;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  /** Chamado uma vez quando o texto inteiro ficou visível (também quando não anima). */
  onComplete?: () => void;
  testID?: string;
}

interface Line {
  /** Cada palavra é um grupo que não quebra no meio; contém suas unidades (caracteres ou a palavra inteira). */
  words: string[][];
}

/** Quebra o texto em linhas → palavras → unidades animadas. Espaços viajam junto da palavra anterior. */
export function splitStreamingUnits(text: string, charMode: boolean): Line[] {
  return text.split('\n').map((line) => {
    const words = line.match(/\S+\s*|\s+/g) ?? [];
    return { words: words.map((word) => (charMode ? Array.from(word) : [word])) };
  });
}

function countUnits(lines: Line[]): number {
  return lines.reduce((total, line) => total + line.words.reduce((sum, word) => sum + word.length, 0), 0);
}

/**
 * Revelação da resposta do assistente unidade a unidade (caractere ou palavra) com fade-in, usando
 * `Animated` + native driver — cada unidade é um `Animated.Text` real (opacidade nativa), agrupado por
 * palavra para a quebra de linha continuar correta. Ao terminar, troca por um único `Text` selecionável.
 * Streaming-ready: se `text` crescer mantendo o prefixo, só as novas unidades animam.
 */
export function StreamingText({ text, animate = true, variant = 'body', tone = 'primary', style, containerStyle, onComplete, testID = 'streaming-text' }: StreamingTextProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const shouldAnimate = animate && !reduceMotion && text.length > 0;
  const charMode = text.length <= STREAMING_CHAR_MODE_MAX_LENGTH;

  const [layout, setLayout] = useState(() => {
    const lines = splitStreamingUnits(text, charMode);
    return { text, charMode, lines, values: Array.from({ length: countUnits(lines) }, () => new Animated.Value(shouldAnimate ? 0 : 1)) };
  });
  const [done, setDone] = useState(!shouldAnimate);
  const startedRef = useRef(0);
  const completeRef = useRef(onComplete);

  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);

  // Texto mudou: mantém as unidades já reveladas quando o novo texto é uma extensão do anterior.
  if (layout.text !== text) {
    const lines = splitStreamingUnits(text, charMode);
    const total = countUnits(lines);
    const extends_ = layout.charMode === charMode && text.startsWith(layout.text);
    const values = extends_ ? [...layout.values, ...Array.from({ length: Math.max(0, total - layout.values.length) }, () => new Animated.Value(shouldAnimate ? 0 : 1))] : Array.from({ length: total }, () => new Animated.Value(shouldAnimate ? 0 : 1));
    setLayout({ text, charMode, lines, values });
    setDone(!shouldAnimate);
  }

  useEffect(() => {
    if (!shouldAnimate) {
      startedRef.current = layout.values.length;
      completeRef.current?.();
      return undefined;
    }
    const pending = layout.values.slice(startedRef.current);
    if (pending.length === 0) return undefined;
    startedRef.current = layout.values.length;
    const baseDelay = layout.charMode ? STREAMING_CHAR_DELAY_MS : WORD_DELAY_MS;
    const delay = Math.max(6, Math.min(baseDelay, Math.floor(MAX_TOTAL_MS / Math.max(1, pending.length))));
    const animation = Animated.stagger(
      delay,
      pending.map((value) => Animated.timing(value, { toValue: 1, duration: STREAMING_FADE_DURATION_MS, easing: theme.motion.easing.decelerate, useNativeDriver: NATIVE_DRIVER })),
    );
    animation.start(({ finished }) => {
      if (!finished) return;
      setDone(true);
      completeRef.current?.();
    });
    return () => animation.stop();
  }, [layout, shouldAnimate, theme.motion.easing.decelerate]);

  const base = theme.typography[variant];
  const textStyle: TextStyle = { fontSize: base.fontSize, lineHeight: base.lineHeight, fontWeight: base.fontWeight, letterSpacing: 'letterSpacing' in base ? base.letterSpacing : undefined, color: toneColor(theme, tone) };

  if (done || !shouldAnimate) {
    return (
      <AppText variant={variant} tone={tone} style={style} selectable accessibilityLiveRegion="polite" testID={testID}>
        {text}
      </AppText>
    );
  }

  let index = 0;
  return (
    <View style={containerStyle} accessible accessibilityLabel={text} accessibilityLiveRegion="polite" testID={testID}>
      {layout.lines.map((line, lineIndex) => (
        <View key={lineIndex} style={[styles.line, line.words.length === 0 ? { height: base.lineHeight / 2 } : null]}>
          {line.words.map((word, wordIndex) => (
            <View key={wordIndex} style={styles.word}>
              {word.map((unit, unitIndex) => {
                const value = layout.values[index++];
                return (
                  <Animated.Text key={unitIndex} style={[textStyle, style, { opacity: value ?? 1 }]} importantForAccessibility="no" accessibilityElementsHidden>
                    {unit}
                  </Animated.Text>
                );
              })}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = {
  line: { flexDirection: 'row', flexWrap: 'wrap' } as const,
  word: { flexDirection: 'row' } as const,
};
