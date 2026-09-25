import React, { type PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useResponsive } from '../hooks/useResponsive';
import { makeStyles, useTheme } from '../theme';

import { AuroraBackground } from './ui/AuroraBackground';

interface ScreenProps {
  scroll?: boolean;
  /** Reserva espaço para a barra de navegação inferior. */
  withNavSpace?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  scrollRef?: React.Ref<ScrollView>;
  /** Envolve o conteúdo em KeyboardAvoidingView (telas com campo de texto fixo embaixo). */
  keyboardAvoiding?: boolean;
  /** Pull-to-refresh (somente com scroll). */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Fundo alternativo (ex.: experiência imersiva do assistente). */
  background?: string;
  /** Brilho "aurora" suave no topo (linguagem visual comum a todas as telas). Padrão: true. */
  aurora?: boolean;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  safe: { flex: 1, backgroundColor: theme.colors.background.primary },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingTop: theme.spacing.lg, width: '100%', alignSelf: 'center' },
  // Sem scroll: altura limitada à tela (flex: 1 também encolhe). Com só flexGrow, na web o conteúdo cresce até
  // a altura de tudo que ele contém e a página inteira rola, levando junto barras que deveriam ficar fixas.
  fixed: { flex: 1 },
}));

export function Screen({
  children,
  scroll = true,
  withNavSpace = true,
  contentStyle,
  scrollRef,
  keyboardAvoiding = false,
  refreshing = false,
  onRefresh,
  background,
  aurora = true,
  testID,
}: PropsWithChildren<ScreenProps>) {
  const theme = useTheme();
  const styles = useStyles();
  const responsive = useResponsive();
  const paddingBottom = withNavSpace ? theme.spacing.navSpace : theme.spacing.xxl;
  // Tablets/paisagem: conteúdo centralizado com largura máxima; telefones: margem escalada pela largura.
  const layout = { paddingHorizontal: responsive.gutter, maxWidth: responsive.contentMaxWidth, paddingBottom };
  const content = scroll ? (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[styles.content, layout, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.brand.primary} colors={[theme.colors.brand.primary]} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.fixed, layout, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.safe, background ? { backgroundColor: background } : null]} edges={['top', 'left', 'right']} testID={testID}>
      {aurora && !background ? <AuroraBackground variant="subtle" /> : null}
      {keyboardAvoiding ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}
