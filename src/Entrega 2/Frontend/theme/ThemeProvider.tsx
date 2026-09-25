import React, { createContext, useContext, useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { LIGHT_THEME, themeForScheme, type ColorScheme, type Theme } from './theme';

const ThemeContext = createContext<Theme>(LIGHT_THEME);

export interface ThemeProviderProps {
  children: React.ReactNode;
  /** Força um esquema (testes/previews). Sem a prop o app usa sempre o tema claro. */
  scheme?: ColorScheme;
}

/**
 * O ASA Conecta é exibido sempre no tema claro (decisão de produto de 2026-09-17): a preferência
 * "Aparência" deixou de existir na UI e o esquema do sistema é ignorado. O tema escuro continua
 * definido em `colors.ts` apenas como referência de contraste, sem ser aplicado.
 */
export function ThemeProvider({ children, scheme }: ThemeProviderProps) {
  const theme = useMemo(() => themeForScheme(scheme ?? 'light'), [scheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** Tema atual. Fora de um ThemeProvider devolve o tema claro (componentes continuam renderizáveis). */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

type AnyNamedStyles = StyleSheet.NamedStyles<any>;

/**
 * Cria um hook de estilos tematizados com cache por tema (os temas são instâncias únicas, então o
 * StyleSheet é criado uma vez por esquema, não por render).
 *
 *   const useStyles = makeStyles((theme) => ({ card: { backgroundColor: theme.colors.surface.primary } }));
 *   const styles = useStyles();
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T> | AnyNamedStyles>(factory: (theme: Theme) => T & AnyNamedStyles): () => T {
  const cache = new WeakMap<Theme, T>();
  return function useStyles(): T {
    const theme = useTheme();
    const cached = cache.get(theme);
    if (cached) return cached;
    const created = StyleSheet.create(factory(theme)) as T;
    cache.set(theme, created);
    return created;
  };
}
