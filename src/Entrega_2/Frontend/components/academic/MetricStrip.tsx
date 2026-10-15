import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';

export interface MetricItem {
  key: string;
  label: string;
  value: string;
  /** Complemento curto ("média", "de 10"). Também lido pelo leitor de tela. */
  detail?: string;
  /** 'attention' destaca o valor e acrescenta um ícone (o estado nunca depende só da cor). */
  tone?: 'default' | 'attention' | 'critical';
  onPress?: () => void;
  accessibilityHint?: string;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  strip: { flexDirection: 'row', backgroundColor: theme.colors.surface.primary, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border.default, overflow: 'hidden' },
  cell: { flex: 1, minWidth: 0, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
  pressed: { backgroundColor: theme.colors.surface.secondary },
  divider: { width: 1, backgroundColor: theme.colors.border.subtle, marginVertical: theme.spacing.md },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xxs },
}));

/** Indicadores lado a lado num único card (Frequência · Média · Pendências), separados por divisores. */
export function MetricStrip({ items, testID }: { items: MetricItem[]; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.strip} testID={testID}>
      {items.map((item, index) => (
        <React.Fragment key={item.key}>
          {index > 0 ? <View style={styles.divider} /> : null}
          <MetricCell item={item} />
        </React.Fragment>
      ))}
    </View>
  );
}

function MetricCell({ item }: { item: MetricItem }) {
  const theme = useTheme();
  const styles = useStyles();
  const flagged = item.tone === 'attention' || item.tone === 'critical';
  const valueTone = item.tone === 'critical' ? 'error' : item.tone === 'attention' ? 'warning' : 'primary';
  const content = (
    <>
      <View style={styles.labelRow}>
        <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
          {item.label}
        </AppText>
        {flagged ? <Ionicons name="alert-circle" size={12} color={item.tone === 'critical' ? theme.colors.status.errorText : theme.colors.status.warningText} /> : null}
      </View>
      <AppText variant="metric" tone={valueTone} numberOfLines={1} style={{ marginTop: theme.spacing.xxs }}>
        {item.value}
      </AppText>
      {item.detail ? (
        <AppText variant="caption" tone="muted" numberOfLines={1}>
          {item.detail}
        </AppText>
      ) : null}
    </>
  );
  const a11y = `${item.label}: ${item.value}${item.detail ? `, ${item.detail}` : ''}${flagged ? ', requer atenção' : ''}`;
  if (item.onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={a11y} accessibilityHint={item.accessibilityHint} onPress={item.onPress} style={({ pressed }) => [styles.cell, pressed && styles.pressed]} testID={item.testID}>
        {content}
      </Pressable>
    );
  }
  return (
    <View style={styles.cell} accessible accessibilityLabel={a11y} testID={item.testID}>
      {content}
    </View>
  );
}
