import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { SUPPORT_MOTION, useSupportMotion } from '../../features/support/motion';
import { haptics } from '../../services/haptics';
import { makeStyles, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { Divider } from '../ui/Divider';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface SelectRowProps {
  title: string;
  description?: string;
  icon?: IconName;
  selected: boolean;
  onPress: () => void;
  /** desenha o divisor acima (linhas agrupadas num único card) */
  divider?: boolean;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg, minHeight: 56 },
  text: { flex: 1, minWidth: 0 },
  check: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brand.primaryStrong },
  ring: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: theme.colors.border.strong },
}));

/**
 * Opção de escolha única em lista (categoria, tipo): ao selecionar, o ícone faz um scale curto, o fundo muda
 * suavemente e o check aparece com fade + scale.
 */
export function SelectRow({ title, description, icon, selected, onPress, divider = false, testID }: SelectRowProps) {
  const theme = useTheme();
  const styles = useStyles();
  const motion = useSupportMotion();
  const level = useSharedValue(selected ? 1 : 0);
  const bump = useSharedValue(1);
  const { colors } = theme;

  useEffect(() => {
    level.set(withTiming(selected ? 1 : 0, motion.timing(SUPPORT_MOTION.duration.normal)));
    if (selected && !motion.reduce) bump.set(withSequence(withTiming(1.15, { duration: SUPPORT_MOTION.duration.fast }), withSpring(1, motion.spring)));
  }, [bump, level, motion, selected]);

  const surface = colors.surface.primary;
  const soft = colors.brand.primarySoft;
  const background = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(level.get(), [0, 1], [surface, soft]) }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.get() }] }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: level.get(), transform: [{ scale: 0.6 + level.get() * 0.4 }] }));

  return (
    <View>
      {divider ? <Divider inset={icon ? theme.spacing.lg + 24 + theme.spacing.md : theme.spacing.lg} /> : null}
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={description ? `${title}. ${description}` : title}
        onPress={() => {
          if (!selected) haptics.selection();
          onPress();
        }}
        testID={testID}
      >
        <Animated.View style={[styles.row, background]}>
          {icon ? (
            <Animated.View style={[{ width: 24, alignItems: 'center' }, iconStyle]}>
              <Ionicons name={icon} size={20} color={selected ? colors.brand.primaryStrong : colors.text.secondary} />
            </Animated.View>
          ) : null}
          <View style={styles.text}>
            <AppText variant="bodyStrong" style={selected ? { color: colors.brand.primaryStrong } : null}>
              {title}
            </AppText>
            {description ? (
              <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }} numberOfLines={2}>
                {description}
              </AppText>
            ) : null}
          </View>
          <View>
            <View style={styles.ring} />
            <Animated.View style={[styles.check, { position: 'absolute' }, checkStyle]}>
              <Ionicons name="checkmark" size={14} color={colors.text.onPrimary} />
            </Animated.View>
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
}
