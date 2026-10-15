import React from 'react';
import { View } from 'react-native';

import { makeStyles } from '../../theme';
import type { SupportHelpArticle } from '../../types/api';
import { AppButton } from '../ui/AppButton';
import { AppText } from '../ui/AppText';

import { BottomSheet } from './BottomSheet';

export interface HelpArticleSheetProps {
  article: SupportHelpArticle | null;
  onClose: () => void;
  /** "Ainda preciso de ajuda": abre (ou continua) um chamado — o artigo nunca bloqueia o atendimento */
  onOpenTicket?: (categoryId: string) => void;
  openTicketLabel?: string;
}

const useStyles = makeStyles((theme) => ({
  step: { flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.sm },
  number: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface.muted },
  actions: { marginTop: theme.spacing.xl, gap: theme.spacing.sm },
}));

/** Artigo da Central de ajuda em folha inferior: resumo, passos e o caminho para abrir um chamado. */
export function HelpArticleSheet({ article, onClose, onOpenTicket, openTicketLabel = 'Ainda preciso de ajuda' }: HelpArticleSheetProps) {
  const styles = useStyles();
  return (
    <BottomSheet visible={Boolean(article)} onClose={onClose} title={article?.title ?? ''} description={article?.summary} testID="help-article-sheet">
      {article?.steps.map((step, index) => (
        <View key={step} style={styles.step}>
          <View style={styles.number}>
            <AppText variant="caption" style={{ fontWeight: '700' }}>
              {index + 1}
            </AppText>
          </View>
          <AppText variant="body" style={{ flex: 1 }}>
            {step}
          </AppText>
        </View>
      ))}
      <View style={styles.actions}>
        {article && onOpenTicket ? <AppButton label={openTicketLabel} variant="secondary" onPress={() => onOpenTicket(article.categoryId)} testID="help-article-open-ticket" /> : null}
        <AppButton label="Isso resolveu" variant="ghost" onPress={onClose} />
      </View>
    </BottomSheet>
  );
}
