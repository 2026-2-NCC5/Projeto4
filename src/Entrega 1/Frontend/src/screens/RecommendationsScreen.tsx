import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Pill, Screen, palette } from '../components/UI';
import { recommendations } from '../data/mockData';

export function RecommendationsScreen() {
  const [expanded, setExpanded] = useState<string | null>('rec-1');

  return (
    <Screen>
      <Text style={styles.title}>Recomendações</Text>
      <Text style={styles.subtitle}>Cada orientação mostra evidências e uma próxima ação.</Text>

      <View style={styles.notice}>
        <Text style={styles.noticeIcon}>✦</Text>
        <Text style={styles.noticeText}>As recomendações apoiam sua decisão. Elas não alteram registros acadêmicos oficiais.</Text>
      </View>

      {recommendations.map((rec) => {
        const isOpen = expanded === rec.id;
        const tone = rec.tone === 'attention' ? 'warning' : rec.tone === 'success' ? 'success' : 'info';
        return (
          <Pressable key={rec.id} onPress={() => setExpanded(isOpen ? null : rec.id)} accessibilityRole="button">
            <Card style={styles.card}>
              <View style={styles.top}>
                <Pill label={rec.tone === 'attention' ? 'Atenção' : rec.tone === 'success' ? 'Progresso' : 'Acompanhamento'} tone={tone} />
                <Text style={styles.confidence}>{Math.round(rec.confidence * 100)}% confiança</Text>
              </View>
              <Text style={styles.recTitle}>{rec.title}</Text>
              <Text style={styles.message}>{rec.message}</Text>

              {isOpen ? (
                <View style={styles.details}>
                  <Text style={styles.detailLabel}>POR QUE ESTOU VENDO ISSO?</Text>
                  {rec.evidence.map((evidence) => (
                    <View key={evidence} style={styles.evidenceRow}>
                      <View style={styles.bullet} />
                      <Text style={styles.evidence}>{evidence}</Text>
                    </View>
                  ))}
                  <View style={styles.nextBox}>
                    <Text style={styles.nextLabel}>PRÓXIMA AÇÃO</Text>
                    <Text style={styles.next}>{rec.nextAction}</Text>
                  </View>
                </View>
              ) : null}

              <Text style={styles.expand}>{isOpen ? 'Ocultar detalhes  ↑' : 'Ver evidências e próxima ação  ↓'}</Text>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: palette.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: palette.muted, fontSize: 14, marginTop: 4, marginBottom: 18 },
  notice: { flexDirection: 'row', gap: 10, backgroundColor: palette.navy, padding: 14, borderRadius: 16, alignItems: 'flex-start', marginBottom: 14 },
  noticeIcon: { color: palette.teal, fontSize: 18 },
  noticeText: { color: '#C3D1D9', fontSize: 12, lineHeight: 18, flex: 1 },
  card: { marginBottom: 12 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  confidence: { color: palette.muted, fontSize: 11, fontWeight: '700' },
  recTitle: { color: palette.text, fontSize: 18, fontWeight: '900', marginTop: 13 },
  message: { color: palette.muted, fontSize: 13, lineHeight: 20, marginTop: 6 },
  details: { borderTopWidth: 1, borderTopColor: palette.line, marginTop: 15, paddingTop: 15 },
  detailLabel: { color: palette.tealDark, fontSize: 10, letterSpacing: 1, fontWeight: '900', marginBottom: 10 },
  evidenceRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', marginBottom: 8 },
  bullet: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.tealDark, marginTop: 5 },
  evidence: { color: palette.text, fontSize: 12, lineHeight: 18, flex: 1 },
  nextBox: { backgroundColor: palette.mint, borderRadius: 14, padding: 13, marginTop: 10 },
  nextLabel: { color: palette.tealDark, fontSize: 10, letterSpacing: 1, fontWeight: '900' },
  next: { color: palette.text, fontSize: 12, lineHeight: 18, marginTop: 5, fontWeight: '600' },
  expand: { color: palette.tealDark, fontSize: 12, fontWeight: '800', marginTop: 13 },
});
