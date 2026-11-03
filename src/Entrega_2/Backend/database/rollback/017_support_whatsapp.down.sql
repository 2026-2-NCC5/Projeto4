-- Reversão manual da migration 017. NÃO roda sozinha; execute em uma transação, depois de um backup.
--
-- PERDA DE DADOS: apaga canais, conversas, vínculos, consentimentos, outbox e o log de eventos, e também
-- os chamados nascidos no WhatsApp sem estudante identificado (eles não existem no modelo anterior) e as
-- mensagens e anexos vindos do WhatsApp. Chamados do app e do portal permanecem.
--
-- Depois de executar, remova a linha da tabela de controle:
--   delete from schema_migrations where name = '017_support_whatsapp.sql';

drop trigger if exists trg_support_event_log_append_only on support_event_log;
drop function if exists support_event_log_append_only();
drop table if exists support_event_log;
drop table if exists support_event_log_state;
drop table if exists support_outbox;
drop table if exists support_inbox_dedup;
drop table if exists support_ticket_presence;
drop table if exists support_saved_replies;
drop table if exists support_ticket_tags;
drop table if exists support_tags;

-- dados que o modelo anterior não representa
delete from support_attachments where uploaded_by_type = 'contact' or origin = 'whatsapp';
delete from support_ticket_messages where transport = 'whatsapp' or sender_type = 'contact';
delete from support_tickets where student_id is null or channel = 'whatsapp';

alter table support_attachments drop constraint support_attachments_uploaded_by_type_check;
alter table support_attachments add constraint support_attachments_uploaded_by_type_check check (uploaded_by_type in ('student', 'agent'));
alter table support_attachments drop column review_status;
alter table support_attachments drop column student_visible;
alter table support_attachments drop column provider_media_ref;
alter table support_attachments drop column origin;

drop index if exists idx_support_messages_delivery;
drop index if exists uq_support_messages_external;
alter table support_ticket_messages drop column student_visible;
alter table support_ticket_messages drop column reply_to_external_id;
alter table support_ticket_messages drop column content_kind;
alter table support_ticket_messages drop column provider_timestamp;
alter table support_ticket_messages drop column delivery_updated_at;
alter table support_ticket_messages drop column delivery_error_code;
alter table support_ticket_messages drop column delivery_state;
alter table support_ticket_messages drop column external_message_id;
alter table support_ticket_messages drop column channel_id;
alter table support_ticket_messages drop column transport;
alter table support_ticket_messages drop constraint support_ticket_messages_content_check;
alter table support_ticket_messages add constraint support_ticket_messages_content_check check (char_length(content) <= 2000);
alter table support_ticket_messages drop constraint support_ticket_messages_sender_type_check;
alter table support_ticket_messages add constraint support_ticket_messages_sender_type_check check (sender_type in ('student', 'agent'));

drop index if exists idx_support_tickets_unidentified;
drop index if exists idx_support_tickets_channel_updated;
drop index if exists idx_support_tickets_team_status;
drop index if exists idx_support_tickets_assignee_status;
drop index if exists uq_support_tickets_open_conversation;
alter table support_tickets drop constraint support_tickets_owner_check;
alter table support_tickets drop column last_sequence;
alter table support_tickets drop column conversation_id;
alter table support_tickets drop constraint support_tickets_channel_check;
alter table support_tickets add constraint support_tickets_channel_check check (channel in ('app', 'web'));
alter table support_tickets alter column student_id set not null;

drop table if exists support_conversations;
drop table if exists support_contact_verifications;
drop table if exists support_contact_links;
drop table if exists support_consent_records;
drop table if exists support_provider_connections;
drop table if exists support_channels;
