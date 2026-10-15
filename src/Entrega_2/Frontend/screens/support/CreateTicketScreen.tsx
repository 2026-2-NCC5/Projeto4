import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AnimatedCheck, Appear, StepIndicator, SupportNotice, UploadRow } from '../../components/tickets';
import { HelpArticleSheet } from '../../components/tickets/HelpArticleSheet';
import { SelectRow } from '../../components/tickets/SelectRow';
import { AppButton, AppText, List, ListItem, ScheduleSkeleton, Surface } from '../../components/ui';
import { categoryIcon, formatBusinessDays, formatFileSize, supportErrorMessage, useCreateTicket } from '../../features/support';
import { CREATE_STEP_LABELS, CREATE_STEPS, validateDetails, type CreateStep } from '../../features/support/state/createTicketReducer';
import { useNavBarInset } from '../../hooks/useNavBarInset';
import { useResponsive } from '../../hooks/useResponsive';
import { useAppNavigation } from '../../navigation/AppNavigator';
import { haptics } from '../../services/haptics';
import { makeStyles, useTheme } from '../../theme';
import type { SupportCatalog, SupportHelpArticle, SupportTicket } from '../../types/api';

const STEP_LABELS = CREATE_STEPS.map((step) => CREATE_STEP_LABELS[step]);
/** Sugestões da Central de ajuda por categoria (no máximo 3, nunca bloqueiam a abertura). */
const MAX_SUGGESTIONS = 3;

const useStyles = makeStyles((theme) => ({
  scroll: { paddingBottom: theme.spacing.xxl },
  title: { marginBottom: theme.spacing.xs },
  subtitle: { marginBottom: theme.spacing.lg },
  bar: { flexDirection: 'row', gap: theme.spacing.sm, paddingTop: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.border.default, backgroundColor: theme.colors.background.primary },
  field: { marginBottom: theme.spacing.xl },
  input: { ...theme.typography.input, color: theme.colors.text.primary, borderWidth: 1, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.md, backgroundColor: theme.colors.control.inputBackground },
  counterRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: theme.spacing.xs, gap: theme.spacing.md },
  selected: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  dropzone: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.border.strong, borderRadius: theme.radius.lg, paddingVertical: theme.spacing.xl, alignItems: 'center', gap: theme.spacing.xs, backgroundColor: theme.colors.surface.primary },
  review: { paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg, gap: 2 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  protocol: { alignItems: 'center', paddingVertical: theme.spacing.lg, paddingHorizontal: theme.spacing.xl, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border.default, backgroundColor: theme.colors.surface.primary, alignSelf: 'stretch', marginTop: theme.spacing.xl },
  bullet: { flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-start' },
}));

/** Abertura de chamado em etapas: Solicitação → Detalhes → Anexos → Revisão → Confirmação. */
export function CreateTicketScreen({ initialCategoryId }: { initialCategoryId?: string | undefined }) {
  const theme = useTheme();
  const styles = useStyles();
  const navigation = useAppNavigation();
  const navInset = useNavBarInset();
  const responsive = useResponsive();
  const scrollRef = useRef<ScrollView>(null);
  const controller = useCreateTicket(initialCategoryId);
  const { state, dispatch, catalog, uploads, stepIndex } = controller;
  const [attachError, setAttachError] = useState<string | null>(null);
  const [article, setArticle] = useState<SupportHelpArticle | null>(null);

  // Cada etapa começa do topo.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [state.step]);

  if (state.created) {
    return <TicketCreated ticket={state.created} catalog={catalog.data} onTrack={(id) => navigation.openTicket(id, { replace: true })} onDone={navigation.goBack} />;
  }

  const handleBack = () => {
    if (!controller.back()) navigation.goBack();
  };

  return (
    <Screen scroll={false} withNavSpace={false} keyboardAvoiding contentStyle={{ paddingBottom: 0 }} testID="create-ticket">
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Abrir chamado" onBack={handleBack} backLabel={stepIndex > 0 ? 'Etapa anterior' : 'Voltar'} />
        <StepIndicator steps={STEP_LABELS} current={stepIndex} />
        {state.restored ? <SupportNotice message="Restauramos o rascunho que você começou." icon="document-text-outline" actionLabel="Descartar" onAction={controller.discardDraft} testID="draft-restored" /> : null}
        {catalog.status === 'loading' ? <ScheduleSkeleton rows={4} /> : null}
        {catalog.status === 'error' ? (
          <SupportNotice message={supportErrorMessage(catalog.error, 'Não conseguimos carregar as categorias.')} tone="danger" icon="alert-circle-outline" actionLabel="Tentar novamente" onAction={catalog.reload} />
        ) : null}
        {catalog.data ? (
          // A troca de etapa entra com fade + slide lateral discreto.
          <Appear key={state.step} offset={0} offsetX={16} style={{ marginTop: theme.spacing.sm }}>
            {state.step === 'category' ? <CategoryStep catalog={catalog.data} categoryId={state.categoryId} subcategoryId={state.subcategoryId} onCategory={(id) => dispatch({ type: 'SELECT_CATEGORY', categoryId: id })} onSubcategory={(id) => dispatch({ type: 'SELECT_SUBCATEGORY', subcategoryId: id })} /> : null}
            {state.step === 'details' ? (
              <DetailsStep
                catalog={catalog.data}
                state={state}
                onSubject={(value) => dispatch({ type: 'SET_SUBJECT', value })}
                onDescription={(value) => dispatch({ type: 'SET_DESCRIPTION', value })}
                onOpenArticle={setArticle}
              />
            ) : null}
            {state.step === 'attachments' ? (
              <AttachmentsStep
                uploads={uploads}
                error={attachError}
                onPick={() => {
                  setAttachError(null);
                  uploads
                    .pick()
                    .then(setAttachError)
                    .catch(() => undefined);
                }}
              />
            ) : null}
            {state.step === 'review' ? <ReviewStep catalog={catalog.data} state={state} attachments={uploads.items.filter((item) => item.status === 'uploaded').map((item) => item.file.name)} onEdit={(step) => dispatch({ type: 'GO_TO', step })} /> : null}
          </Appear>
        ) : null}
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: navInset + theme.spacing.sm, marginHorizontal: -responsive.gutter, paddingHorizontal: responsive.gutter }]}>
        {stepIndex > 0 ? (
          <View style={{ flex: 1 }}>
            <AppButton label="Voltar" variant="secondary" onPress={handleBack} disabled={state.submitting} fullWidth testID="create-back" />
          </View>
        ) : null}
        <View style={{ flex: 2 }}>
          {state.step === 'review' ? (
            <AppButton label="Enviar chamado" icon="paper-plane-outline" onPress={() => void controller.submit()} loading={state.submitting} loadingLabel="Enviando chamado" fullWidth testID="create-submit" />
          ) : (
            <AppButton
              label="Continuar"
              icon="arrow-forward"
              iconPosition="right"
              onPress={controller.next}
              // Em "Detalhes" o botão fica ativo: tocar sem preencher mostra o que falta.
              disabled={state.step === 'details' ? !catalog.data : !controller.canContinue}
              fullWidth
              testID="create-next"
            />
          )}
        </View>
      </View>

      <HelpArticleSheet article={article} onClose={() => setArticle(null)} onOpenTicket={() => setArticle(null)} openTicketLabel="Continuar com o chamado" />
    </Screen>
  );
}

function StepTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const styles = useStyles();
  return (
    <>
      <AppText variant="h2" accessibilityRole="header" style={styles.title}>
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="body" tone="secondary" style={styles.subtitle}>
          {subtitle}
        </AppText>
      ) : null}
    </>
  );
}

function CategoryStep({ catalog, categoryId, subcategoryId, onCategory, onSubcategory }: { catalog: SupportCatalog; categoryId: string | null; subcategoryId: string | null; onCategory: (id: string) => void; onSubcategory: (id: string) => void }) {
  const theme = useTheme();
  const styles = useStyles();
  const category = catalog.categories.find((item) => item.id === categoryId) ?? null;
  const [picking, setPicking] = useState(!category);
  const showList = picking || !category;

  return (
    <View>
      <StepTitle title="Como podemos ajudar?" subtitle="Escolha o assunto mais próximo da sua solicitação." />
      {showList ? (
        <Surface padding={0} accessibilityRole="radiogroup" accessibilityLabel="Categorias">
          {catalog.categories.map((item, index) => (
            <SelectRow
              key={item.id}
              icon={categoryIcon(item.id)}
              title={item.label}
              description={item.description}
              selected={item.id === categoryId}
              divider={index > 0}
              onPress={() => {
                onCategory(item.id);
                setPicking(false);
              }}
              testID={`category-${item.id}`}
            />
          ))}
        </Surface>
      ) : (
        <View style={styles.selected}>
          <Ionicons name={categoryIcon(category.id)} size={20} color={theme.colors.brand.primaryStrong} />
          <AppText variant="bodyStrong" style={{ flex: 1 }}>
            {category.label}
          </AppText>
          <AppButton label="Trocar" variant="ghost" size="small" onPress={() => setPicking(true)} testID="category-change" />
        </View>
      )}
      {!showList && category && category.subcategories.length > 0 ? (
        // Subcategorias entram com fade + slide vertical de ~10 px.
        <Appear offset={10} style={{ marginTop: theme.spacing.xs }}>
          <AppText variant="h4" style={{ marginBottom: theme.spacing.sm }} accessibilityRole="header">
            Qual é o tipo de solicitação?
          </AppText>
          <Surface padding={0} accessibilityRole="radiogroup" accessibilityLabel={`Tipos de ${category.label}`}>
            {category.subcategories.map((item, index) => (
              <SelectRow key={item.id} title={item.label} selected={item.id === subcategoryId} divider={index > 0} onPress={() => onSubcategory(item.id)} testID={`subcategory-${item.id}`} />
            ))}
          </Surface>
        </Appear>
      ) : null}
    </View>
  );
}

interface FieldProps {
  label: string;
  helper: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  error: string | undefined;
  multiline?: boolean;
  testID: string;
}

function Field({ label, helper, value, onChange, maxLength, error, multiline = false, testID }: FieldProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  const near = value.length > maxLength * 0.9;
  const borderColor = error ? theme.colors.status.error : focused ? theme.colors.border.focus : theme.colors.control.inputBorder;
  return (
    <View style={styles.field}>
      <AppText variant="bodyStrong">{label}</AppText>
      <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 2, marginBottom: theme.spacing.sm }}>
        {helper}
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChange}
        maxLength={maxLength}
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, { borderColor }, multiline ? { minHeight: 140, textAlignVertical: 'top' } : null]}
        accessibilityLabel={label}
        accessibilityHint={helper}
        placeholderTextColor={theme.colors.text.placeholder}
        testID={testID}
      />
      <View style={styles.counterRow}>
        <View style={{ flex: 1 }}>
          {error ? (
            <Appear offset={-4}>
              <AppText variant="bodySmall" tone="error" accessibilityRole="alert" testID={`${testID}-error`}>
                {error}
              </AppText>
            </Appear>
          ) : null}
        </View>
        {multiline ? (
          <AppText variant="caption" tone={near ? 'warning' : 'muted'} accessibilityLabel={`${value.length} de ${maxLength} caracteres`}>
            {`${value.length} / ${maxLength}`}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

function DetailsStep({ catalog, state, onSubject, onDescription, onOpenArticle }: { catalog: SupportCatalog; state: ReturnType<typeof useCreateTicket>['state']; onSubject: (value: string) => void; onDescription: (value: string) => void; onOpenArticle: (article: SupportHelpArticle) => void }) {
  const theme = useTheme();
  const errors = validateDetails(state, catalog.limits);
  const category = catalog.categories.find((item) => item.id === state.categoryId);
  const subcategory = category?.subcategories.find((item) => item.id === state.subcategoryId);
  const suggestions = catalog.articles.filter((item) => item.categoryId === state.categoryId).slice(0, MAX_SUGGESTIONS);

  return (
    <View>
      <StepTitle title="Conte o que aconteceu" subtitle={[category?.label, subcategory?.label].filter(Boolean).join(' · ')} />
      <Field
        label="Assunto"
        helper="Descreva em poucas palavras o que aconteceu."
        value={state.subject}
        onChange={onSubject}
        maxLength={catalog.limits.subjectMaxLength}
        error={state.touched.subject ? errors.subject : undefined}
        testID="create-subject"
      />
      <Field
        label="Descrição"
        helper="Conte para o ASA o que você precisa. Quanto mais informações você fornecer, mais rápido conseguiremos ajudar."
        value={state.description}
        onChange={onDescription}
        maxLength={catalog.limits.descriptionMaxLength}
        error={state.touched.description ? errors.description : undefined}
        multiline
        testID="create-description"
      />
      {suggestions.length > 0 ? (
        <Appear index={1}>
          <AppText variant="bodySmallStrong" tone="secondary" style={{ marginBottom: theme.spacing.sm }}>
            Talvez isso resolva sua dúvida antes de abrir um chamado:
          </AppText>
          <List inset="icon">
            {suggestions.map((item) => (
              <ListItem key={item.id} icon="bulb-outline" title={item.title} description={item.summary} descriptionLines={2} onPress={() => onOpenArticle(item)} testID={`suggestion-${item.id}`} />
            ))}
          </List>
          <AppText variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
            Você pode continuar e abrir o chamado normalmente.
          </AppText>
        </Appear>
      ) : null}
    </View>
  );
}

function AttachmentsStep({ uploads, error, onPick }: { uploads: ReturnType<typeof useCreateTicket>['uploads']; error: string | null; onPick: () => void }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View>
      <StepTitle title="Quer anexar algum arquivo?" subtitle="Comprovantes, prints ou documentos ajudam o ASA a entender sua solicitação. É opcional." />
      <Pressable accessibilityRole="button" accessibilityLabel="Anexar arquivo" accessibilityHint="PDF, imagem ou documento de até 5 MB" onPress={onPick} style={({ pressed }) => [styles.dropzone, pressed && { backgroundColor: theme.colors.surface.secondary }]} testID="create-attach">
        <Ionicons name="cloud-upload-outline" size={26} color={theme.colors.brand.primaryStrong} />
        <AppText variant="bodyStrong" tone="brand">
          Anexar arquivo
        </AppText>
        <AppText variant="caption" tone="muted">
          PDF, JPG, PNG ou DOC · até 5 MB · até 5 arquivos
        </AppText>
      </Pressable>
      {error ? (
        <View style={{ marginTop: theme.spacing.md }}>
          <SupportNotice message={error} tone="danger" icon="alert-circle-outline" />
        </View>
      ) : null}
      {uploads.items.length > 0 ? (
        <Surface padding={0} style={{ marginTop: theme.spacing.lg }}>
          {uploads.items.map((item) => (
            <UploadRow key={item.localId} item={item} onRemove={() => uploads.remove(item.localId)} onRetry={() => uploads.retry(item.localId)} testID={`upload-${item.file.name}`} />
          ))}
        </Surface>
      ) : null}
      {uploads.busy ? (
        <AppText variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }} accessibilityLiveRegion="polite">
          Aguarde o envio terminar para continuar.
        </AppText>
      ) : null}
    </View>
  );
}

function ReviewStep({ catalog, state, attachments, onEdit }: { catalog: SupportCatalog; state: ReturnType<typeof useCreateTicket>['state']; attachments: string[]; onEdit: (step: CreateStep) => void }) {
  const theme = useTheme();
  const styles = useStyles();
  const category = catalog.categories.find((item) => item.id === state.categoryId);
  const subcategory = category?.subcategories.find((item) => item.id === state.subcategoryId);
  const rows: { label: string; value: string; step: CreateStep; lines?: number }[] = [
    { label: 'Categoria', value: category?.label ?? '—', step: 'category' },
    ...(subcategory ? [{ label: 'Tipo', value: subcategory.label, step: 'category' as const }] : []),
    { label: 'Assunto', value: state.subject.trim(), step: 'details' },
    { label: 'Descrição', value: state.description.trim(), step: 'details', lines: 6 },
    { label: 'Anexos', value: attachments.length > 0 ? attachments.join('\n') : 'Nenhum arquivo', step: 'attachments' },
  ];
  return (
    <View>
      <StepTitle title="Revise sua solicitação" subtitle="Confira os dados antes de enviar. Você pode editar qualquer parte." />
      <Surface padding={0}>
        {rows.map((row, index) => (
          <View key={row.label} style={[styles.review, index > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border.subtle } : null]}>
            <View style={styles.reviewHeader}>
              <AppText variant="caption" tone="muted">
                {row.label}
              </AppText>
              <Pressable accessibilityRole="button" accessibilityLabel={`Editar ${row.label.toLowerCase()}`} onPress={() => onEdit(row.step)} hitSlop={theme.hitSlop} style={{ minHeight: 32, justifyContent: 'center' }} testID={`review-edit-${row.step}-${index}`}>
                <AppText variant="bodySmallStrong" tone="link">
                  Editar
                </AppText>
              </Pressable>
            </View>
            <AppText variant="body" numberOfLines={row.lines}>
              {row.value}
            </AppText>
          </View>
        ))}
      </Surface>
      {category ? (
        <View style={[styles.bullet, { marginTop: theme.spacing.lg }]}>
          <Ionicons name="time-outline" size={18} color={theme.colors.text.secondary} />
          <AppText variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
            {`Solicitações de ${category.label.toLowerCase()} costumam ser respondidas em ${formatBusinessDays(category.slaBusinessDays)}.`}
          </AppText>
        </View>
      ) : null}
      <View style={[styles.bullet, { marginTop: theme.spacing.sm }]}>
        <Ionicons name="lock-closed-outline" size={18} color={theme.colors.text.secondary} />
        <AppText variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
          Só você e a equipe do ASA veem este chamado.
        </AppText>
      </View>
      {state.submitError ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          <SupportNotice message={state.submitError} tone="danger" icon="alert-circle-outline" testID="create-error" />
        </View>
      ) : null}
    </View>
  );
}

function TicketCreated({ ticket, catalog, onTrack, onDone }: { ticket: SupportTicket; catalog: SupportCatalog | null; onTrack: (id: string) => void; onDone: () => void }) {
  const theme = useTheme();
  const styles = useStyles();
  const [notice, setNotice] = useState<string | null>(null);
  const days = catalog?.categories.find((item) => item.id === ticket.categoryId)?.slaBusinessDays ?? ticket.sla.targetBusinessDays;

  const copy = () => {
    Clipboard.setStringAsync(ticket.protocol)
      .then(() => {
        haptics.selection();
        setNotice('Protocolo copiado');
      })
      .catch(() => setNotice('Não foi possível copiar. Anote o protocolo.'));
  };

  return (
    <Screen testID="ticket-created">
      <View style={{ alignItems: 'center', paddingTop: theme.spacing.xxxl }}>
        <AnimatedCheck size={88} />
        <Appear index={3} style={{ alignItems: 'center' }}>
          <AppText variant="h1" align="center" style={{ marginTop: theme.spacing.xl }} accessibilityRole="header">
            Chamado aberto!
          </AppText>
          <AppText variant="body" tone="secondary" align="center" style={{ marginTop: theme.spacing.xs }}>
            Sua solicitação foi enviada para o ASA.
          </AppText>
        </Appear>
        <Appear index={5} style={styles.protocol}>
          <AppText variant="caption" tone="muted">
            Protocolo
          </AppText>
          <AppText variant="h2" selectable style={{ marginTop: 2, letterSpacing: 0.5 }} testID="created-protocol">
            {`#${ticket.protocol}`}
          </AppText>
          <View style={{ marginTop: theme.spacing.sm }}>
            <AppButton label="Copiar protocolo" icon="copy-outline" variant="ghost" size="small" onPress={copy} testID="copy-protocol" />
          </View>
        </Appear>
        <View style={{ alignSelf: 'stretch', marginTop: theme.spacing.md }}>
          <SupportNotice message={notice} tone="success" icon="checkmark-circle-outline" autoHideMs={2200} onHide={() => setNotice(null)} />
        </View>
      </View>
      <Appear index={7} style={{ marginTop: theme.spacing.xl, gap: theme.spacing.md }}>
        <AppText variant="h4">O que acontece agora</AppText>
        {[
          { icon: 'git-branch-outline' as const, text: 'O ASA faz a triagem e encaminha para a equipe certa.' },
          { icon: 'notifications-outline' as const, text: 'Você recebe um aviso a cada atualização.' },
          { icon: 'time-outline' as const, text: `Previsão de resposta: ${formatBusinessDays(days)}.` },
        ].map((item) => (
          <View key={item.text} style={styles.bullet}>
            <Ionicons name={item.icon} size={18} color={theme.colors.brand.primaryStrong} />
            <AppText variant="body" style={{ flex: 1 }}>
              {item.text}
            </AppText>
          </View>
        ))}
        {ticket.attachments.length > 0 ? (
          <AppText variant="caption" tone="muted">{`${ticket.attachments.length} ${ticket.attachments.length === 1 ? 'arquivo anexado' : 'arquivos anexados'} (${formatFileSize(ticket.attachments.reduce((sum, item) => sum + item.sizeBytes, 0))}).`}</AppText>
        ) : null}
      </Appear>
      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xxl }}>
        <AppButton label="Acompanhar chamado" icon="arrow-forward" iconPosition="right" onPress={() => onTrack(ticket.id)} fullWidth testID="created-track" />
        <AppButton label="Voltar ao Atendimento" variant="ghost" onPress={onDone} fullWidth />
      </View>
    </Screen>
  );
}
