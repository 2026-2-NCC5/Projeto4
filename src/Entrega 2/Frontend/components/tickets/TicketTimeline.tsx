import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { formatDayGroup, formatFullDateTime, formatTime } from '../../features/support/format';
import { EVENT_ICONS, IMPORTANT_EVENTS } from '../../features/support/labels';
import { SUPPORT_MOTION, useSupportMotion } from '../../features/support/motion';
import { makeStyles, useTheme } from '../../theme';
import type { SupportTicketEvent } from '../../types/api';
import { AppButton } from '../ui/AppButton';
import { AppText } from '../ui/AppText';

import { Appear } from './Appear';

/** Quantos eventos aparecem antes de "Ver histórico completo". */
const COLLAPSED_COUNT = 6;

export interface TicketTimelineProps {
  events: SupportTicketEvent[];
  /** eventos que acabaram de chegar (realce temporário) */
  freshIds?: ReadonlySet<string>;
  now?: Date;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  group: { marginTop: theme.spacing.md },
  groupLabel: { marginBottom: theme.spacing.xs, paddingHorizontal: theme.spacing.lg },
  item: { flexDirection: 'row', gap: theme.spacing.md, paddingVertical: theme.spacing.sm + 2, paddingHorizontal: theme.spacing.lg, borderRadius: theme.radius.md },
  time: { width: 42, paddingTop: 1 },
  icon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface.muted },
  body: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.xs },
  details: { marginTop: theme.spacing.sm, gap: 6, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border.subtle },
  detailRow: { flexDirection: 'row', gap: theme.spacing.sm },
  more: { marginTop: theme.spacing.sm, alignSelf: 'flex-start', marginLeft: theme.spacing.sm },
}));

/** Agrupa (do mais recente para o mais antigo) por "Hoje", "Ontem", "06 out. 2026". */
export function groupEvents(events: SupportTicketEvent[], now: Date = new Date()): { label: string; items: SupportTicketEvent[] }[] {
  const groups: { label: string; items: SupportTicketEvent[] }[] = [];
  for (const event of [...events].reverse()) {
    const label = formatDayGroup(event.createdAt, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(event);
    else groups.push({ label, items: [event] });
  }
  return groups;
}

/**
 * Histórico (auditoria): nada é apagado, cada mudança é um novo evento. Itens entram com fade + slide curto em
 * sequência; os novos ganham realce que some sozinho; os importantes expandem para mostrar responsável e observação.
 */
export function TicketTimeline({ events, freshIds, now, testID = 'ticket-timeline' }: TicketTimelineProps) {
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? events : events.slice(-COLLAPSED_COUNT);
  const groups = groupEvents(visible, now);
  // Ordem de entrada (mais recente primeiro) para o stagger, calculada antes do render.
  const order = new Map([...visible].reverse().map((event, index) => [event.id, index]));
  return (
    <View testID={testID}>
      {groups.map((group) => (
        <View key={group.label} style={styles.group}>
          <AppText variant="label" tone="muted" style={styles.groupLabel} accessibilityRole="header">
            {group.label}
          </AppText>
          {group.items.map((event) => (
            <Appear key={event.id} index={order.get(event.id) ?? 0} offset={6}>
              <TimelineItem event={event} fresh={Boolean(freshIds?.has(event.id))} />
            </Appear>
          ))}
        </View>
      ))}
      {events.length > COLLAPSED_COUNT ? (
        <View style={styles.more}>
          <AppButton
            label={expanded ? 'Mostrar menos' : `Ver histórico completo (${events.length})`}
            variant="ghost"
            size="small"
            icon={expanded ? 'chevron-up' : 'chevron-down'}
            iconPosition="right"
            onPress={() => setExpanded((value) => !value)}
            testID={`${testID}-toggle`}
          />
        </View>
      ) : null}
    </View>
  );
}

function TimelineItem({ event, fresh }: { event: SupportTicketEvent; fresh: boolean }) {
  const theme = useTheme();
  const styles = useStyles();
  const motion = useSupportMotion();
  const [open, setOpen] = useState(false);
  const highlight = useSharedValue(fresh ? 1 : 0);
  const rotation = useSharedValue(0);
  const important = IMPORTANT_EVENTS.has(event.type);
  const expandable = event.details.length > 0 || Boolean(event.description && event.description.length > 90);
  const { colors } = theme;

  useEffect(() => {
    if (fresh) {
      highlight.set(1);
      highlight.set(withTiming(0, { duration: motion.reduce ? 0 : 2400 }));
    }
  }, [fresh, highlight, motion.reduce]);

  useEffect(() => {
    rotation.set(withTiming(open ? 1 : 0, motion.timing(SUPPORT_MOTION.duration.normal)));
  }, [motion, open, rotation]);

  const soft = colors.brand.primarySoft;
  const transparent = colors.surface.primary;
  const container = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(highlight.get(), [0, 1], [transparent, soft]) }));
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.get() * 180}deg` }] }));

  const content = (
    <>
      <AppText variant="caption" tone="muted" style={styles.time}>
        {formatTime(event.createdAt)}
      </AppText>
      <View style={[styles.icon, important ? { backgroundColor: colors.brand.primarySoft } : null]}>
        <Ionicons name={EVENT_ICONS[event.type]} size={15} color={important ? colors.brand.primaryStrong : colors.text.secondary} />
      </View>
      <View style={styles.body}>
        <View style={styles.header}>
          <AppText variant={important ? 'bodyStrong' : 'body'} style={{ flex: 1 }}>
            {event.title}
          </AppText>
          {expandable ? (
            <Animated.View style={chevron}>
              <Ionicons name="chevron-down" size={16} color={colors.text.muted} />
            </Animated.View>
          ) : null}
        </View>
        {event.actorName && event.actorType !== 'student' ? (
          <AppText variant="caption" tone="muted" style={{ marginTop: 1 }}>
            {event.actorName}
          </AppText>
        ) : null}
        {event.description ? (
          <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }} numberOfLines={open ? undefined : 2}>
            {event.description}
          </AppText>
        ) : null}
        {open ? (
          <Animated.View entering={FadeIn.duration(SUPPORT_MOTION.duration.normal).reduceMotion(motion.mode)} style={styles.details}>
            {event.details.map((detail) => (
              <View key={`${detail.label}-${detail.value}`} style={styles.detailRow}>
                <AppText variant="caption" tone="muted" style={{ width: 92 }}>
                  {detail.label}
                </AppText>
                <AppText variant="caption" style={{ flex: 1 }}>
                  {detail.value}
                </AppText>
              </View>
            ))}
            <View style={styles.detailRow}>
              <AppText variant="caption" tone="muted" style={{ width: 92 }}>
                Data
              </AppText>
              <AppText variant="caption" style={{ flex: 1 }}>
                {formatFullDateTime(event.createdAt)}
              </AppText>
            </View>
          </Animated.View>
        ) : null}
      </View>
    </>
  );

  return (
    <Animated.View layout={motion.layout} style={[{ borderRadius: theme.radius.md }, container]} testID={`timeline-event-${event.type}`}>
      {expandable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${formatTime(event.createdAt)}, ${event.title}${event.actorName && event.actorType !== 'student' ? `, ${event.actorName}` : ''}`}
          accessibilityHint={open ? 'Recolhe os detalhes' : 'Mostra responsável, data e observações'}
          onPress={() => setOpen((value) => !value)}
          style={styles.item}
        >
          {content}
        </Pressable>
      ) : (
        <View style={styles.item} accessible accessibilityLabel={`${formatTime(event.createdAt)}, ${event.title}${event.description ? `. ${event.description}` : ''}`}>
          {content}
        </View>
      )}
    </Animated.View>
  );
}
