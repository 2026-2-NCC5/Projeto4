import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { TabKey } from '../types';
import { palette } from './UI';

type IconName =
  React.ComponentProps<typeof Ionicons>['name'];

type Tab = {
  key: TabKey;
  label: string;
  icon: IconName;
  activeIcon: IconName;
};

const tabs: Tab[] = [
  {
    key: 'home',
    label: 'Início',
    icon: 'home-outline',
    activeIcon: 'home',
  },
  {
    key: 'academic',
    label: 'Acadêmico',
    icon: 'school-outline',
    activeIcon: 'school',
  },
  {
    key: 'assistant',
    label: 'Assistente',
    icon: 'sparkles-outline',
    activeIcon: 'sparkles',
  },
  {
    key: 'recommendations',
    label: 'Dicas',
    icon: 'bulb-outline',
    activeIcon: 'bulb',
  },
  {
    key: 'profile',
    label: 'Perfil',
    icon: 'person-outline',
    activeIcon: 'person',
  },
];

interface BottomNavProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

export function BottomNav({
  active,
  onChange,
}: BottomNavProps) {
  return (
    <View
      pointerEvents="box-none"
      style={styles.wrapper}
    >
      <View style={styles.navbar}>
        {tabs.map((tab) => {
          const selected =
            active === tab.key;

          const prominent =
            tab.key === 'assistant';

          return (
            <NavItem
              key={tab.key}
              prominent={prominent}
              selected={selected}
              tab={tab}
              onPress={() =>
                onChange(tab.key)
              }
            />
          );
        })}
      </View>
    </View>
  );
}

interface NavItemProps {
  prominent: boolean;
  selected: boolean;
  tab: Tab;
  onPress: () => void;
}

function NavItem({
  prominent,
  selected,
  tab,
  onPress,
}: NavItemProps) {
  if (prominent) {
    return (
      <View style={styles.item}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{
            selected,
          }}
          accessibilityLabel={tab.label}
          onPress={onPress}
          style={({ pressed }) => [
            styles.assistantButton,

            selected &&
              styles.assistantButtonActive,

            pressed &&
              styles.buttonPressed,
          ]}
        >
          <Ionicons
            name={
              selected
                ? tab.activeIcon
                : tab.icon
            }
            size={25}
            color={palette.white}
          />
        </Pressable>

        <Text
          numberOfLines={1}
          style={[
            styles.label,
            styles.assistantLabel,

            selected &&
              styles.labelActive,
          ]}
        >
          {tab.label}
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{
        selected,
      }}
      accessibilityLabel={tab.label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,

        pressed &&
          styles.itemPressed,
      ]}
    >
      <View
        style={[
          styles.iconContainer,

          selected &&
            styles.iconContainerActive,
        ]}
      >
        <Ionicons
          name={
            selected
              ? tab.activeIcon
              : tab.icon
          }
          size={22}
          color={
            selected
              ? palette.tealDark
              : '#94A3B8'
          }
        />
      </View>

      <Text
        numberOfLines={1}
        style={[
          styles.label,

          selected &&
            styles.labelActive,
        ]}
      >
        {tab.label}
      </Text>

      <View
        style={[
          styles.activeIndicator,

          selected &&
            styles.activeIndicatorVisible,
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',

    left: 14,
    right: 14,

    bottom:
      Platform.OS === 'ios'
        ? 22
        : 14,

    zIndex: 100,
  },

  navbar: {
    minHeight: 76,

    flexDirection: 'row',
    alignItems: 'center',

    backgroundColor:
      palette.white,

    borderRadius: 22,

    paddingHorizontal: 6,
    paddingVertical: 7,

    borderWidth: 1,
    borderColor: '#E8EDF2',

    shadowColor: '#0F172A',

    shadowOffset: {
      width: 0,
      height: 8,
    },

    shadowOpacity: 0.08,
    shadowRadius: 20,

    elevation: 8,
  },

  item: {
    flex: 1,

    minHeight: 62,

    alignItems: 'center',
    justifyContent: 'center',
  },

  itemPressed: {
    opacity: 0.72,
  },

  iconContainer: {
    width: 40,
    height: 36,

    borderRadius: 13,

    alignItems: 'center',
    justifyContent: 'center',
  },

  iconContainerActive: {
    backgroundColor: '#EAF8F6',
  },

  label: {
    color: '#94A3B8',

    fontSize: 10,
    fontWeight: '700',

    marginTop: 4,

    textAlign: 'center',
  },

  labelActive: {
    color: palette.tealDark,

    fontWeight: '900',
  },

  activeIndicator: {
    width: 16,
    height: 3,

    borderRadius: 999,

    backgroundColor:
      'transparent',

    marginTop: 4,
  },

  activeIndicatorVisible: {
    backgroundColor:
      palette.teal,
  },

  assistantButton: {
    width: 56,
    height: 56,

    borderRadius: 19,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor:
      palette.tealDark,

    marginTop: -27,

    borderWidth: 4,
    borderColor:
      palette.white,

    shadowColor:
      palette.tealDark,

    shadowOffset: {
      width: 0,
      height: 6,
    },

    shadowOpacity: 0.2,
    shadowRadius: 10,

    elevation: 8,
  },

  assistantButtonActive: {
    backgroundColor:
      palette.navy,
  },

  buttonPressed: {
    opacity: 0.78,
    transform: [
      {
        scale: 0.95,
      },
    ],
  },

  assistantLabel: {
    marginTop: 3,
  },
});