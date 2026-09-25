import React from 'react';
import { View } from 'react-native';

import { makeStyles } from '../../theme';
import type { AssistantTurn } from '../../types/assistant';
import { AppText } from '../ui/AppText';

import { AssistantMessage, UserBubble } from './ChatBubble';

export interface AssistantTranscriptProps {
  /** Turnos anteriores (o turno atual é exibido em detalhe pelo VoiceResponse). */
  turns: AssistantTurn[];
  onDark?: boolean;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  wrapper: { marginTop: theme.spacing.xs },
  meta: { marginTop: theme.spacing.xxs },
}));

/** Histórico da conversa atual em balões (mantém o contexto visível, como uma conversa natural). */
export function AssistantTranscript({ turns, onDark = false, testID = 'assistant-transcript' }: AssistantTranscriptProps) {
  const styles = useStyles();
  if (turns.length === 0) return null;
  return (
    <View style={styles.wrapper} testID={testID} accessibilityRole="list">
      {turns.map((turn) => {
        const items = turn.response.display.items.length;
        return (
          <React.Fragment key={turn.id}>
            {turn.transcript ? <UserBubble text={turn.transcript} onDark={onDark} testID={`chat-user-${turn.id}`} /> : null}
            <AssistantMessage text={turn.response.display.message || turn.response.display.title} animate={false} onDark={onDark} testID={`chat-assistant-${turn.id}`}>
              {items > 0 ? (
                <AppText variant="caption" tone={onDark ? 'inverseMuted' : 'muted'} style={styles.meta}>
                  {items} {items === 1 ? 'item' : 'itens'}
                </AppText>
              ) : null}
            </AssistantMessage>
          </React.Fragment>
        );
      })}
    </View>
  );
}
