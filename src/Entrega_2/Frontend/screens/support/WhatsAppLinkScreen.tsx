import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Appear, BottomSheet, SupportNotice } from '../../components/tickets';
import { AppButton, AppText, Badge, CardSkeleton, List, ListItem, OfflineBanner, SettingRow, Surface } from '../../components/ui';
import { formatFriendlyDateTime, formatShortDate, formatTime, isConnectivityError, supportErrorMessage, useWhatsAppLink, type WhatsAppLinkController } from '../../features/support';
import { useResponsive } from '../../hooks/useResponsive';
import { useAppNavigation } from '../../navigation/AppNavigator';
import { haptics } from '../../services/haptics';
import { makeStyles, useTheme } from '../../theme';
import type { SupportContactLinkView, SupportContactVerificationView, SupportWhatsAppLinkState } from '../../types/api';
import { pluralize } from '../../utils/format';

const useStyles = makeStyles((theme) => ({
  stack: { gap: theme.spacing.lg },
  block: { gap: theme.spacing.xs },
  notice: { marginBottom: theme.spacing.lg },
  demo: { gap: theme.spacing.xs, marginBottom: theme.spacing.lg },
  center: { alignItems: 'center', paddingVertical: theme.spacing.xxl },
  copy: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, minHeight: 32, marginTop: theme.spacing.xs },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  waitingText: { flex: 1 },
  actions: { gap: theme.spacing.sm },
  sheetActions: { gap: theme.spacing.sm, marginTop: theme.spacing.md },
}));

/** WhatsApp do atendimento: vinculação verificada do número do estudante, aberta pelo Perfil. */
export function WhatsAppLinkScreen() {
  const styles = useStyles();
  const navigation = useAppNavigation();
  const link = useWhatsAppLink();
  const { state, verification, step } = link;

  return (
    <Screen testID="whatsapp-link" refreshing={link.refreshing} onRefresh={link.refresh}>
      <ScreenHeader title="WhatsApp do atendimento" onBack={navigation.goBack} />
      <OfflineBanner />
      {state?.demoMode && step !== 'unavailable' ? <DemoLabel /> : null}
      {step !== 'error' ? (
        <View style={link.notice ? styles.notice : null}>
          <SupportNotice message={link.notice} tone="warning" icon="cloud-offline-outline" testID="whatsapp-notice" />
        </View>
      ) : null}

      {step === 'loading' ? <CardSkeleton lines={3} /> : null}
      {step === 'error' ? <LoadError link={link} /> : null}
      {step === 'unavailable' ? <UnavailableStep /> : null}
      {step === 'consent' && state ? <ConsentStep state={state} link={link} /> : null}
      {step === 'pending' && verification ? <PendingStep verification={verification} link={link} /> : null}
      {/* key: outro pedido começa sempre com a autorização dos chamados anteriores desligada */}
      {step === 'proven' && verification ? <ProvenStep key={verification.id} verification={verification} link={link} /> : null}
      {step === 'review' ? <ReviewStep /> : null}
      {step === 'restart' && verification ? <RestartStep verification={verification} link={link} /> : null}
      {step === 'linked' && state ? <LinkedStep state={state} link={link} /> : null}
    </Screen>
  );
}

function DemoLabel() {
  const styles = useStyles();
  return (
    <View style={styles.demo} testID="whatsapp-demo">
      <Badge label="Modo de demonstração" tone="warning" icon="ⓘ" />
      <AppText variant="caption" tone="muted">
        Neste ambiente, nenhuma mensagem real passa pelo WhatsApp.
      </AppText>
    </View>
  );
}

function ActionError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <AppText variant="bodySmall" tone="error" accessibilityRole="alert" testID="whatsapp-action-error">
      {message}
    </AppText>
  );
}

function LoadError({ link }: { link: WhatsAppLinkController }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Appear>
      <Surface style={styles.center} testID="whatsapp-error">
        <Ionicons name={isConnectivityError(link.loadError) ? 'cloud-offline-outline' : 'alert-circle-outline'} size={20} color={theme.colors.text.muted} />
        <AppText variant="h4" align="center" style={{ marginTop: theme.spacing.md }}>
          Não conseguimos carregar esta tela.
        </AppText>
        <AppText variant="bodySmall" tone="secondary" align="center" style={{ marginTop: 4, maxWidth: 300 }}>
          {supportErrorMessage(link.loadError, 'Verifique sua conexão e tente novamente.')}
        </AppText>
        <View style={{ marginTop: theme.spacing.lg }}>
          <AppButton label="Tentar novamente" onPress={link.refresh} testID="whatsapp-retry" />
        </View>
      </Surface>
    </Appear>
  );
}

function UnavailableStep() {
  const theme = useTheme();
  return (
    <Appear>
      <Surface testID="whatsapp-unavailable">
        <AppText variant="bodyStrong">O atendimento pelo WhatsApp não está disponível.</AppText>
        <AppText variant="bodySmall" tone="secondary" style={{ marginTop: theme.spacing.xs }}>
          Este canal não está ativo agora. Você continua podendo falar com o ASA pelo app, abrindo um chamado.
        </AppText>
      </Surface>
    </Appear>
  );
}

function ConsentStep({ state, link }: { state: SupportWhatsAppLinkState; link: WhatsAppLinkController }) {
  const styles = useStyles();
  const [accepted, setAccepted] = useState(false);
  return (
    <Appear style={styles.stack}>
      <View style={styles.block}>
        <AppText variant="h3" accessibilityRole="header">
          Vincule seu WhatsApp
        </AppText>
        <AppText variant="bodySmall" tone="secondary">
          Vamos gerar um código para você enviar do seu WhatsApp ao número do ASA. Assim confirmamos que o número é seu, sem precisar digitá-lo aqui.
        </AppText>
      </View>
      <Surface testID="whatsapp-consent-text">
        <AppText variant="caption" tone="muted" style={{ marginBottom: 4 }}>
          Aviso de privacidade
        </AppText>
        <AppText variant="bodySmall">{state.consentText}</AppText>
      </Surface>
      <List>
        <SettingRow kind="switch" label="Li e aceito este aviso" value={accepted} onChange={setAccepted} testID="whatsapp-consent-row" />
      </List>
      <ActionError message={link.actionError} />
      <AppButton label="Gerar código" fullWidth disabled={!accepted} loading={link.busy === 'create'} loadingLabel="Gerando código" onPress={link.start} testID="whatsapp-start" />
    </Appear>
  );
}

function PendingStep({ verification, link }: { verification: SupportContactVerificationView; link: WhatsAppLinkController }) {
  const theme = useTheme();
  const styles = useStyles();
  const responsive = useResponsive();
  const { code, openUrl } = link;
  const [copied, setCopied] = useState(false);

  const copyCode = (value: string) => {
    Clipboard.setStringAsync(value)
      .then(() => {
        haptics.selection();
        setCopied(true);
      })
      .catch(() => setCopied(false));
  };

  return (
    <Appear style={styles.stack}>
      <Surface testID="whatsapp-pending">
        {code ? (
          <>
            <AppText variant="caption" tone="muted">
              Seu código
            </AppText>
            <AppText
              variant="h1"
              selectable
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ fontSize: responsive.fs(28), lineHeight: responsive.fs(36), letterSpacing: 1, marginTop: 2 }}
              accessibilityLabel={`Seu código: ${code.split('').join(' ')}`}
              testID="whatsapp-code"
            >
              {code}
            </AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Copiar código" onPress={() => copyCode(code)} hitSlop={theme.hitSlop} style={styles.copy} testID="whatsapp-copy-code">
              <Ionicons name={copied ? 'checkmark-outline' : 'copy-outline'} size={14} color={theme.colors.text.link} />
              <AppText variant="caption" tone="link" style={{ fontWeight: '600' }}>
                {copied ? 'Copiado' : 'Copiar'}
              </AppText>
            </Pressable>
          </>
        ) : (
          <View style={styles.block} testID="whatsapp-code-lost">
            <AppText variant="bodyStrong">O código só aparece uma vez</AppText>
            <AppText variant="bodySmall" tone="secondary">
              Por segurança, ele é mostrado apenas quando é gerado. Se você ainda tem o código, pode enviá-lo normalmente. Se o perdeu, comece de novo.
            </AppText>
          </View>
        )}
      </Surface>

      <List testID="whatsapp-pending-details">
        {verification.institutionalNumber ? (
          <ListItem icon="call-outline" title="Número do ASA" value={verification.institutionalNumber} accessibilityLabel={`Número do ASA: ${verification.institutionalNumber}`} testID="whatsapp-number" />
        ) : null}
        <ListItem icon="time-outline" title="Válido até" value={formatTime(verification.expiresAt)} accessibilityLabel={`Código válido até ${formatTime(verification.expiresAt)}`} testID="whatsapp-expiry" />
      </List>

      <AppText variant="bodySmall" tone="secondary">
        Envie o código a partir do seu próprio WhatsApp, o número que você quer vincular. O ASA reconhece o número pela mensagem recebida, então não peça para outra pessoa enviar.
      </AppText>

      <ActionError message={link.actionError} />
      <View style={styles.actions}>
        {openUrl ? <AppButton label="Abrir o WhatsApp" icon="logo-whatsapp" fullWidth onPress={link.openWhatsApp} testID="whatsapp-open" /> : null}
        {code ? null : <AppButton label="Começar de novo" variant="secondary" fullWidth onPress={link.restart} testID="whatsapp-restart" />}
      </View>

      <View style={styles.waiting} accessible accessibilityLiveRegion="polite" testID="whatsapp-waiting">
        <ActivityIndicator size="small" color={theme.colors.text.muted} />
        <AppText variant="caption" tone="muted" style={styles.waitingText}>
          Aguardando sua mensagem. Esta tela se atualiza sozinha enquanto estiver aberta.
        </AppText>
      </View>
    </Appear>
  );
}

function ProvenStep({ verification, link }: { verification: SupportContactVerificationView; link: WhatsAppLinkController }) {
  const theme = useTheme();
  const styles = useStyles();
  const [linkPrevious, setLinkPrevious] = useState(false);
  const previous = verification.previousTicketsCount;
  return (
    <Appear style={styles.stack}>
      <Surface testID="whatsapp-proven">
        <AppText variant="h3" accessibilityRole="header">
          É este o seu número?
        </AppText>
        <AppText variant="h2" selectable style={{ marginTop: theme.spacing.sm }} testID="whatsapp-masked">
          {verification.contactMasked}
        </AppText>
        <AppText variant="bodySmall" tone="secondary" style={{ marginTop: theme.spacing.sm }}>
          Recebemos o código deste WhatsApp. Confirme apenas se o número for seu.
        </AppText>
      </Surface>
      {previous > 0 ? (
        <List>
          <SettingRow
            kind="switch"
            label={`Trazer ${pluralize(previous, 'atendimento anterior', 'atendimentos anteriores')} para a minha conta`}
            description="Ligados a este número e abertos pelo WhatsApp. Só serão vinculados se você autorizar."
            value={linkPrevious}
            onChange={setLinkPrevious}
            testID="whatsapp-link-previous"
          />
        </List>
      ) : null}
      <ActionError message={link.actionError} />
      <View style={styles.actions}>
        <AppButton label="Sim, é o meu número" fullWidth loading={link.busy === 'confirm'} loadingLabel="Confirmando" onPress={() => link.confirm(previous > 0 && linkPrevious)} testID="whatsapp-confirm" />
        <AppButton label="Não é o meu número" variant="ghost" fullWidth disabled={link.busy === 'confirm'} onPress={link.restart} testID="whatsapp-not-mine" />
      </View>
    </Appear>
  );
}

/** Texto genérico de propósito: nada aqui indica se o número tem outro dono. */
function ReviewStep() {
  const theme = useTheme();
  return (
    <Appear>
      <Surface testID="whatsapp-review">
        <AppText variant="bodyStrong">Pedido em análise</AppText>
        <AppText variant="bodySmall" tone="secondary" style={{ marginTop: theme.spacing.xs }}>
          A equipe do ASA vai analisar este pedido. Enquanto isso, seus atendimentos continuam normalmente no app.
        </AppText>
      </Surface>
    </Appear>
  );
}

function RestartStep({ verification, link }: { verification: SupportContactVerificationView; link: WhatsAppLinkController }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Appear style={styles.stack}>
      <Surface testID="whatsapp-restart-step">
        <AppText variant="bodyStrong">{verification.status === 'cancelled' ? 'Este pedido não está mais ativo.' : 'O prazo deste código terminou.'}</AppText>
        <AppText variant="bodySmall" tone="secondary" style={{ marginTop: theme.spacing.xs }}>
          Nada foi vinculado à sua conta. Para vincular seu WhatsApp, comece de novo.
        </AppText>
      </Surface>
      <ActionError message={link.actionError} />
      <AppButton label="Começar de novo" fullWidth onPress={link.restart} testID="whatsapp-restart" />
    </Appear>
  );
}

function LinkedStep({ state, link }: { state: SupportWhatsAppLinkState; link: WhatsAppLinkController }) {
  const theme = useTheme();
  const styles = useStyles();
  const [target, setTarget] = useState<SupportContactLinkView | null>(null);
  const several = state.links.length > 1;

  const close = () => setTarget(null);
  const ask = (item: SupportContactLinkView) => {
    link.clearActionError();
    setTarget(item);
  };
  const confirmRevoke = () => {
    if (!target) return;
    link
      .revoke(target.id)
      .then((done) => {
        if (done) close();
      })
      .catch(() => undefined);
  };

  return (
    <Appear style={styles.stack}>
      <List inset="icon" testID="whatsapp-linked">
        {state.links.map((item) => (
          <ListItem
            key={item.id}
            icon="logo-whatsapp"
            title={item.contactMasked}
            description={`Verificado em ${formatShortDate(item.verifiedAt)}`}
            trailing={<Badge label="Vinculado" tone="success" icon="✓" />}
            accessibilityLabel={`WhatsApp vinculado: ${item.contactMasked}. Verificado em ${formatFriendlyDateTime(item.verifiedAt)}`}
            testID={`whatsapp-link-${item.id}`}
          />
        ))}
      </List>
      {state.available ? null : (
        <AppText variant="bodySmall" tone="secondary" testID="whatsapp-linked-unavailable">
          O atendimento pelo WhatsApp não está disponível agora, mas você pode desfazer o vínculo.
        </AppText>
      )}
      <AppText variant="bodySmall" tone="secondary">
        Você pode desfazer o vínculo quando quiser. Os atendimentos que já existem continuam na sua conta.
      </AppText>
      <View style={styles.actions}>
        {state.links.map((item) => (
          <AppButton
            key={item.id}
            label={several ? `Desfazer vínculo de ${item.contactMasked}` : 'Desfazer vínculo'}
            variant="danger"
            fullWidth
            onPress={() => ask(item)}
            testID={`whatsapp-revoke-${item.id}`}
          />
        ))}
      </View>

      <BottomSheet
        visible={target !== null}
        onClose={close}
        title="Desfazer o vínculo?"
        description="Este número deixa de estar ligado à sua conta. Os atendimentos que já existem continuam na sua conta, e novas mensagens desse WhatsApp não entram nela."
        testID="whatsapp-revoke-sheet"
      >
        <ActionError message={link.actionError} />
        <View style={styles.sheetActions}>
          <AppButton label="Desfazer vínculo" variant="danger" fullWidth loading={link.busy === 'revoke'} loadingLabel="Desfazendo vínculo" onPress={confirmRevoke} testID="whatsapp-revoke-confirm" />
          <AppButton label="Manter vínculo" variant="ghost" fullWidth onPress={close} style={{ marginBottom: theme.spacing.xs }} testID="whatsapp-revoke-keep" />
        </View>
      </BottomSheet>
    </Appear>
  );
}
