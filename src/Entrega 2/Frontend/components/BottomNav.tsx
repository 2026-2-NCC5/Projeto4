import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOptionalAssistant } from '../features/assistant/hooks/useAssistant';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { TAB_LABELS, type TabKey } from '../navigation/routes';
import { haptics } from '../services/haptics';
import { makeStyles, NATIVE_DRIVER, useTheme } from '../theme';

import { AppText } from './ui/AppText';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface Tab {
  key: TabKey;
  label: string;
  icon: IconName;
  activeIcon: IconName;
}

export const NAV_TABS: Tab[] = [
  { key: 'home', label: TAB_LABELS.home, icon: 'home-outline', activeIcon: 'home' },
  { key: 'academic', label: TAB_LABELS.academic, icon: 'school-outline', activeIcon: 'school' },
  { key: 'assistant', label: TAB_LABELS.assistant, icon: 'sparkles-outline', activeIcon: 'sparkles' },
  { key: 'services', label: TAB_LABELS.services, icon: 'grid-outline', activeIcon: 'grid' },
  { key: 'profile', label: TAB_LABELS.profile, icon: 'person-outline', activeIcon: 'person' },
];

interface BottomNavProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  /** Toque longo no botão central: falar com o ASA sobre a tela atual (overlay). */
  onAssistantLongPress?: () => void;
}

const useStyles = makeStyles((theme) => ({
  wrapper: { position: 'absolute', left: 14, right: 14, zIndex: 100 },
  navbar: { width: '100%', maxWidth: 600, alignSelf: 'center', minHeight: 74, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.nav.background, borderRadius: theme.radius.xxl, paddingHorizontal: theme.spacing.xs, paddingVertical: 7, borderWidth: 1, borderColor: theme.colors.nav.border, ...theme.shadows.nav },
  item: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center' },
  iconContainer: { width: 46, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { marginTop: 3, textAlign: 'center' },
  assistantButton: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.nav.prominent, marginTop: -30, borderWidth: 4, borderColor: theme.colors.nav.prominentBorder, ...theme.shadows.assistantGlow },
  assistantButtonActive: { backgroundColor: theme.colors.nav.prominentActive },
  halo: { position: 'absolute', width: 74, height: 74, borderRadius: 37, backgroundColor: theme.colors.assistant.glow, top: -38 },
}));

export function BottomNav({ active, onChange, onAssistantLongPress }: BottomNavProps) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  return (
    <View style={[styles.wrapper, { bottom: Math.max(14, insets.bottom + 6), pointerEvents: 'box-none' }]}>
      <View style={styles.navbar} accessibilityRole="tablist">
        {NAV_TABS.map((tab) => (
          <NavItem key={tab.key} tab={tab} selected={active === tab.key} prominent={tab.key === 'assistant'} onPress={() => onChange(tab.key)} onLongPress={tab.key === 'assistant' ? onAssistantLongPress : undefined} />
        ))}
      </View>
    </View>
  );
}

interface NavItemProps {
  tab: Tab;
  selected: boolean;
  prominent: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

function NavItem({ tab, selected, prominent, onPress, onLongPress }: NavItemProps) {
  const theme = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const assistant = useOptionalAssistant();
  const [scale] = useState(() => new Animated.Value(1));
  const [halo] = useState(() => new Animated.Value(0));
  const accessibilityLabel = `${tab.label}, aba`;

  const assistantBusy = prominent && assistant ? assistant.state !== 'idle' && assistant.state !== 'offline' && assistant.state !== 'wake-word-listening' : false;
  const wakeListening = prominent && assistant?.wakeWord.status === 'listening';

  useEffect(() => {
    if (!prominent) return undefined;
    if (reduceMotion || (!assistantBusy && !wakeListening)) {
      halo.stopAnimation();
      halo.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(halo, { toValue: 1, duration: assistantBusy ? 700 : 1600, easing: theme.motion.easing.gentle, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(halo, { toValue: 0, duration: assistantBusy ? 700 : 1600, easing: theme.motion.easing.gentle, useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [assistantBusy, wakeListening, halo, prominent, reduceMotion, theme.motion.easing.gentle]);

  const press = (toValue: number) => {
    if (reduceMotion) return;
    Animated.spring(scale, { toValue, useNativeDriver: NATIVE_DRIVER, ...theme.motion.spring.press }).start();
  };

  if (prominent) {
    return (
      <View style={styles.item}>
        <Animated.View style={[styles.halo, { opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0, 0.7] }), transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.15] }) }], pointerEvents: 'none' }]} />
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected }}
          accessibilityLabel={accessibilityLabel}
          accessibilityHint="Abre o Assistente ASA. Toque e segure para falar agora"
          onPress={() => {
            haptics.selection();
            onPress();
          }}
          onLongPress={onLongPress}
          delayLongPress={280}
          onPressIn={() => press(theme.motion.scale.pressedStrong)}
          onPressOut={() => press(1)}
          testID={`tab-${tab.key}`}
        >
          <Animated.View style={[styles.assistantButton, selected && styles.assistantButtonActive, { transform: [{ scale }] }]}>
            <Ionicons name={selected ? tab.activeIcon : tab.icon} size={26} color={theme.colors.text.onPrimary} />
          </Animated.View>
        </Pressable>
        <AppText variant="caption" tone={selected ? 'brand' : 'muted'} numberOfLines={1} style={[styles.label, { marginTop: 2 }]}>
          {tab.label}
        </AppText>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        if (!selected) haptics.selection();
        onPress();
      }}
      onPressIn={() => press(theme.motion.scale.pressed)}
      onPressOut={() => press(1)}
      testID={`tab-${tab.key}`}
      style={styles.item}
    >
      <Animated.View style={[styles.iconContainer, selected && { backgroundColor: theme.colors.nav.activeSoft }, { transform: [{ scale }] }]}>
        <Ionicons name={selected ? tab.activeIcon : tab.icon} size={22} color={selected ? theme.colors.nav.active : theme.colors.nav.inactive} />
      </Animated.View>
      <AppText variant="caption" numberOfLines={1} style={[styles.label, { color: selected ? theme.colors.nav.active : theme.colors.nav.inactive, fontWeight: selected ? '800' : '600' }]}>
        {tab.label}
      </AppText>
    </Pressable>
  );
}
