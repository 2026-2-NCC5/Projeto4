import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '../../theme';

import { AppText } from './AppText';
import { Divider } from './Divider';
import { Surface } from './Surface';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Largura reservada ao ícone à esquerda (o divisor da lista alinha com o texto). */
const ICON_SLOT = 24;

export interface ListItemProps {
  title: string;
  description?: string | null;
  /** Linha auxiliar abaixo da descrição (datas, contagens). */
  meta?: string | null;
  icon?: IconName;
  iconColor?: string;
  /** Conteúdo à esquerda no lugar do ícone (ex.: data, avatar). */
  leading?: React.ReactNode;
  /** Texto curto à direita. */
  value?: string;
  /** Conteúdo à direita (badge, número). Exibido antes do chevron. */
  trailing?: React.ReactNode;
  onPress?: () => void;
  /** Padrão: chevron quando há `onPress`. */
  showChevron?: boolean;
  destructive?: boolean;
  titleLines?: number;
  descriptionLines?: number;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, minHeight: 52, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
  pressed: { backgroundColor: theme.colors.surface.secondary },
  icon: { width: ICON_SLOT, alignItems: 'center' },
  text: { flex: 1, minWidth: 0 },
  value: { maxWidth: '45%' },
}));

/** Linha de lista: ícone simples (sem círculo colorido), título, descrição e ação à direita. */
export function ListItem({ title, description, meta, icon, iconColor, leading, value, trailing, onPress, showChevron, destructive = false, titleLines, descriptionLines, accessibilityLabel, accessibilityHint, style, testID }: ListItemProps) {
  const theme = useTheme();
  const styles = useStyles();
  const chevron = showChevron ?? Boolean(onPress);
  const content = (
    <>
      {leading ?? (icon ? (
        <View style={styles.icon}>
          <Ionicons name={icon} size={20} color={iconColor ?? (destructive ? theme.colors.status.errorText : theme.colors.text.secondary)} />
        </View>
      ) : null)}
      <View style={styles.text}>
        <AppText variant="bodyStrong" tone={destructive ? 'error' : 'primary'} numberOfLines={titleLines}>
          {title}
        </AppText>
        {description ? (
          <AppText variant="bodySmall" tone="secondary" numberOfLines={descriptionLines} style={{ marginTop: 2 }}>
            {description}
          </AppText>
        ) : null}
        {meta ? (
          <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
            {meta}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="bodySmall" tone="secondary" numberOfLines={2} style={styles.value}>
          {value}
        </AppText>
      ) : null}
      {trailing}
      {chevron ? <Ionicons name="chevron-forward" size={16} color={theme.colors.text.muted} /> : null}
    </>
  );

  const label = accessibilityLabel ?? [title, description, value].filter(Boolean).join(', ');
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={accessibilityHint} onPress={onPress} testID={testID} style={({ pressed }) => [styles.row, pressed && styles.pressed, style]}>
        {content}
      </Pressable>
    );
  }
  return (
    <View style={[styles.row, style]} accessible accessibilityLabel={label} testID={testID}>
      {content}
    </View>
  );
}

export interface ListProps {
  children: React.ReactNode;
  /** Recuo dos divisores (padrão: alinhado ao texto quando as linhas têm ícone). */
  inset?: 'none' | 'text' | 'icon';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Grupo de linhas num único card, separadas por divisores (no lugar de um card por item). */
export function List({ children, inset = 'none', style, testID }: ListProps) {
  const theme = useTheme();
  const items = React.Children.toArray(children).filter(Boolean);
  const dividerInset = inset === 'icon' ? theme.spacing.lg + ICON_SLOT + theme.spacing.md : inset === 'text' ? theme.spacing.lg : 0;
  return (
    <Surface padding={0} style={style} testID={testID}>
      {items.map((child, index) => (
        <React.Fragment key={React.isValidElement(child) && child.key !== null ? child.key : index}>
          {index > 0 ? <Divider inset={dividerInset} /> : null}
          {child}
        </React.Fragment>
      ))}
    </Surface>
  );
}
