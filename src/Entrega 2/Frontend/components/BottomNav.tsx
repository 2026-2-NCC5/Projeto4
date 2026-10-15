import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOptionalAssistant } from '../features/assistant/hooks/useAssistant';
import { navBarBottomPadding } from '../hooks/useNavBarInset';
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
  /** Toque longo no botão do assistente: falar com o ASA sobre a tela atual (overlay). */
  onAssistantLongPress?: () => void;
}

/** Diâmetro do botão do assistente (destacado, mas dentro da altura da barra). */
const ASSISTANT_SIZE = 34;

const useStyles = makeStyles((theme) => ({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: theme.colors.nav.background, borderTopWidth: 1, borderTopColor: theme.colors.nav.border },
  row: { width: '100%', maxWidth: 600, alignSelf: 'center', height: theme.spacing.navBar, flexDirection: 'row', alignItems: 'stretch' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: theme.minTouchTarget },
  iconBox: { height: ASSISTANT_SIZE, alignItems: 'center', justifyContent: 'center' },
  assistant: { width: ASSISTANT_SIZE, height: ASSISTANT_SIZE, borderRadius: ASSISTANT_SIZE / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.nav.prominent },
  assistantActive: { backgroundColor: theme.colors.nav.prominentActive },
  ring: { position: 'absolute', width: ASSISTANT_SIZE, height: ASSISTANT_SIZE, borderRadius: ASSISTANT_SIZE / 2, borderWidth: 1.5, borderColor: theme.colors.nav.prominent },
  label: { textAlign: 'center' },
  labelActive: { fontWeight: '600' },
}));

/** Barra inferior fixa: fundo branco, borda superior suave, ícone ativo verde e inativo cinza. */
export function BottomNav({ active, onChange, onAssistantLongPress }: BottomNavProps) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  return (
    <View style={[styles.bar, { paddingBottom: navBarBottomPadding(insets.bottom) }]}>
      <View style={styles.row} accessibilityRole="tablist">
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
  const [ring] = useState(() => new Animated.Value(0));

  // Assistente ocupado ou ouvindo "Hey Asa": um anel fino se expande e some (sem brilho permanente).
  const assistantBusy = prominent && assistant ? assistant.state !== 'idle' && assistant.state !== 'offline' && assistant.state !== 'wake-word-listening' : false;
  const wakeListening = prominent && assistant?.wakeWord.status === 'listening';

  useEffect(() => {
    if (!prominent) return undefined;
    if (reduceMotion || (!assistantBusy && !wakeListening)) {
      ring.stopAnimation();
      ring.setValue(0);
      return undefined;
    }
    ring.setValue(0);
    const loop = Animated.loop(Animated.timing(ring, { toValue: 1, duration: assistantBusy ? 1200 : 2400, easing: theme.motion.easing.decelerate, useNativeDriver: NATIVE_DRIVER }));
    loop.start();
    return () => loop.stop();
  }, [assistantBusy, wakeListening, ring, prominent, reduceMotion, theme.motion.easing.decelerate]);

  const press = (toValue: number) => {
    if (reduceMotion) return;
    Animated.spring(scale, { toValue, useNativeDriver: NATIVE_DRIVER, ...theme.motion.spring.press }).start();
  };

  const color = selected ? theme.colors.nav.active : theme.colors.nav.inactive;
  const icon = selected ? tab.activeIcon : tab.icon;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={`${tab.label}, aba`}
      accessibilityHint={prominent ? 'Abre o Assistente ASA. Toque e segure para falar agora' : undefined}
      onPress={() => {
        if (!selected) haptics.selection();
        onPress();
      }}
      onLongPress={onLongPress}
      delayLongPress={280}
      onPressIn={() => press(theme.motion.scale.pressedStrong)}
      onPressOut={() => press(1)}
      testID={`tab-${tab.key}`}
      style={styles.item}
    >
      <Animated.View style={[styles.iconBox, { transform: [{ scale }] }]}>
        {prominent ? (
          <>
            <Animated.View
              style={[styles.ring, { opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }], pointerEvents: 'none' }]}
            />
            <View style={[styles.assistant, selected && styles.assistantActive]}>
              <Ionicons name={icon} size={18} color={theme.colors.text.onPrimary} />
            </View>
          </>
        ) : (
          <Ionicons name={icon} size={22} color={color} />
        )}
      </Animated.View>
      <AppText variant="tab" numberOfLines={1} style={[styles.label, { color }, selected && styles.labelActive]}>
        {tab.label}
      </AppText>
    </Pressable>
  );
}
