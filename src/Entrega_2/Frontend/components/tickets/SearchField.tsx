import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  accessibilityLabel?: string;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  field: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: theme.minTouchTarget, borderRadius: theme.radius.md, borderWidth: 1, paddingHorizontal: theme.spacing.md, backgroundColor: theme.colors.control.inputBackground },
  input: { flex: 1, ...theme.typography.input, color: theme.colors.text.primary, paddingVertical: theme.spacing.sm },
  clear: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
}));

/** Busca por assunto, protocolo ou categoria (a busca roda no servidor, com espera entre teclas). */
export function SearchField({ value, onChange, placeholder = 'Buscar por assunto ou protocolo', accessibilityLabel = 'Buscar chamado', testID }: SearchFieldProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, { borderColor: focused ? theme.colors.border.focus : theme.colors.control.inputBorder }]}>
      <Ionicons name="search-outline" size={18} color={theme.colors.text.muted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.text.placeholder}
        style={styles.input}
        accessibilityLabel={accessibilityLabel}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="never"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        testID={testID}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Limpar busca" onPress={() => onChange('')} hitSlop={theme.hitSlop} style={styles.clear}>
          <Ionicons name="close-circle" size={18} color={theme.colors.text.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}
