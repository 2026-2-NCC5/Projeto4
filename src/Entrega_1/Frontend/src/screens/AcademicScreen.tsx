import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Pill, ProgressBar, Screen, SectionTitle, palette } from '../components/UI';
import { pendingItems, subjects } from '../data/mockData';

export function AcademicScreen() {
  const [filter, setFilter] = useState<'disciplinas' | 'pendencias'>('disciplinas');

  return (
    <Screen>
      <Text style={styles.title}>Acadêmico</Text>
      <Text style={styles.subtitle}>Dados demonstrativos para apresentação do MVP.</Text>

      <View style={styles.segment}>
        <Segment label="Disciplinas" active={filter === 'disciplinas'} onPress={() => setFilter('disciplinas')} />
        <Segment label="Pendências" active={filter === 'pendencias'} onPress={() => setFilter('pendencias')} />
      </View>

      {filter === 'disciplinas' ? (
        <>
          <SectionTitle title="Suas disciplinas" />
          {subjects.map((subject) => (
            <Card key={subject.id} style={styles.subjectCard}>
              <View style={styles.subjectHeader}>
                <View style={styles.subjectCode}><Text style={styles.subjectCodeText}>{subject.code}</Text></View>
                <Pill label={subject.status === 'attention' ? 'Atenção' : 'Em dia'} tone={subject.status === 'attention' ? 'warning' : 'success'} />
              </View>
              <Text style={styles.subjectName}>{subject.name}</Text>
              <Text style={styles.professor}>{subject.professor}</Text>
              <View style={styles.metricsRow}>
                <Metric label="Nota" value={subject.grade?.toFixed(1) ?? '—'} />
                <Metric label="Frequência" value={`${subject.attendance}%`} />
                <Metric label="Progresso" value={`${subject.progress}%`} />
              </View>
              <ProgressBar value={subject.progress} warning={subject.status === 'attention'} />
            </Card>
          ))}
        </>
      ) : (
        <>
          <SectionTitle title="Pendências abertas" />
          {pendingItems.map((item) => (
            <Card key={item.id} style={styles.pendingCard}>
              <View style={styles.pendingTop}>
                <Pill label={item.priority === 'alta' ? 'Alta prioridade' : 'Média prioridade'} tone={item.priority === 'alta' ? 'warning' : 'info'} />
                <Text style={styles.due}>{item.dueLabel}</Text>
              </View>
              <Text style={styles.pendingTitle}>{item.title}</Text>
              <Text style={styles.pendingSubject}>{item.subject}</Text>
              <View style={styles.dateRow}><Text style={styles.dateIcon}>◷</Text><Text style={styles.dateText}>Prazo: {item.dueDate}</Text></View>
            </Card>
          ))}
          <Card style={styles.infoCard}>
            <Text style={styles.infoTitle}>Por que estes dados são mockados?</Text>
            <Text style={styles.infoText}>O protótipo utiliza dados acadêmicos fictícios para preservar privacidade. Login, cadastro e sessão usam Supabase Auth real.</Text>
          </Card>
        </>
      )}
    </Screen>
  );
}

function Segment({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.segmentItem, active && styles.segmentActive]}>
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: palette.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: palette.muted, fontSize: 14, marginTop: 4 },
  segment: { flexDirection: 'row', backgroundColor: '#E8EEF2', borderRadius: 15, padding: 4, marginTop: 20 },
  segmentItem: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  segmentActive: { backgroundColor: palette.white },
  segmentText: { color: palette.muted, fontSize: 13, fontWeight: '800' },
  segmentTextActive: { color: palette.text },
  subjectCard: { marginBottom: 12 },
  subjectHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subjectCode: { backgroundColor: palette.blueSoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  subjectCodeText: { color: '#2E6DA4', fontSize: 11, fontWeight: '900' },
  subjectName: { color: palette.text, fontSize: 17, fontWeight: '900', marginTop: 13 },
  professor: { color: palette.muted, fontSize: 12, marginTop: 4 },
  metricsRow: { flexDirection: 'row', marginVertical: 16 },
  metric: { flex: 1 },
  metricValue: { color: palette.text, fontSize: 17, fontWeight: '900' },
  metricLabel: { color: palette.muted, fontSize: 10, marginTop: 2 },
  pendingCard: { marginBottom: 12 },
  pendingTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  due: { color: palette.muted, fontSize: 11, fontWeight: '700' },
  pendingTitle: { color: palette.text, fontSize: 17, fontWeight: '900', marginTop: 14 },
  pendingSubject: { color: palette.tealDark, fontSize: 12, fontWeight: '800', marginTop: 4 },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 7 },
  dateIcon: { color: palette.muted },
  dateText: { color: palette.muted, fontSize: 12 },
  infoCard: { marginTop: 4, backgroundColor: palette.blueSoft },
  infoTitle: { color: '#275F8F', fontSize: 14, fontWeight: '900' },
  infoText: { color: '#426B8C', fontSize: 12, lineHeight: 18, marginTop: 5 },
});
