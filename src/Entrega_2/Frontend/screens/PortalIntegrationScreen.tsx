import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { AppText } from '../components/ui/AppText';
import { apiClient } from '../services/apiClient';
import { useTheme } from '../theme';

type PortalStatus = { connectionId: string; connectedAt: string; lastSyncAt: string | null; revokedAt: string | null } | null;
type RouteInfo = { route: { title: string; route: string; page_kind: string; depth: number; warnings: string[] }; status: string };

export function PortalIntegrationScreen({ onBack }: { onBack: () => void }) {
  const theme = useTheme();
  const [status, setStatus] = useState<PortalStatus>(null);
  const [routes, setRoutes] = useState<RouteInfo[]>([]);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [connection, navigation] = await Promise.all([
        apiClient.request<PortalStatus>('/api/v1/portal/status'),
        apiClient.request<RouteInfo[]>('/api/v1/portal/navigation').catch(() => []),
      ]);
      setStatus(connection);
      setRoutes(navigation);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar o conector.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const connect = async () => {
    setBusy(true); setMessage('');
    try {
      const result = await apiClient.request<{ connectionId: string; syncToken: string }>('/api/v1/portal/connect', { method: 'POST', body: {} });
      setToken(result.syncToken); setMessage('Token pessoal criado. Copie e configure localmente no serviço fecap-collector.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível criar a conexão.'); }
    finally { setBusy(false); }
  };
  const disconnect = async () => {
    setBusy(true);
    try { await apiClient.request('/api/v1/portal/connection', { method: 'DELETE', body: {} }); setToken(''); setMessage('Conexão revogada.'); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível revogar a conexão.'); }
    finally { setBusy(false); }
  };
  const button = (label: string, onPress: () => void, destructive = false) => <Pressable accessibilityRole="button" disabled={busy} onPress={onPress} style={[styles.button, { backgroundColor: destructive ? theme.colors.status.errorSoft : theme.colors.brand.primaryStrong, opacity: busy ? 0.5 : 1 }]}><AppText variant="bodySmallStrong" style={{ color: destructive ? theme.colors.status.errorText : theme.colors.text.onPrimary }}>{label}</AppText></Pressable>;
  return <Screen testID="fecap-portal-screen">
    <ScreenHeader title="Portal Educacional FECAP" subtitle="Conector pessoal, local e somente leitura." onBack={onBack} />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={[styles.notice, { backgroundColor: theme.colors.status.infoSoft }]}><Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.status.infoText} /><AppText variant="bodySmall" style={{ color: theme.colors.status.infoText, flex: 1 }}>A senha do Portal não é solicitada nem armazenada pelo ASA Conecta. O login acontece no seu computador pelo navegador local. MFA e CAPTCHA permanecem manuais. Nenhuma ação de escrita é executada.</AppText></View>
      <View style={[styles.card, { backgroundColor: theme.colors.surface.primary, borderColor: theme.colors.border.subtle }]}>
        <AppText variant="h3">Conexão de sincronização</AppText>
        <AppText variant="bodySmall" tone="secondary">{status?.revokedAt ? 'Conexão revogada' : status ? `Ativa desde ${new Date(status.connectedAt).toLocaleString()}` : 'Nenhuma conexão configurada'}</AppText>
        <AppText variant="caption" tone="secondary">Última sincronização: {status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'ainda não sincronizado'}</AppText>
        {status && !status.revokedAt ? button('Revogar conexão', disconnect, true) : button('Criar token pessoal', connect)}
        {token ? <View style={[styles.tokenBox, { borderColor: theme.colors.border.default }]}><AppText variant="caption" tone="warning">Exibido uma única vez. Cole apenas no `.env` local e não compartilhe.</AppText><AppText selectable variant="bodySmallStrong">{token}</AppText>{button('Copiar token', () => { void Clipboard.setStringAsync(token); setMessage('Token copiado para a área de transferência.'); })}</View> : null}
      </View>
      <View style={[styles.card, { backgroundColor: theme.colors.surface.primary, borderColor: theme.colors.border.subtle }]}>
        <AppText variant="h3">Mapa descoberto</AppText>
        {routes.length ? routes.map((item, index) => <View key={`${item.route.route}-${index}`} style={[styles.route, { borderColor: theme.colors.border.subtle }]}><AppText variant="bodySmallStrong">{'　'.repeat(Math.min(item.route.depth, 5))}{item.route.title}</AppText><AppText variant="caption" tone="secondary">{item.route.page_kind} · {item.status}</AppText></View>) : <AppText variant="bodySmall" tone="secondary">Nenhuma navegação real sincronizada. Execute `fecap-portal scan --read-only` no serviço local depois de autenticar sua própria conta.</AppText>}
      </View>
      {message ? <AppText accessibilityRole="alert" variant="bodySmall" tone="info">{message}</AppText> : null}
      {busy ? <ActivityIndicator accessibilityLabel="Carregando conexão" color={theme.colors.brand.primaryStrong} /> : null}
      <AppText variant="caption" tone="muted">O inventário pode conter dados acadêmicos pessoais e é visível somente nesta conta. O crawler salva evidências localmente com permissões restritas; o envio à API só ocorre com sincronização explicitamente habilitada.</AppText>
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({ content: { gap: 12, paddingBottom: 120 }, notice: { flexDirection: 'row', gap: 10, borderRadius: 12, padding: 12 }, card: { gap: 10, borderWidth: 1, borderRadius: 14, padding: 16 }, button: { minHeight: 44, borderRadius: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }, tokenBox: { gap: 10, borderWidth: 1, borderRadius: 10, padding: 12 }, route: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8, gap: 2 } });
