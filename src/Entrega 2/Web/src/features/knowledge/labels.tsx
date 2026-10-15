import { Archive, CheckCircle2, FilePen, FlaskConical, GitCompareArrows, Users, Eye, type LucideIcon } from 'lucide-react';
import { Badge, type Tone } from '@/components/ui/Display';
import type { KnowledgeArticleStatus, KnowledgeAudience } from '@/types/api';

/** Situação editorial: sempre ícone + texto (nunca só cor). */
export const KB_STATUS_META: Record<KnowledgeArticleStatus, { label: string; tone: Tone; icon: LucideIcon; description: string }> = {
  draft: { label: 'Rascunho', tone: 'neutral', icon: FilePen, description: 'Ainda não visível para alunos nem para o assistente.' },
  in_review: { label: 'Em revisão', tone: 'info', icon: Eye, description: 'Aguardando revisão e publicação. Fora da Central de ajuda enquanto isso.' },
  published: { label: 'Publicado', tone: 'success', icon: CheckCircle2, description: 'Visível na Central de ajuda e usado pelo assistente (versão publicada).' },
  archived: { label: 'Arquivado', tone: 'neutral', icon: Archive, description: 'Fora da Central de ajuda e do assistente. Pode ser restaurado como rascunho.' },
};

export const AUDIENCE_LABELS: Record<KnowledgeAudience, string> = {
  student: 'Alunos',
  staff: 'Equipe ASA (interno)',
};

export function KnowledgeStatusBadge({ status }: { status: KnowledgeArticleStatus }) {
  const meta = KB_STATUS_META[status];
  return (
    <Badge tone={meta.tone} icon={meta.icon}>
      {meta.label}
    </Badge>
  );
}

/** Conteúdo de demonstração: precisa ser validado pelo ASA antes de valer como orientação oficial. */
export function DemoBadge() {
  return (
    <Badge tone="warning" icon={FlaskConical}>
      Demonstração
    </Badge>
  );
}

export function UnpublishedChangesBadge() {
  return (
    <Badge tone="warning" icon={GitCompareArrows}>
      Alterações não publicadas
    </Badge>
  );
}

export function AudienceBadge({ audience }: { audience: KnowledgeAudience }) {
  if (audience === 'student') return null;
  return (
    <Badge tone="neutral" icon={Users}>
      Só equipe
    </Badge>
  );
}
