import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View, type LayoutChangeEvent } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { SUPPORT_MOTION, useSupportMotion } from '../../features/support/motion';
import { haptics } from '../../services/haptics';
import { makeStyles, useTheme } from '../../theme';

export interface ChipOption<K extends string> {
  key: K;
  label: string;
  /** contador opcional (ex.: chamados aguardando você) */
  count?: number;
}

interface FilterChipsProps<K extends string> {
  options: readonly ChipOption<K>[];
  value: K;
  onChange: (key: K) => void;
  accessibilityLabel: string;
  /** conteúdo extra no fim da faixa (ex.: botão "Filtros") */
  trailing?: React.ReactNode;
  testID?: string;
}

interface Layout {
  x: number;
  width: number;
}

const CHIP_HEIGHT = 36;

const useStyles = makeStyles((theme) => ({
  scroll: { marginHorizontal: -theme.spacing.xxs },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, paddingHorizontal: theme.spacing.xxs, paddingVertical: theme.spacing.xxs },
  indicator: { position: 'absolute', top: theme.spacing.xxs, height: CHIP_HEIGHT, borderRadius: theme.radius.pill, backgroundColor: theme.colors.brand.primarySoft },
  chip: { minHeight: CHIP_HEIGHT, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.pill, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  count: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
}));

/**
 * Chips compactos com indicador que desliza até o filtro escolhido (≈220 ms, ease-out) e troca suave de cor.
 * Cada chip tem área de toque ≥ 44 px (hitSlop) e é anunciado como aba.
 */
export function FilterChips<K extends string>({ options, value, onChange, accessibilityLabel, trailing, testID }: FilterChipsProps<K>) {
  const styles = useStyles();
  const motion = useSupportMotion();
  const scrollRef = useRef<ScrollView>(null);
  const [layouts, setLayouts] = useState<Partial<Record<K, Layout>>>({});
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const ready = useSharedValue(0);
  const target = layouts[value];

  useEffect(() => {
    if (!target) {
      ready.set(0);
      return;
    }
    if (ready.get() === 0 || motion.reduce) {
      x.set(target.x);
      width.set(target.width);
      ready.set(1);
    } else {
      x.set(withTiming(target.x, motion.timing(SUPPORT_MOTION.duration.normal)));
      width.set(withTiming(target.width, motion.timing(SUPPORT_MOTION.duration.normal)));
    }
    scrollRef.current?.scrollTo({ x: Math.max(0, target.x - 24), animated: !motion.reduce });
  }, [motion, ready, target, width, x]);

  const indicator = useAnimatedStyle(() => ({ opacity: ready.get(), width: width.get(), transform: [{ translateX: x.get() }] }));

  return (
    <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.row} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} testID={testID}>
      <Animated.View style={[styles.indicator, indicator, { pointerEvents: 'none' }]} />
      {options.map((option) => (
        <Chip
          key={option.key}
          option={option}
          selected={option.key === value}
          onPress={() => {
            if (option.key !== value) haptics.selection();
            onChange(option.key);
          }}
          onLayout={(event) => {
            const { x: left, width: chipWidth } = event.nativeEvent.layout;
            setLayouts((current) => {
              const previous = current[option.key];
              return previous && previous.x === left && previous.width === chipWidth ? current : { ...current, [option.key]: { x: left, width: chipWidth } };
            });
          }}
          testID={testID ? `${testID}-${option.key}` : undefined}
        />
      ))}
      {trailing}
    </ScrollView>
  );
}

interface ChipProps<K extends string> {
  option: ChipOption<K>;
  selected: boolean;
  onPress: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
  testID?: string | undefined;
}

function Chip<K extends string>({ option, selected, onPress, onLayout, testID }: ChipProps<K>) {
  const theme = useTheme();
  const styles = useStyles();
  const motion = useSupportMotion();
  const selection = useSharedValue(selected ? 1 : 0);
  const pressed = useSharedValue(1);
  const { colors } = theme;

  useEffect(() => {
    selection.set(withTiming(selected ? 1 : 0, motion.timing(SUPPORT_MOTION.duration.normal)));
  }, [motion, selected, selection]);

  const muted = colors.text.secondary;
  const active = colors.brand.primaryStrong;
  const border = colors.border.default;
  const soft = colors.brand.primarySoft;
  const label = useAnimatedStyle(() => ({ color: interpolateColor(selection.get(), [0, 1], [muted, active]) }));
  const container = useAnimatedStyle(() => ({ borderColor: interpolateColor(selection.get(), [0, 1], [border, soft]), transform: [{ scale: pressed.get() }] }));
  const count = option.count ?? 0;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={count > 0 ? `${option.label}, ${count}` : option.label}
      onPress={onPress}
      onPressIn={() => pressed.set(motion.reduce ? 1 : withSpring(SUPPORT_MOTION.pressedScale, motion.spring))}
      onPressOut={() => pressed.set(motion.reduce ? 1 : withSpring(1, motion.spring))}
      onLayout={onLayout}
      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
      testID={testID}
    >
      <Animated.View style={[styles.chip, container]}>
        <Animated.Text style={[theme.typography.bodySmallStrong, label]} numberOfLines={1}>
          {option.label}
        </Animated.Text>
        {count > 0 ? (
          <View style={[styles.count, { backgroundColor: selected ? colors.brand.primaryStrong : colors.surface.muted }]}>
            <Animated.Text style={[theme.typography.caption, { fontWeight: '600', color: selected ? colors.text.onPrimary : colors.text.secondary }]}>{count > 99 ? '99+' : count}</Animated.Text>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}
