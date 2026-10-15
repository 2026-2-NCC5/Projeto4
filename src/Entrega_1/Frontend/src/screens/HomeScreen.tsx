import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { User } from '@supabase/supabase-js';
import { academicSummary, pendingItems, recommendations } from '../data/mockData';
import { Card, Pill, ProgressBar, Screen, SectionTitle, palette } from '../components/UI';
import { TabKey } from '../types';

export function HomeScreen({ user, onNavigate }: { user: User; onNavigate: (tab: TabKey) => void }) {
  const name = String(user.user_metadata?.full_name || user.email?.split('@')[0] || 'Estudante');
  const firstName = name.split(' ')[0] || 'Estudante';
  const topRecommendation = recommendations[0]!;

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>QUINTA-FEIRA, 27 AGO</Text>
          <Text style={styles.hello}>Olá, {firstName} 👋</Text>
          <Text style={styles.subtitle}>Veja o que merece sua atenção hoje.</Text>
        </View>
        <View style={styles.avatar}><Text style={styles.avatarText}>{firstName.slice(0, 1).toUpperCase()}</Text></View>
      </View>

      <Card style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={styles.aiIcon}><Text style={styles.aiIconText}>✦</Text></View>
          <Pill label="Análise atualizada" tone="success" />
        </View>
        <Text style={styles.heroTitle}>Seu panorama acadêmico</Text>
        <Text style={styles.heroDescription}>O ASA encontrou {academicSummary.pending} pendências e {academicSummary.attention} pontos de atenção no cenário atual.</Text>
        <Pressable onPress={() => onNavigate('assistant')} accessibilityRole="button" style={styles.heroButton}>
          <Text style={styles.heroButtonText}>Conversar com o assistente</Text>
          <Text style={styles.heroArrow}>›</Text>
        </Pressable>
      </Card>

      <View style={styles.statsGrid}>
        <StatCard value={String(academicSummary.subjects)} label="Disciplinas" detail="ativas" />
        <StatCard value={String(academicSummary.pending)} label="Pendências" detail="para revisar" attention />
        <StatCard value={academicSummary.averageGrade.toFixed(1)} label="Média geral" detail="cenário demo" />
        <StatCard value={`${academicSummary.averageAttendance}%`} label="Frequência" detail="média" />
      </View>

      <SectionTitle title="Prioridade de hoje" action="Ver recomendações" />
      <Pressable onPress={() => onNavigate('recommendations')}>
        <Card>
          <View style={styles.rowBetween}>
            <Pill label="Atenção" tone="warning" />
            <Text style={styles.confidence}>{Math.round(topRecommendation.confidence * 100)}% confiança</Text>
          </View>
          <Text style={styles.recTitle}>{topRecommendation.title}</Text>
          <Text style={styles.recText}>{topRecommendation.message}</Text>
          <View style={styles.divider} />
          <Text style={styles.nextLabel}>PRÓXIMA AÇÃO</Text>
          <Text style={styles.nextText}>{topRecommendation.nextAction}</Text>
        </Card>
      </Pressable>

      <SectionTitle title="Próximos prazos" action="Acadêmico" />
      {pendingItems.map((item) => (
        <Card key={item.id} style={styles.pendingCard}>
          <View style={styles.deadlineBadge}><Text style={styles.deadlineNumber}>{item.dueDate.slice(0, 2)}</Text><Text style={styles.deadlineMonth}>AGO</Text></View>
          <View style={styles.pendingBody}>
            <Text style={styles.pendingSubject}>{item.subject}</Text>
            <Text style={styles.pendingTitle}>{item.title}</Text>
            <Text style={styles.pendingDue}>{item.dueLabel}</Text>
          </View>
        </Card>
      ))}

      <SectionTitle title="Progresso do semestre" />
      <Card>
        <View style={styles.rowBetween}><Text style={styles.progressLabel}>Semestre concluído</Text><Text style={styles.progressValue}>65%</Text></View>
        <ProgressBar value={65} />
        <Text style={styles.progressHint}>Você está avançando bem. Mantenha o foco nas entregas desta semana.</Text>
      </Card>
    </Screen>
  );
}

function StatCard({ value, label, detail, attention = false }: { value: string; label: string; detail: string; attention?: boolean }) {
  return (
    <View style={[styles.statCard, attention && styles.statCardAttention]}>
      <Text style={[styles.statValue, attention && { color: '#9A6200' }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statDetail}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  eyebrow: { color: palette.tealDark, fontSize: 10, letterSpacing: 1.1, fontWeight: '900' },
  hello: { color: palette.text, fontSize: 28, fontWeight: '900', marginTop: 4 },
  subtitle: { color: palette.muted, fontSize: 14, marginTop: 4 },
  avatar: { width: 46, height: 46, borderRadius: 16, backgroundColor: palette.navy, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: palette.teal, fontSize: 20, fontWeight: '900' },
  heroCard: { backgroundColor: palette.navy, borderColor: palette.navy, padding: 20 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  aiIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#123A50', alignItems: 'center', justifyContent: 'center' },
  aiIconText: { color: palette.teal, fontSize: 22 },
  heroTitle: { color: palette.white, fontSize: 22, fontWeight: '900', marginTop: 18 },
  heroDescription: { color: '#B7C8D2', fontSize: 14, lineHeight: 21, marginTop: 8 },
  heroButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#11354A', borderRadius: 14, padding: 14, marginTop: 18 },
  heroButtonText: { color: palette.white, fontSize: 14, fontWeight: '800' },
  heroArrow: { color: palette.teal, fontSize: 25, lineHeight: 24 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  statCard: { width: '48%', flexGrow: 1, backgroundColor: palette.white, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#EAF0F3' },
  statCardAttention: { backgroundColor: '#FFFBF1', borderColor: '#F7E7BC' },
  statValue: { color: palette.text, fontSize: 24, fontWeight: '900' },
  statLabel: { color: palette.text, fontSize: 13, fontWeight: '800', marginTop: 4 },
  statDetail: { color: palette.muted, fontSize: 11, marginTop: 2 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  confidence: { color: palette.muted, fontSize: 11, fontWeight: '700' },
  recTitle: { color: palette.text, fontSize: 18, fontWeight: '900', marginTop: 14 },
  recText: { color: palette.muted, fontSize: 14, lineHeight: 21, marginTop: 7 },
  divider: { height: 1, backgroundColor: palette.line, marginVertical: 15 },
  nextLabel: { color: palette.tealDark, fontSize: 10, letterSpacing: 1, fontWeight: '900' },
  nextText: { color: palette.text, fontSize: 13, lineHeight: 20, marginTop: 5, fontWeight: '600' },
  pendingCard: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, padding: 14 },
  deadlineBadge: { width: 54, height: 58, borderRadius: 16, backgroundColor: palette.warningSoft, alignItems: 'center', justifyContent: 'center' },
  deadlineNumber: { color: '#8E5C00', fontSize: 19, fontWeight: '900' },
  deadlineMonth: { color: '#8E5C00', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  pendingBody: { flex: 1, marginLeft: 13 },
  pendingSubject: { color: palette.tealDark, fontSize: 11, fontWeight: '900' },
  pendingTitle: { color: palette.text, fontSize: 14, fontWeight: '800', marginTop: 3 },
  pendingDue: { color: palette.muted, fontSize: 11, marginTop: 4 },
  progressLabel: { color: palette.text, fontSize: 14, fontWeight: '800' },
  progressValue: { color: palette.tealDark, fontSize: 16, fontWeight: '900' },
  progressHint: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 12 },
});
