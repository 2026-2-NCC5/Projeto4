import React, { PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  Platform,
  StatusBar as NativeStatusBar,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

export const palette = {
  navy: '#071A2B',
  navy2: '#0C263A',
  teal: '#18C3A3',
  tealDark: '#0FA487',
  mint: '#DFF8F1',
  blueSoft: '#EAF4FF',
  warning: '#F59E0B',
  warningSoft: '#FFF4D6',
  danger: '#D64545',
  dangerSoft: '#FFE7E7',
  success: '#1D9B62',
  successSoft: '#E5F7EE',
  text: '#102436',
  muted: '#667784',
  line: '#E3E9ED',
  background: '#F4F7F9',
  white: '#FFFFFF',
};

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  const content = scroll ? (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={styles.screenContent}>{children}</View>
  );

  return <SafeAreaView style={styles.safe}>{content}</SafeAreaView>;
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ title, action }: { title: string; action?: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? <Text style={styles.sectionAction}>{action}</Text> : null}
    </View>
  );
}

export function Pill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'info' | 'danger';
}) {
  const toneStyle = {
    neutral: { backgroundColor: '#EEF2F4', color: palette.muted },
    success: { backgroundColor: palette.successSoft, color: palette.success },
    warning: { backgroundColor: palette.warningSoft, color: '#9A6200' },
    info: { backgroundColor: palette.blueSoft, color: '#2E6DA4' },
    danger: { backgroundColor: palette.dangerSoft, color: palette.danger },
  }[tone];

  return (
    <View style={[styles.pill, { backgroundColor: toneStyle.backgroundColor }]}>
      <Text style={[styles.pillText, { color: toneStyle.color }]}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const buttonStyle =
    variant === 'primary'
      ? styles.primaryButton
      : variant === 'danger'
        ? styles.dangerButton
        : styles.secondaryButton;
  const textStyle = variant === 'secondary' ? styles.secondaryButtonText : styles.primaryButtonText;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [buttonStyle, (pressed || disabled) && styles.buttonPressed]}
    >
      {loading ? <ActivityIndicator color={variant === 'secondary' ? palette.navy : palette.white} /> : <Text style={textStyle}>{label}</Text>}
    </Pressable>
  );
}

export function ProgressBar({ value, warning = false }: { value: number; warning?: boolean }) {
  return (
    <View style={styles.progressTrack}>
      <View
        style={[
          styles.progressFill,
          { width: `${Math.max(0, Math.min(100, value))}%` },
          warning && { backgroundColor: palette.warning },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background, paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0 },
  screenContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 },
  card: {
    backgroundColor: palette.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#EDF1F3',
    shadowColor: '#061725',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: palette.text },
  sectionAction: { fontSize: 13, fontWeight: '700', color: palette.tealDark },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  pillText: { fontSize: 12, fontWeight: '800' },
  primaryButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: palette.tealDark,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  dangerButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: palette.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: palette.white, fontSize: 16, fontWeight: '800' },
  secondaryButtonText: { color: palette.text, fontSize: 16, fontWeight: '800' },
  buttonPressed: { opacity: 0.72 },
  progressTrack: { height: 8, backgroundColor: '#E8EEF1', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: palette.tealDark, borderRadius: 999 },
});

export const uiStyles = styles;
