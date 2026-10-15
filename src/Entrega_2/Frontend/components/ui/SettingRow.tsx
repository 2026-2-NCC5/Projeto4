import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Switch, View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';

import { AppText } from './AppText';
import { ListItem } from './ListItem';

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
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, minHeight: 52, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
  icon: { width: 24, alignItems: 'center' },
  text: { flex: 1, minWidth: 0 },
}));

/** Linha de configuração (switch, link ou informação) para usar dentro de um `List`. */
export function SettingRow(props: SettingRowProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { label, description, icon, testID } = props;

  if (props.kind === 'link') {
    return (
      <ListItem
        title={label}
        description={description}
        icon={icon}
        value={props.value}
        onPress={props.onPress}
        destructive={props.destructive}
        accessibilityLabel={props.value ? `${label}: ${props.value}` : label}
        accessibilityHint={props.accessibilityHint}
        testID={testID}
      />
    );
  }

  if (props.kind === 'info') {
    return <ListItem title={label} description={description} icon={icon} value={props.value} accessibilityLabel={`${label}: ${props.value}`} testID={testID} />;
  }

  return (
    <View style={styles.row} testID={testID}>
      {icon ? (
        <View style={styles.icon}>
          <Ionicons name={icon} size={20} color={theme.colors.text.secondary} />
        </View>
      ) : null}
      <View style={styles.text}>
        <AppText variant="bodyStrong">{label}</AppText>
        {description ? (
          <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
            {description}
          </AppText>
        ) : null}
      </View>
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
