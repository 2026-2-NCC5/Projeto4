import {
  AlertCircle,
  ArrowRightCircle,
  Ban,
  BookOpen,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Flag,
  GitBranch,
  GraduationCap,
  Hand,
  Hourglass,
  KeyRound,
  Lock,
  MailOpen,
  MessageCircle,
  MessageSquare,
  Paperclip,
  PauseCircle,
  PenLine,
  RefreshCw,
  Search,
  Send,
  Star,
  StickyNote,
  Undo2,
  Users,
  Wrench,
  XCircle,
  ArrowLeftRight,
  Lightbulb,
  Award,
  CircleHelp,
  type LucideIcon,
} from 'lucide-react';
import { Badge, type Tone } from '@/components/ui/Display';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { SupportSlaStatus, SupportTicketEventType, SupportTicketPriority, SupportTicketSla, SupportTicketStatus } from '@/types/api';

/**
 * Textos e tons do Atendimento — os mesmos do app (Frontend/features/support/labels.ts) para que aluno
 * e equipe vejam a mesma situação com as mesmas palavras nos dois canais.
 */
export interface StatusMeta {
  label: string;
  short: string;
  description: string;
  tone: Tone;
  icon: LucideIcon;
}

export const STATUS_META: Record<SupportTicketStatus, StatusMeta> = {
  submitted: { label: 'Enviado', short: 'Enviado', description: 'Sua solicitação foi enviada e está chegando ao ASA.', tone: 'neutral', icon: Send },
  received: { label: 'Recebido pelo ASA', short: 'Recebido', description: 'O ASA recebeu sua solicitação e vai fazer a triagem.', tone: 'info', icon: MailOpen },
  triage: { label: 'Em triagem', short: 'Em triagem', description: 'O ASA está verificando qual equipe deve cuidar da sua solicitação.', tone: 'info', icon: GitBranch },
  assigned: { label: 'Encaminhado para a equipe responsável', short: 'Encaminhado', description: 'Sua solicitação já está com a equipe que vai cuidar dela.', tone: 'info', icon: Users },
  in_analysis: { label: 'Em análise', short: 'Em análise', description: 'Sua solicitação já foi recebida e está sendo verificada pela equipe responsável.', tone: 'info', icon: Search },
  in_progress: { label: 'Em atendimento', short: 'Em atendimento', description: 'A equipe já está trabalhando na solução.', tone: 'info', icon: Wrench },
  waiting_student: { label: 'Aguardando você', short: 'Aguardando aluno', description: 'O ASA precisa de uma informação sua para continuar.', tone: 'warning', icon: Hand },
  waiting_department: { label: 'Aguardando setor responsável', short: 'Aguardando setor', description: 'O ASA consultou outro setor e aguarda o retorno.', tone: 'neutral', icon: Hourglass },
  waiting_external: { label: 'Aguardando retorno externo', short: 'Aguardando retorno', description: 'A solicitação depende de um retorno de fora da instituição.', tone: 'neutral', icon: Hourglass },
  resolved: { label: 'Resolvido', short: 'Resolvido', description: 'Sua solicitação foi concluída.', tone: 'success', icon: CheckCircle2 },
  closed: { label: 'Encerrado', short: 'Encerrado', description: 'O atendimento foi finalizado. O histórico continua disponível.', tone: 'neutral', icon: Lock },
  cancelled: { label: 'Cancelado', short: 'Cancelado', description: 'Este chamado foi cancelado. O histórico continua disponível.', tone: 'neutral', icon: XCircle },
  reopened: { label: 'Reaberto', short: 'Reaberto', description: 'O chamado voltou para a equipe a partir do pedido do aluno.', tone: 'info', icon: RefreshCw },
};

export const FINISHED_STATUSES: readonly SupportTicketStatus[] = ['resolved', 'closed', 'cancelled'];
export const ACTIVE_STATUSES: readonly SupportTicketStatus[] = ['submitted', 'received', 'triage', 'assigned', 'in_analysis', 'in_progress', 'waiting_student', 'waiting_department', 'waiting_external', 'reopened'];
export const isFinished = (status: SupportTicketStatus): boolean => FINISHED_STATUSES.includes(status);

export const PRIORITY_META: Record<SupportTicketPriority, { label: string; tone: Tone }> = {
  normal: { label: 'Normal', tone: 'neutral' },
  high: { label: 'Alta', tone: 'warning' },
  urgent: { label: 'Urgente', tone: 'danger' },
};

/** Prazo com transparência, sem alarmismo: só "excedido" usa o tom de erro. */
export const SLA_META: Record<SupportSlaStatus, { label: string; staffLabel: string; tone: Tone; icon: LucideIcon }> = {
  on_track: { label: 'Dentro do prazo', staffLabel: 'No prazo', tone: 'neutral', icon: Clock },
  attention: { label: 'Dentro do prazo', staffLabel: 'Atenção', tone: 'neutral', icon: Clock },
  near_deadline: { label: 'Prazo próximo', staffLabel: 'Prazo próximo', tone: 'warning', icon: Clock },
  overdue: { label: 'Prazo excedido', staffLabel: 'Prazo excedido', tone: 'danger', icon: AlertCircle },
  paused: { label: 'Prazo pausado enquanto aguardamos você', staffLabel: 'Pausado (aguardando aluno)', tone: 'neutral', icon: PauseCircle },
  completed: { label: 'Atendimento concluído', staffLabel: 'Concluído', tone: 'success', icon: CheckCircle2 },
};

export const EVENT_ICONS: Record<SupportTicketEventType, LucideIcon> = {
  ticket_created: PenLine,
  ticket_received: MailOpen,
  ticket_triaged: GitBranch,
  ticket_assigned: Users,
  status_changed: ArrowLeftRight,
  message_received: MessageCircle,
  message_sent: MessageSquare,
  file_uploaded: Paperclip,
  student_action_required: Hand,
  student_response_received: Undo2,
  department_forwarded: ArrowRightCircle,
  resolution_proposed: Lightbulb,
  ticket_resolved: CheckCircle2,
  ticket_closed: Lock,
  ticket_reopened: RefreshCw,
  ticket_cancelled: Ban,
  rating_submitted: Star,
  priority_changed: Flag,
  internal_note: StickyNote,
};

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  academic: GraduationCap,
  enrollment: FileText,
  financial: CreditCard,
  documents: FileText,
  scholarships: Award,
  internship: Briefcase,
  infrastructure: Building2,
  systems_access: KeyRound,
  asa_service: MessageSquare,
  other: CircleHelp,
};

export const categoryIcon = (categoryId: string): LucideIcon => CATEGORY_ICONS[categoryId] ?? BookOpen;

/** Ícone da categoria como componente estável (evita criar componente durante a renderização). */
export function CategoryIcon({ categoryId, size = 20, className }: { categoryId: string; size?: number; className?: string }) {
  const IconGlyph = CATEGORY_ICONS[categoryId] ?? BookOpen;
  return <IconGlyph size={size} className={className} aria-hidden />;
}

export function StatusBadge({ status, audience = 'student' }: { status: SupportTicketStatus; audience?: 'student' | 'staff' }) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone} icon={meta.icon}>
      {audience === 'staff' ? meta.short : status === 'assigned' ? 'Encaminhado' : meta.short === 'Aguardando aluno' ? 'Aguardando você' : meta.short}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: SupportTicketPriority }) {
  const meta = PRIORITY_META[priority];
  return (
    <Badge tone={meta.tone} icon={Flag}>
      Prioridade {meta.label.toLowerCase()}
    </Badge>
  );
}

/**
 * Situação do prazo calculada no servidor (sla.status). Mostra o prazo absoluto no fuso da instituição
 * e quanto falta — o tempo relativo é só informativo.
 */
export function SlaIndicator({ sla, audience = 'student', showDue = true, ticketStatus }: { sla: SupportTicketSla; audience?: 'student' | 'staff'; showDue?: boolean; ticketStatus?: SupportTicketStatus }) {
  // chamado cancelado também "conclui" o prazo no servidor; aqui não faz sentido dizer "atendimento concluído"
  if (ticketStatus === 'cancelled') {
    return (
      <Badge tone="neutral" icon={XCircle}>
        {audience === 'staff' ? 'Prazo encerrado (cancelado)' : 'Prazo não se aplica'}
      </Badge>
    );
  }
  const meta = SLA_META[sla.status];
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge tone={meta.tone} icon={meta.icon}>
        {audience === 'staff' ? meta.staffLabel : meta.label}
      </Badge>
      {showDue && sla.status !== 'completed' && sla.status !== 'paused' ? (
        <span className="text-caption text-mist" title={formatDateTime(sla.dueAt)}>
          prazo {formatRelative(sla.dueAt)} · {formatDateTime(sla.dueAt)}
        </span>
      ) : null}
    </span>
  );
}
