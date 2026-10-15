import React, { useEffect, useState } from 'react';
import { Animated, Pressable, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion } from '../hooks/useReducedMotion';
import { haptics } from '../services/haptics';
import { makeStyles, NATIVE_DRIVER, useTheme } from '../theme';

import { AppText } from './ui/AppText';

export interface SegmentOption<K extends string> {
  key: K;
  label: string;
}

interface SegmentedControlProps<K extends string> {
  options: SegmentOption<K>[];
  value: K;
  onChange: (key: K) => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const TRACK_PADDING = 2;

const useStyles = makeStyles((theme) => ({
  track: { flexDirection: 'row', backgroundColor: theme.colors.control.segmentTrack, borderRadius: theme.radius.md, padding: TRACK_PADDING, position: 'relative' },
  thumb: { position: 'absolute', top: TRACK_PADDING, bottom: TRACK_PADDING, borderRadius: theme.radius.md - TRACK_PADDING, backgroundColor: theme.colors.control.segmentActive, borderWidth: 1, borderColor: theme.colors.border.subtle, ...theme.shadows.sm },
  item: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.xxs },
  pressed: { opacity: 0.7 },
}));

const ITEM_HIT_SLOP = { top: 4, bottom: 4 } as const;

/** Abas segmentadas com indicador deslizante (transform animado no native driver, 200 ms, sem rebote). */
export function SegmentedControl<K extends string>({ options, value, onChange, accessibilityLabel, style }: SegmentedControlProps<K>) {
  const theme = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((option) => option.key === value));
  const [position] = useState(() => new Animated.Value(index));

  useEffect(() => {
    if (reduceMotion) {
      position.setValue(index);
      return;
    }
    Animated.timing(position, { toValue: index, duration: theme.motion.duration.base, easing: theme.motion.easing.standard, useNativeDriver: NATIVE_DRIVER }).start();
  }, [index, position, reduceMotion, theme.motion.duration.base, theme.motion.easing.standard]);

  const segmentWidth = options.length > 0 ? (width - TRACK_PADDING * 2) / options.length : 0;
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View style={[styles.track, style]} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} onLayout={onLayout}>
      {segmentWidth > 0 ? (
        <Animated.View style={[styles.thumb, { width: segmentWidth, left: TRACK_PADDING, transform: [{ translateX: Animated.multiply(position, segmentWidth) }], pointerEvents: 'none' }]} />
      ) : null}
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            hitSlop={ITEM_HIT_SLOP}
            onPress={() => {
              if (!selected) haptics.selection();
              onChange(option.key);
            }}
            style={({ pressed }) => [styles.item, pressed && !selected && styles.pressed]}
          >
            <AppText variant="bodySmallStrong" tone={selected ? 'primary' : 'secondary'} numberOfLines={1}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
