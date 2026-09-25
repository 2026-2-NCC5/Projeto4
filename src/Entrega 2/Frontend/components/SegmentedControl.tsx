import React, { useEffect, useState } from 'react';
import { Animated, Pressable, View, type LayoutChangeEvent } from 'react-native';

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
}

const useStyles = makeStyles((theme) => ({
  track: { flexDirection: 'row', backgroundColor: theme.colors.control.segmentTrack, borderRadius: theme.radius.lg - 1, padding: theme.spacing.xxs, marginTop: theme.spacing.xl, position: 'relative' },
  thumb: { position: 'absolute', top: theme.spacing.xxs, bottom: theme.spacing.xxs, borderRadius: theme.radius.md - 2, backgroundColor: theme.colors.control.segmentActive, ...theme.shadows.sm },
  item: { flex: 1, minHeight: theme.minTouchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.md - 2, paddingHorizontal: 4 },
  pressed: { opacity: 0.8 },
}));

/** Controle segmentado com indicador deslizante (transform animado no native driver). */
export function SegmentedControl<K extends string>({ options, value, onChange, accessibilityLabel }: SegmentedControlProps<K>) {
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
    Animated.spring(position, { toValue: index, useNativeDriver: NATIVE_DRIVER, friction: 9, tension: 120 }).start();
  }, [index, position, reduceMotion]);

  const segmentWidth = options.length > 0 ? (width - theme.spacing.xxs * 2) / options.length : 0;
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View style={styles.track} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} onLayout={onLayout}>
      {segmentWidth > 0 ? (
        <Animated.View
          style={[styles.thumb, { width: segmentWidth, left: theme.spacing.xxs, transform: [{ translateX: Animated.multiply(position, segmentWidth) }], pointerEvents: 'none' }]}
        />
      ) : null}
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => {
              if (!selected) haptics.selection();
              onChange(option.key);
            }}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <AppText variant="bodySmallStrong" tone={selected ? 'primary' : 'muted'} numberOfLines={1}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
