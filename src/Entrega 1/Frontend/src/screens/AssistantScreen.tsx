import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { User } from '@supabase/supabase-js';
import { AssistantMessage } from '../types';
import { answerAcademicQuestion, createInitialAssistantMessage } from '../services/assistantEngine';
import { palette } from '../components/UI';

const quickPrompts = ['Como está minha situação?', 'O que devo priorizar?', 'Como está minha frequência?', 'Explique minhas notas'];

export function AssistantScreen({ user }: { user: User }) {
  const name = String(user.user_metadata?.full_name || user.email?.split('@')[0] || 'Estudante');
  const [messages, setMessages] = useState<AssistantMessage[]>(() => [createInitialAssistantMessage(name)]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const listRef = useRef<FlatList<AssistantMessage>>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !typing, [input, typing]);

  function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || typing) return;

    const userMessage: AssistantMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      createdAt: new Date(),
    };

    setMessages((current) => [...current, userMessage]);
    setInput('');
    setTyping(true);

    setTimeout(() => {
      const answer = answerAcademicQuestion(text);
      setMessages((current) => [...current, answer]);
      setTyping(false);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }, 550);
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
      <View style={styles.header}>
        <View style={styles.aiAvatar}><Text style={styles.aiAvatarText}>✦</Text></View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Assistente ASA</Text>
          <View style={styles.statusRow}><View style={styles.onlineDot} /><Text style={styles.status}>Agente acadêmico disponível</Text></View>
        </View>
        <View style={styles.demoBadge}><Text style={styles.demoText}>DEMO</Text></View>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChatBubble message={item} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListFooterComponent={typing ? <TypingBubble /> : null}
      />

      <View style={styles.quickArea}>
        <FlatList
          horizontal
          data={quickPrompts}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickList}
          renderItem={({ item }) => (
            <Pressable onPress={() => send(item)} style={styles.quickChip}>
              <Text style={styles.quickText}>{item}</Text>
            </Pressable>
          )}
        />
      </View>

      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Pergunte ao assistente"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send()}
          placeholder="Pergunte sobre sua situação acadêmica..."
          placeholderTextColor="#8A9AA5"
          multiline
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enviar mensagem"
          onPress={() => send()}
          disabled={!canSend}
          style={[styles.send, !canSend && styles.sendDisabled]}
        >
          <Text style={styles.sendText}>➤</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function ChatBubble({ message }: { message: AssistantMessage }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.messageWrap, isUser ? styles.userWrap : styles.assistantWrap]}>
      {!isUser ? <View style={styles.miniAvatar}><Text style={styles.miniAvatarText}>✦</Text></View> : null}
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.messageText, isUser && styles.userMessageText]}>{message.text}</Text>
        {message.evidence?.length ? (
          <View style={styles.evidenceBox}>
            <Text style={styles.boxLabel}>EVIDÊNCIAS</Text>
            {message.evidence.map((evidence) => <Text key={evidence} style={styles.evidenceText}>• {evidence}</Text>)}
          </View>
        ) : null}
        {message.nextAction ? (
          <View style={styles.nextBox}>
            <Text style={styles.boxLabel}>PRÓXIMA AÇÃO</Text>
            <Text style={styles.nextText}>{message.nextAction}</Text>
          </View>
        ) : null}
        {message.requiresHumanValidation ? <Text style={styles.human}>⚠ Validação humana recomendada</Text> : null}
      </View>
    </View>
  );
}

function TypingBubble() {
  return (
    <View style={[styles.messageWrap, styles.assistantWrap]}>
      <View style={styles.miniAvatar}><Text style={styles.miniAvatarText}>✦</Text></View>
      <View style={[styles.bubble, styles.assistantBubble, styles.typingBubble]}><ActivityIndicator size="small" color={palette.tealDark} /><Text style={styles.typingText}>Analisando dados demonstrativos...</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background, paddingBottom: 92 },
  header: { paddingTop: Platform.OS === 'ios' ? 54 : 32, paddingHorizontal: 18, paddingBottom: 14, backgroundColor: palette.navy, flexDirection: 'row', alignItems: 'center' },
  aiAvatar: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#123D53', alignItems: 'center', justifyContent: 'center' },
  aiAvatarText: { color: palette.teal, fontSize: 23 },
  headerText: { flex: 1, marginLeft: 11 },
  title: { color: palette.white, fontSize: 18, fontWeight: '900' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.teal, marginRight: 6 },
  status: { color: '#A7BAC6', fontSize: 11 },
  demoBadge: { borderWidth: 1, borderColor: '#315266', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  demoText: { color: '#8EA7B6', fontSize: 9, fontWeight: '900' },
  list: { padding: 16, paddingBottom: 12 },
  messageWrap: { flexDirection: 'row', marginBottom: 15, alignItems: 'flex-end' },
  userWrap: { justifyContent: 'flex-end' },
  assistantWrap: { justifyContent: 'flex-start' },
  miniAvatar: { width: 28, height: 28, borderRadius: 10, backgroundColor: palette.navy, alignItems: 'center', justifyContent: 'center', marginRight: 7 },
  miniAvatarText: { color: palette.teal, fontSize: 13 },
  bubble: { maxWidth: '84%', borderRadius: 18, padding: 13 },
  assistantBubble: { backgroundColor: palette.white, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: '#E7EDF0' },
  userBubble: { backgroundColor: palette.tealDark, borderBottomRightRadius: 6 },
  messageText: { color: palette.text, fontSize: 14, lineHeight: 21 },
  userMessageText: { color: palette.white },
  evidenceBox: { backgroundColor: '#F2F7F8', borderRadius: 12, padding: 10, marginTop: 11 },
  nextBox: { backgroundColor: palette.mint, borderRadius: 12, padding: 10, marginTop: 9 },
  boxLabel: { color: palette.tealDark, fontSize: 9, letterSpacing: 1, fontWeight: '900', marginBottom: 5 },
  evidenceText: { color: palette.muted, fontSize: 11, lineHeight: 17, marginBottom: 2 },
  nextText: { color: palette.text, fontSize: 11, lineHeight: 17, fontWeight: '600' },
  human: { color: '#9A6200', fontSize: 10, fontWeight: '800', marginTop: 9 },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  typingText: { color: palette.muted, fontSize: 11 },
  quickArea: { backgroundColor: palette.background, paddingVertical: 8 },
  quickList: { paddingHorizontal: 12, gap: 7 },
  quickChip: { backgroundColor: palette.white, borderWidth: 1, borderColor: '#DCE5EA', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  quickText: { color: palette.text, fontSize: 11, fontWeight: '700' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: palette.white, borderTopWidth: 1, borderTopColor: palette.line, gap: 9 },
  input: { flex: 1, minHeight: 46, maxHeight: 110, borderRadius: 16, backgroundColor: '#F1F5F7', paddingHorizontal: 13, paddingTop: 12, paddingBottom: 10, color: palette.text, fontSize: 13 },
  send: { width: 46, height: 46, borderRadius: 16, backgroundColor: palette.tealDark, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { backgroundColor: '#B8C5CC' },
  sendText: { color: palette.white, fontSize: 18, fontWeight: '900' },
});
