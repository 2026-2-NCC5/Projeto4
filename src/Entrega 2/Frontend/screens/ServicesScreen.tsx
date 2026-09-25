import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { InsightCard, type Insight } from '../components/academic';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { AppText, Badge, EmptyState, OfflineBanner, PressableScale, ScheduleSkeleton, SectionHeader, Surface } from '../components/ui';
import { useOptionalAssistant } from '../features/assistant/hooks/useAssistant';
import { useAcademicOverview } from '../hooks/useAcademicOverview';
import { useResponsive } from '../hooks/useResponsive';
import { useOptionalAppNavigation } from '../navigation/AppNavigator';
import { makeStyles, useTheme } from '../theme';
import { formatDateTime, formatPercent, pluralize } from '../utils/format';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface ServiceItem {
  id: string;
  icon: IconName;
  title: string;
  description: string;
  badge?: string;
  onPress: () => void;
}

const useStyles = makeStyles((theme) => ({
  grid: { gap: theme.spacing.sm + 2 },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { flexGrow: 1, flexBasis: '46%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: theme.colors.brand.primarySoft, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
}));

/**
 * Serviços: análise do agente, histórico, contato com o ASA e orientações. Solicitações administrativas
 * nunca são executadas pelo app — o assistente orienta e a decisão continua humana.
 */
export function ServicesScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const navigation = useOptionalAppNavigation();
  const assistant = useOptionalAssistant();
  const overview = useAcademicOverview();
  const responsive = useResponsive();

  const ask = (text: string) => {
    if (!assistant) {
      navigation?.openAssistant('conversation');
      return;
    }
    assistant.openOverlay('button');
    void assistant.voice.submitText(text);
  };

  const services: ServiceItem[] = [
    { id: 'analysis', icon: 'sparkles-outline', title: 'Análise da situação acadêmica', description: 'O Agente para o Estudante analisa disciplinas, avaliações, frequência e pendências com evidências.', onPress: () => navigation?.openAssistant('analysis') },
    { id: 'history', icon: 'time-outline', title: 'Histórico de análises', description: 'Análises anteriores do agente, da mais recente para a mais antiga.', onPress: () => navigation?.openHistory() },
    { id: 'asa', icon: 'people-outline', title: 'Falar com o ASA', description: 'Como entrar em contato com a Área do Sucesso Alvarista, coordenação e professores.', onPress: () => ask('Como entro em contato com o ASA?') },
    { id: 'documents', icon: 'document-text-outline', title: 'Documentos e secretaria', description: 'Orientação sobre solicitações de documentos e correções de registros (validação humana).', onPress: () => ask('Com quem eu falo para solicitar um documento?') },
    { id: 'finance', icon: 'card-outline', title: 'Financeiro', description: 'O ASA Conecta não executa pagamentos. Pergunte ao assistente com quem falar.', onPress: () => ask('Preciso falar com o financeiro. Com quem eu falo?') },
    { id: 'settings', icon: 'options-outline', title: 'Configurações do assistente', description: 'Hey Asa, resposta por voz, histórico e privacidade.', onPress: () => navigation?.changeTab('profile') },
  ];

  const alerts: Insight[] = [];
  for (const subject of overview.lowAttendance.slice(0, 3)) {
    alerts.push({ id: `att-${subject.id}`, tone: 'warning', title: 'Acadêmico · Frequência', message: `${subject.name} está com ${formatPercent(subject.attendanceRate)} de frequência.`, actionLabel: 'Ver frequência', onAction: () => navigation?.openAcademicSegment('attendance') });
  }
  if (overview.overdueCount > 0) {
    alerts.push({ id: 'overdue', tone: 'danger', title: 'Acadêmico · Pendências', message: `${pluralize(overview.overdueCount, 'pendência vencida', 'pendências vencidas')}.`, actionLabel: 'Ver pendências', onAction: () => navigation?.openAcademicSegment('pending') });
  }
  const last = overview.summary.data?.lastAnalysis;
  if (last) {
    alerts.push({ id: 'analysis', tone: 'brand', title: 'Assistente · Última análise', message: `${last.summary} (${formatDateTime(last.createdAt)})`, actionLabel: 'Ver no assistente', onAction: () => navigation?.openAssistant('analysis') });
  }

  return (
    <Screen testID="services-screen">
      <ScreenHeader eyebrow="ASA Conecta" title="Serviços" subtitle="Atendimento, análises e orientações da sua jornada acadêmica." />
      <OfflineBanner />

      <SectionHeader title="Avisos" subtitle="Acadêmico · ASA · Assistente" flush />
      {overview.loading && alerts.length === 0 ? <ScheduleSkeleton rows={2} /> : null}
      {!overview.loading && alerts.length === 0 ? <EmptyState title="Nenhum aviso no momento" message="Tudo certo por aqui. ✓" tone="positive" compact /> : null}
      {alerts.map((alert) => (
        <InsightCard key={alert.id} insight={alert} />
      ))}

      <SectionHeader title="Serviços" />
      <View style={[styles.grid, responsive.columns === 2 && styles.gridWide]}>
        {services.map((service) => (
          <PressableScale key={service.id} accessibilityRole="button" accessibilityLabel={service.title} accessibilityHint={service.description} onPress={service.onPress} style={responsive.columns === 2 ? styles.cell : undefined} testID={`service-${service.id}`}>
            <Surface padding={theme.spacing.lg} style={{ flex: 1 }}>
              <View style={styles.row}>
                <View style={styles.icon}>
                  <Ionicons name={service.icon} size={22} color={theme.colors.brand.primaryStrong} />
                </View>
                <View style={styles.body}>
                  <AppText variant="bodyStrong">{service.title}</AppText>
                  <AppText variant="bodySmall" tone="muted" style={{ marginTop: 2 }}>
                    {service.description}
                  </AppText>
                  {service.badge ? (
                    <View style={{ marginTop: 6 }}>
                      <Badge label={service.badge} tone="info" size="small" />
                    </View>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.text.muted} />
              </View>
            </Surface>
          </PressableScale>
        ))}
      </View>

      <Surface tone="brand" style={{ marginTop: theme.spacing.xxl }}>
        <AppText variant="label" tone="brand" uppercase>
          Decisão humana
        </AppText>
        <AppText variant="bodySmall" style={{ marginTop: 6 }}>
          O assistente recomenda e orienta, mas nunca altera matrícula, notas, frequência ou pagamentos. Ações institucionais passam sempre por uma pessoa responsável.
        </AppText>
      </Surface>
    </Screen>
  );
}
