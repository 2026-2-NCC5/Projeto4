import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '../../../components/ui/AppText';
import { Divider } from '../../../components/ui/Divider';
import { makeStyles, useTheme } from '../../../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface ChoiceRowProps {
  title: string;
  description?: string | null;
  icon?: IconName;
  selected: boolean;
  onPress: () => void;
  /** divisor acima (todas as linhas menos a primeira) */
  divider?: boolean;
  testID?: string;
}

const ICON_SLOT = 24;

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, minHeight: 56, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
  pressed: { backgroundColor: theme.colors.surface.secondary },
  icon: { width: ICON_SLOT, alignItems: 'center' },
  text: { flex: 1, minWidth: 0 },
}));

/** Opção de escolha única (rádio) dentro de uma lista: assunto e modalidade do agendamento. */
export function ChoiceRow({ title, description, icon, selected, onPress, divider = false, testID }: ChoiceRowProps) {
  const theme = useTheme();
  const styles = useStyles();
  const accent = selected ? theme.colors.brand.primaryStrong : theme.colors.text.secondary;
  return (
    <View>
      {divider ? <Divider inset={icon ? theme.spacing.lg + ICON_SLOT + theme.spacing.md : theme.spacing.lg} /> : null}
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: selected, selected }}
        accessibilityLabel={description ? `${title}. ${description}` : title}
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        testID={testID}
      >
        {icon ? (
          <View style={styles.icon}>
            <Ionicons name={icon} size={20} color={accent} />
          </View>
        ) : null}
        <View style={styles.text}>
          <AppText variant="bodyStrong">{title}</AppText>
          {description ? (
            <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
              {description}
            </AppText>
          ) : null}
        </View>
        <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? theme.colors.brand.primaryStrong : theme.colors.text.muted} />
      </Pressable>
    </View>
  );
}
