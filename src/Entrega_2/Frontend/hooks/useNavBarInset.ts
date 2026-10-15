import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';

/** Espaço mínimo abaixo dos ícones quando o aparelho não tem área segura inferior (botões físicos, web). */
const MIN_BOTTOM_PADDING = 8;

/** Preenchimento inferior da barra de navegação (área segura do aparelho, com um mínimo). */
export function navBarBottomPadding(safeAreaBottom: number): number {
  return Math.max(safeAreaBottom, MIN_BOTTOM_PADDING);
}

/** Altura total ocupada pela barra de navegação inferior, incluindo a área segura. */
export function useNavBarInset(): number {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  return theme.spacing.navBar + navBarBottomPadding(insets.bottom);
}
