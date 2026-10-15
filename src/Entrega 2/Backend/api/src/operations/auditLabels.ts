/** Descrição legível das ações da trilha de auditoria (portal da equipe e da administração). */
const LABELS: Record<string, string> = {
  'auth.login': 'Entrou na plataforma',
  'auth.login_failed': 'Tentativa de entrada recusada',
  'auth.logout': 'Saiu da plataforma',
  'auth.logout_all': 'Encerrou todas as sessões',
  'auth.session_revoked': 'Encerrou uma sessão',
  'auth.sessions_revoked': 'Encerrou as outras sessões',
  'auth.account_created': 'Criou conta de aluno',
  'auth.password_reset': 'Redefiniu a senha',
  'authz.denied': 'Acesso negado por permissão',
  'ticket.status_changed': 'Mudou a situação de um chamado',
  'ticket.assigned': 'Atribuiu/encaminhou um chamado',
  'ticket.message_sent': 'Respondeu um chamado',
  'ticket.internal_note': 'Registrou nota interna',
  'ticket.priority_changed': 'Mudou a prioridade de um chamado',
  'ticket.resolved': 'Resolveu um chamado',
  'student_context.viewed': 'Consultou o contexto de atendimento de um aluno',
  'report.exported': 'Exportou relatório',
  'user.invited': 'Convidou uma conta',
  'user.role_changed': 'Mudou o papel de uma conta',
  'user.deactivated': 'Desativou uma conta',
  'user.activated': 'Reativou uma conta',
  'user.sessions_revoked': 'Encerrou as sessões de uma conta',
  'settings.updated': 'Alterou parâmetro institucional',
  'sla.updated': 'Alterou meta de SLA',
  'automation.created': 'Criou automação',
  'automation.updated': 'Alterou automação',
  'automation.executed': 'Automação executada',
  'appointment.booked': 'Agendou atendimento',
  'appointment.rescheduled': 'Remarcou atendimento',
  'appointment.cancelled': 'Cancelou atendimento',
  'appointment.status_changed': 'Atualizou um agendamento',
  'availability.created': 'Criou disponibilidade',
  'availability.updated': 'Alterou disponibilidade',
  'kb.article_created': 'Criou artigo',
  'kb.article_updated': 'Editou artigo',
  'kb.article_submitted': 'Enviou artigo para revisão',
  'kb.article_published': 'Publicou artigo',
  'kb.article_archived': 'Arquivou artigo',
  'agent.feedback': 'Avaliou uma recomendação do agente',
};

export function auditLabel(action: string): string {
  return LABELS[action] ?? action;
}

export const AUDIT_ACTIONS = Object.keys(LABELS);
