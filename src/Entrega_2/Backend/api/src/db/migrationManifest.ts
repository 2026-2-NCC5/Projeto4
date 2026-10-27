/**
 * Migrations que esta versão do código espera encontrar aplicadas. A lista mora no código, e não só na pasta
 * database/migrations, porque a função serverless não leva a pasta: assim o painel de saúde aponta migration
 * pendente em qualquer ambiente. Um teste unitário garante que a lista é exatamente a da pasta.
 */
export const EXPECTED_MIGRATIONS: readonly string[] = [
  '001_init_schema.sql',
  '002_assistant_interactions.sql',
  '003_auth_recovery_biometrics.sql',
  '004_support_tickets.sql',
  '005_queue_tracking.sql',
  '006_platform_identity_audit.sql',
  '007_appointments.sql',
  '008_knowledge_base.sql',
  '009_sla_automations.sql',
  '010_appointment_reschedule_link.sql',
  '011_first_response_target.sql',
  '012_job_leases.sql',
];
