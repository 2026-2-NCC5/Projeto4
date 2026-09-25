import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { PressableScale } from '../ui/PressableScale';
import { DEFAULT_VOICE_SUGGESTIONS } from '../voice/VoiceSuggestions';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface ChatQuickAction {
  icon: IconName;
  label: string;
  /** Texto enviado ao assistente (padrão: o próprio rótulo). */
  text?: string;
}

const QUICK_ACTION_ICONS: readonly IconName[] = ['alert-circle-outline', 'school-outline', 'calendar-outline', 'sparkles-outline'];

/** Ações rápidas padrão: as mesmas perguntas de exemplo da voz, com ícones (grade "Chat V1"). */
export const DEFAULT_CHAT_QUICK_ACTIONS: readonly ChatQuickAction[] = DEFAULT_VOICE_SUGGESTIONS.map((label, index) => ({ icon: QUICK_ACTION_ICONS[index % QUICK_ACTION_ICONS.length] ?? 'chatbubble-ellipses-outline', label }));

export interface ChatEmptyStateProps {
  /** Primeiro nome para a saudação (opcional). */
  name?: string;
  /** Saudação por período ("Bom dia"). Sem ela, mostra apenas o título. */
  greeting?: string;
  title?: string;
  /** Orb / avatar do assistente acima da saudação. */
  hero?: React.ReactNode;
  /** Linha de status abaixo do título (ex.: "Toque no microfone para falar"). */
  status?: React.ReactNode;
  actions?: readonly ChatQuickAction[];
  /** Colunas da grade de ações rápidas (1 em telas estreitas, para o texto não quebrar em muitas linhas). */
  columns?: 1 | 2;
  /** Saudação à esquerda e ações à direita, com título menor (telas baixas, como celular em paisagem). */
  split?: boolean;
  onSelect: (text: string) => void;
  disabled?: boolean;
  onDark?: boolean;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  wrapper: { alignItems: 'center', paddingTop: theme.spacing.md },
  split: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xl },
  splitHero: { flex: 1, alignItems: 'center', minWidth: 0 },
  splitActions: { flex: 1.3, minWidth: 0 },
  greetingBlock: { alignItems: 'center', marginTop: theme.spacing.sm, paddingHorizontal: theme.spacing.md },
  greetingBlockSplit: { marginTop: 0, paddingHorizontal: 0 },
  // No máximo duas colunas: em tablets/desktop a coluna de conteúdo já tem largura limitada.
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: theme.spacing.sm + 2, marginTop: theme.spacing.xl, alignSelf: 'stretch' },
  gridSplit: { marginTop: 0 },
  chipCellHalf: { width: '48.5%' },
  chipCellFull: { width: '100%' },
  chip: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm + 2, minHeight: 60, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.chat.chipBorder, backgroundColor: theme.colors.chat.chipBackground, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm + 2, ...theme.shadows.sm },
  chipDark: { backgroundColor: theme.colors.surface.onInverse, borderColor: 'rgba(255,255,255,0.14)', ...theme.shadows.none },
  chipIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brand.primarySoft },
  chipIconDark: { backgroundColor: 'rgba(43,196,150,0.18)' },
  chipLabel: { flex: 1, minWidth: 0 },
}));

/** Estado vazio da conversa: saudação, orb e grade de ações rápidas (enviadas como texto pelo fluxo normal). */
export function ChatEmptyState({ name, greeting, title = 'Como posso ajudar?', hero, status, actions = DEFAULT_CHAT_QUICK_ACTIONS, columns = 2, split = false, onSelect, disabled = false, onDark = false, testID = 'voice-suggestions' }: ChatEmptyStateProps) {
  const theme = useTheme();
  const styles = useStyles();
  const hello = greeting ? (name ? `${greeting}, ${name}` : greeting) : name ? `Olá, ${name}` : null;
  const intro = (
    <>
      {hero}
      <View style={[styles.greetingBlock, split && styles.greetingBlockSplit]}>
        {hello && !split ? (
          <AppText variant="h4" tone={onDark ? 'inverseMuted' : 'secondary'} align="center">
            {hello}
          </AppText>
        ) : null}
        <AppText variant={split ? 'h2' : 'h1'} tone={onDark ? 'inverse' : 'primary'} align="center" accessibilityRole="header" style={{ marginTop: theme.spacing.xxs }}>
          {title}
        </AppText>
        {status ? <View style={{ marginTop: split ? theme.spacing.xxs : theme.spacing.sm }}>{status}</View> : null}
      </View>
    </>
  );
  const grid = (
    <View style={[styles.grid, split && styles.gridSplit]} accessibilityRole="list">
      {actions.map((action) => (
        <PressableScale
          key={action.label}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityHint="Envia esta pergunta ao assistente"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => onSelect(action.text ?? action.label)}
          containerStyle={columns === 1 ? styles.chipCellFull : styles.chipCellHalf}
          style={[styles.chip, onDark && styles.chipDark]}
        >
          <View style={[styles.chipIcon, onDark && styles.chipIconDark]}>
            <Ionicons name={action.icon} size={16} color={onDark ? theme.colors.assistant.primary : theme.colors.brand.primaryStrong} />
          </View>
          <AppText variant="bodySmallStrong" tone={onDark ? 'inverse' : 'primary'} style={styles.chipLabel}>
            {action.label}
          </AppText>
        </PressableScale>
      ))}
    </View>
  );

  if (split) {
    return (
      <View style={styles.split} testID={testID}>
        <View style={styles.splitHero}>{intro}</View>
        <View style={styles.splitActions}>{grid}</View>
      </View>
    );
  }

  return (
    <View style={styles.wrapper} testID={testID}>
      {intro}
      {grid}
    </View>
  );
}
