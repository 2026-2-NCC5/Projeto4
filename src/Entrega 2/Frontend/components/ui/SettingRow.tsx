import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Switch, View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';

import { AppText } from './AppText';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface BaseProps {
  label: string;
  description?: string;
  icon?: IconName;
  testID?: string;
}

export interface SettingSwitchRowProps extends BaseProps {
  kind: 'switch';
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

export interface SettingLinkRowProps extends BaseProps {
  kind: 'link';
  value?: string;
  onPress: () => void;
  accessibilityHint?: string;
  destructive?: boolean;
}

export interface SettingInfoRowProps extends BaseProps {
  kind: 'info';
  value: string;
}

export type SettingRowProps = SettingSwitchRowProps | SettingLinkRowProps | SettingInfoRowProps;

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, minHeight: 56, paddingVertical: theme.spacing.sm },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brand.primarySoft },
  text: { flex: 1 },
  pressed: { opacity: 0.7 },
  value: { maxWidth: '45%' },
}));

/** Linha de configuração (switch, link ou informação) usada no Perfil e nas configurações do assistente. */
export function SettingRow(props: SettingRowProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { label, description, icon, testID } = props;

  const leading = icon ? (
    <View style={styles.icon}>
      <Ionicons name={icon} size={18} color={theme.colors.brand.primaryStrong} />
    </View>
  ) : null;

  const text = (
    <View style={styles.text}>
      <AppText variant="bodyStrong" tone={props.kind === 'link' && props.destructive ? 'error' : 'primary'}>
        {label}
      </AppText>
      {description ? (
        <AppText variant="bodySmall" tone="muted" style={{ marginTop: 2 }}>
          {description}
        </AppText>
      ) : null}
    </View>
  );

  if (props.kind === 'switch') {
    return (
      <View style={styles.row} testID={testID}>
        {leading}
        {text}
        <Switch
          value={props.value}
          onValueChange={props.onChange}
          disabled={props.disabled}
          accessibilityRole="switch"
          accessibilityLabel={label}
          accessibilityState={{ checked: props.value, disabled: props.disabled }}
          trackColor={{ false: theme.colors.control.trackOff, true: theme.colors.control.trackOn }}
          thumbColor={theme.colors.control.thumb}
        />
      </View>
    );
  }

  if (props.kind === 'link') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={props.value ? `${label}: ${props.value}` : label}
        accessibilityHint={props.accessibilityHint}
        onPress={props.onPress}
        testID={testID}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        {leading}
        {text}
        {props.value ? (
          <AppText variant="bodySmall" tone="muted" numberOfLines={1} style={styles.value}>
            {props.value}
          </AppText>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color={theme.colors.text.muted} />
      </Pressable>
    );
  }

  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${props.value}`} testID={testID}>
      {leading}
      {text}
      <AppText variant="bodySmallStrong" tone="secondary" numberOfLines={2} style={styles.value}>
        {props.value}
      </AppText>
    </View>
  );
}
