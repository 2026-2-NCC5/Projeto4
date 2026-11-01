import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppText } from '../components/ui/AppText';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { apiClient } from '../services/apiClient';
import { useTheme } from '../theme';

type Form = { name: string; email: string; cep: string; state: string; city: string; neighborhood: string; street: string; number: string; complement: string; noNumber: boolean; company: string; cnpj: string; start: string; end: string; activities: string };
type CaseRecord = { id: string; requestType: string; status: string; data: Record<string, unknown> };
type Generated = { document: { version: number; contentHash: string; validationStatus: string }; issues: { field: string; message: string }[]; preview: string; signatureProvider: string; officialDocument: boolean };
const empty: Form = { name: '', email: '', cep: '', state: '', city: '', neighborhood: '', street: '', number: '', complement: '', noNumber: false, company: '', cnpj: '', start: '', end: '', activities: '' };
const clientId = () => `internship-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function InternshipScreen({ onBack }: { onBack: () => void }) {
  const theme = useTheme();
  const [form, setForm] = useState<Form>(empty);
  const [caseData, setCaseData] = useState<CaseRecord | null>(null);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const colors = theme.colors;

  const data = useMemo(() => ({ student: { fullName: form.name, email: form.email, address: { zipCode: form.cep, state: form.state, city: form.city, neighborhood: form.neighborhood, street: form.street, number: form.number, complement: form.complement, noNumber: form.noNumber } }, company: { legalName: form.company, cnpj: form.cnpj }, contract: { startDate: form.start, endDate: form.end, activities: form.activities } }), [form]);
  const applyData = (raw: Record<string, unknown>) => {
    const student = raw.student as Record<string, unknown> | undefined;
    const address = student?.address as Record<string, unknown> | undefined;
    const company = raw.company as Record<string, unknown> | undefined;
    const contract = raw.contract as Record<string, unknown> | undefined;
    setForm({ name: String(student?.fullName ?? ''), email: String(student?.email ?? ''), cep: String(address?.zipCode ?? ''), state: String(address?.state ?? ''), city: String(address?.city ?? ''), neighborhood: String(address?.neighborhood ?? ''), street: String(address?.street ?? ''), number: String(address?.number ?? ''), complement: String(address?.complement ?? ''), noNumber: address?.noNumber === true, company: String(company?.legalName ?? ''), cnpj: String(company?.cnpj ?? ''), start: String(contract?.startDate ?? ''), end: String(contract?.endDate ?? ''), activities: String(contract?.activities ?? '') });
  };
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const cases = await apiClient.request<CaseRecord[]>('/api/v1/internships');
      if (cases[0]) { setCaseData(cases[0]); applyData(cases[0].data); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar os processos.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const save = async () => {
    setBusy(true); setMessage('');
    try {
      const saved = caseData
        ? await apiClient.request<CaseRecord>(`/api/v1/internships/${caseData.id}`, { method: 'PATCH', body: { data } })
        : await apiClient.request<CaseRecord>('/api/v1/internships', { method: 'POST', body: { clientRequestId: clientId(), requestType: 'first_contract', data } });
      setCaseData(saved); setGenerated(null); setMessage('Rascunho salvo no ASA Conecta.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao salvar. Tente novamente.'); }
    finally { setBusy(false); }
  };
  const generate = async () => {
    if (!caseData) { setMessage('Salve o rascunho antes de gerar a prévia.'); return; }
    setBusy(true); setMessage('');
    try {
      const result = await apiClient.request<Generated>(`/api/v1/internships/${caseData.id}/documents/generate`, { method: 'POST', body: {} });
      setGenerated(result); setMessage(result.issues.length ? 'Há campos obrigatórios para corrigir antes de encaminhar.' : 'Prévia gerada e snapshot preservado. Revise todos os campos.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível gerar a prévia.'); }
    finally { setBusy(false); }
  };
  const prepare = async () => {
    if (!caseData) return;
    setBusy(true);
    try { const result = await apiClient.request<{ message: string }>(`/api/v1/internships/${caseData.id}/submit`, { method: 'POST', body: {} }); setMessage(result.message); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível preparar o encaminhamento.'); }
    finally { setBusy(false); }
  };
  const field = (label: string, key: keyof Form, placeholder = '', required = false, multiline = false) => (
    <View key={key} style={styles.field}>
      <AppText variant="bodySmallStrong" tone="secondary">{label}{required ? ' *' : ''}</AppText>
      <TextInput accessibilityLabel={label} value={String(form[key])} onChangeText={(value) => setForm((old) => ({ ...old, [key]: value }))} placeholder={placeholder} placeholderTextColor={colors.text.placeholder} multiline={multiline} style={[styles.input, { color: colors.text.primary, backgroundColor: colors.surface.primary, borderColor: colors.border.default }, multiline && styles.multiline]} />
    </View>
  );
  const section = (title: string, children: React.ReactNode) => <View style={[styles.card, { backgroundColor: colors.surface.primary, borderColor: colors.border.subtle }]}><AppText variant="h3">{title}</AppText><View style={styles.sectionBody}>{children}</View></View>;
  const button = (title: string, action: () => void, primary = false, disabled = false) => <Pressable accessibilityRole="button" onPress={action} disabled={disabled || busy} style={[styles.button, { backgroundColor: primary ? colors.brand.primaryStrong : colors.surface.primary, borderColor: colors.border.default }, primary && styles.primary, (disabled || busy) && styles.disabled]}><AppText variant="bodySmallStrong" style={{ color: primary ? colors.text.onPrimary : colors.text.primary }}>{title}</AppText></Pressable>;

  return <Screen testID="internship-screen">
    <ScreenHeader title="Gestão de Estágios" subtitle="Cadastre, revise e acompanhe seus documentos." onBack={onBack} />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={[styles.demoNotice, { backgroundColor: colors.status.infoSoft }]}><Ionicons name="information-circle-outline" size={20} color={colors.status.infoText} /><AppText variant="bodySmall" style={{ color: colors.status.infoText, flex: 1 }}>Fluxo assistido. Os documentos gerados nesta versão são prévias demonstrativas; nenhuma assinatura ou envio oficial ocorre pelo app.</AppText></View>
      <View style={[styles.progress, { backgroundColor: colors.surface.primary, borderColor: colors.border.subtle }]}><AppText variant="bodySmallStrong">Progresso do processo</AppText><AppText variant="bodySmall" tone="secondary">Cadastro → Validação → Documento → Assinaturas → Análise → Conclusão</AppText><AppText variant="caption" tone="secondary">Situação: {caseData?.status ?? 'Rascunho local'}</AppText></View>
      {section('Dados do estudante', <>{field('Nome completo', 'name', 'Nome e sobrenome', true)}{field('E-mail', 'email', 'nome@exemplo.com', true)}</>)}
      {section('Endereço residencial', <>{field('CEP', 'cep', '00000-000', true)}{field('Estado / UF', 'state', 'SP', true)}{field('Cidade', 'city', 'São Paulo', true)}{field('Bairro', 'neighborhood', 'Bela Vista', true)}{field('Logradouro', 'street', 'Avenida, rua...', true)}{field('Número', 'number', 'Número do imóvel', !form.noNumber)}<Pressable accessibilityRole="checkbox" accessibilityState={{ checked: form.noNumber }} onPress={() => setForm((old) => ({ ...old, noNumber: !old.noNumber, number: !old.noNumber ? '' : old.number }))} style={styles.checkbox}><Ionicons name={form.noNumber ? 'checkbox' : 'square-outline'} size={20} color={colors.brand.primaryStrong} /><AppText variant="bodySmall">Endereço sem número</AppText></Pressable>{field('Complemento', 'complement', 'Apartamento, bloco (opcional)')}</>)}
      {section('Empresa concedente', <>{field('Razão social', 'company', 'Razão social', true)}{field('CNPJ', 'cnpj', '00.000.000/0000-00', true)}</>)}
      {section('Dados contratuais', <>{field('Data de início', 'start', 'AAAA-MM-DD', true)}{field('Data de término', 'end', 'AAAA-MM-DD', true)}{field('Atividades previstas', 'activities', 'Descreva as atividades do estágio', true, true)}</>)}
      {message ? <View accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: colors.surface.secondary }]}><AppText variant="bodySmall">{message}</AppText></View> : null}
      {generated ? <View style={[styles.card, { backgroundColor: colors.surface.primary, borderColor: generated.issues.length ? colors.status.error : colors.status.success }]}><AppText variant="h3">Prévia · versão {generated.document.version}</AppText><AppText variant="caption" tone="secondary">SHA-256 {generated.document.contentHash}</AppText><AppText variant="bodySmallStrong" style={styles.previewTitle}>{generated.document.validationStatus === 'valid' ? 'Validação concluída' : 'Documento bloqueado por inconsistências'}</AppText>{generated.issues.map((issue) => <AppText key={`${issue.field}:${issue.message}`} variant="bodySmall" style={{ color: colors.status.errorText }}>• {issue.message}</AppText>)}<AppText variant="bodySmall" style={styles.previewText}>{generated.preview}</AppText></View> : null}
      <View style={styles.actions}>{button('Salvar rascunho', () => void save(), true)}{button('Gerar prévia e validar', () => void generate(), false, !caseData)}{button('Preparar encaminhamento manual', () => void prepare(), false, !generated || generated.issues.length > 0 || generated.document.validationStatus !== 'valid')}</View>
      {busy ? <ActivityIndicator accessibilityLabel="Processando" color={colors.brand.primaryStrong} /> : null}
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({ content: { padding: 16, paddingBottom: 130, gap: 12 }, demoNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, padding: 12 }, progress: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 }, card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 }, sectionBody: { gap: 12, marginTop: 4 }, field: { gap: 6 }, input: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 }, multiline: { minHeight: 88, textAlignVertical: 'top', paddingTop: 12 }, checkbox: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8 }, button: { minHeight: 46, borderWidth: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }, primary: { borderColor: 'transparent' }, disabled: { opacity: 0.45 }, actions: { gap: 10 }, notice: { borderRadius: 10, padding: 12 }, previewTitle: { marginTop: 4 }, previewText: { fontFamily: 'monospace', lineHeight: 20, marginTop: 8 } });
