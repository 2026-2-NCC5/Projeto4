import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';

import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Appear, BottomSheet, FilterChips, SearchField, SupportNotice, TicketEmptyState, TicketListSkeleton, TicketRow, type ChipOption, type RowPosition } from '../../components/tickets';
import { AppButton, AppText, IconButton, List, ListItem, OfflineBanner } from '../../components/ui';
import { DETAILED_FILTERS, findFilter, isConnectivityError, PRIMARY_FILTERS, SUPPORT, supportErrorMessage, useTickets, type TicketFilterKey } from '../../features/support';
import { useNavBarInset } from '../../hooks/useNavBarInset';
import { useAppNavigation } from '../../navigation/AppNavigator';
import { makeStyles, useTheme } from '../../theme';
import type { SupportListFilter } from '../../types/ui';
import { pluralize } from '../../utils/format';

const useStyles = makeStyles((theme) => ({
  header: { gap: theme.spacing.md, marginBottom: theme.spacing.md },
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border.default },
  footer: { paddingVertical: theme.spacing.lg, alignItems: 'center' },
}));

function positionOf(index: number, total: number): RowPosition {
  if (total === 1) return 'only';
  if (index === 0) return 'first';
  return index === total - 1 ? 'last' : 'middle';
}

/** "Meus chamados": filtros, busca, paginação e atualização em segundo plano. */
export function TicketsScreen({ initialFilter }: { initialFilter?: SupportListFilter | undefined }) {
  const theme = useTheme();
  const styles = useStyles();
  const navigation = useAppNavigation();
  const navInset = useNavBarInset();
  const [filter, setFilter] = useState<TicketFilterKey>(initialFilter ?? 'all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const { list, items, counts, searching, hasMore, loadingMore, loadMoreError, loadMore } = useTickets(filter, search);

  // A busca vai ao servidor só quando o estudante para de digitar.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), SUPPORT.SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const detailed = DETAILED_FILTERS.some((item) => item.key === filter) && !PRIMARY_FILTERS.some((item) => item.key === filter);
  const chips: ChipOption<TicketFilterKey>[] = [
    ...PRIMARY_FILTERS.map((item) => ({
      key: item.key,
      label: item.label,
      ...(item.key === 'waiting_student' && counts ? { count: counts.waitingStudent } : {}),
    })),
    ...(detailed ? [{ key: filter, label: findFilter(filter).label }] : []),
  ];
  const filtering = filter !== 'all' || search.trim().length > 0;
  const offline = Boolean(list.error && list.data && isConnectivityError(list.error));

  const header = (
    <View style={styles.header}>
      <ScreenHeader
        title="Meus chamados"
        onBack={navigation.goBack}
        right={<IconButton icon="add" tone="brand" accessibilityLabel="Abrir chamado" onPress={() => navigation.openNewTicket()} testID="tickets-new" />}
      />
      <OfflineBanner />
      {offline ? <SupportNotice message="Você está offline. Mostrando a última atualização disponível." icon="cloud-offline-outline" tone="warning" /> : null}
      <SearchField value={searchInput} onChange={setSearchInput} testID="tickets-search" />
      <FilterChips
        options={chips}
        value={filter}
        onChange={setFilter}
        accessibilityLabel="Filtrar chamados"
        testID="tickets-filter"
        trailing={
          <Pressable accessibilityRole="button" accessibilityLabel="Mais filtros" onPress={() => setSheetOpen(true)} style={styles.more} hitSlop={{ top: 4, bottom: 4 }} testID="tickets-more-filters">
            <Ionicons name="options-outline" size={16} color={theme.colors.text.secondary} />
            <AppText variant="bodySmallStrong" tone="secondary">
              Filtros
            </AppText>
          </Pressable>
        }
      />
      {searching ? (
        <AppText variant="caption" tone="muted" accessibilityLiveRegion="polite" testID="tickets-searching">
          Buscando...
        </AppText>
      ) : items.length > 0 ? (
        <AppText variant="caption" tone="muted" accessibilityLiveRegion="polite">
          {filtering ? `${pluralize(items.length, 'chamado encontrado', 'chamados encontrados')}${hasMore ? ' (há mais)' : ''}` : `${pluralize(counts?.all ?? items.length, 'chamado', 'chamados')} · ${counts?.active ?? 0} em andamento`}
        </AppText>
      ) : null}
    </View>
  );

  const empty =
    list.status === 'loading' && !searching ? (
      <TicketListSkeleton />
    ) : list.status === 'error' ? (
      <SupportNotice message={supportErrorMessage(list.error, 'Não conseguimos carregar seus chamados.')} tone="danger" icon="alert-circle-outline" actionLabel="Tentar novamente" onAction={list.reload} testID="tickets-error" />
    ) : filtering ? (
      <TicketEmptyState
        title="Nenhum chamado encontrado"
        message={search ? `Nada corresponde a "${search}". Tente outro termo ou o número do protocolo.` : 'Nenhum chamado nesta situação.'}
        actionLabel="Ver todos"
        onAction={() => {
          setFilter('all');
          setSearchInput('');
        }}
        testID="tickets-empty-filter"
      />
    ) : (
      <TicketEmptyState actionLabel="Abrir meu primeiro chamado" onAction={() => navigation.openNewTicket()} />
    );

  return (
    <Screen scroll={false} withNavSpace={false} contentStyle={{ paddingBottom: 0 }} testID="tickets-screen">
      <FlatList
        // Trocar o filtro remonta a lista: as linhas entram com fade + slide lateral discreto.
        key={filter}
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <Appear index={index} offset={0} offsetX={10}>
            <TicketRow ticket={item} position={positionOf(index, items.length)} onPress={() => navigation.openTicket(item.id)} testID={`ticket-row-${item.protocol}`} />
          </Appear>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          <View style={[styles.footer, { paddingBottom: navInset + theme.spacing.xxl }]}>
            {loadingMore ? <ActivityIndicator color={theme.colors.brand.primaryStrong} accessibilityLabel="Carregando mais chamados" /> : null}
            {loadMoreError ? <AppButton label="Tentar carregar mais" variant="ghost" size="small" onPress={loadMore} /> : null}
          </View>
        }
        onEndReached={() => {
          if (hasMore) loadMore();
        }}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={theme.colors.brand.primaryStrong} colors={[theme.colors.brand.primaryStrong]} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        windowSize={7}
        testID="tickets-list"
      />

      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Filtrar chamados" description="Escolha uma situação específica." testID="tickets-filter-sheet">
        <List inset="icon">
          {DETAILED_FILTERS.map((item) => (
            <ListItem
              key={item.key}
              icon={filter === item.key ? 'radio-button-on' : 'radio-button-off'}
              iconColor={filter === item.key ? theme.colors.brand.primaryStrong : theme.colors.text.muted}
              title={item.label}
              value={counts && item.statuses ? String(item.statuses.reduce((sum, status) => sum + (counts.byStatus[status] ?? 0), 0)) : undefined}
              showChevron={false}
              accessibilityLabel={`${item.label}${filter === item.key ? ', selecionado' : ''}`}
              onPress={() => {
                setFilter(item.key);
                setSheetOpen(false);
              }}
              testID={`filter-${item.key}`}
            />
          ))}
        </List>
        <View style={{ marginTop: theme.spacing.md }}>
          <AppButton
            label="Mostrar todos"
            variant="ghost"
            onPress={() => {
              setFilter('all');
              setSheetOpen(false);
            }}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}
