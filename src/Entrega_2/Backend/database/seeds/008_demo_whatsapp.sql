-- =========================================================================
-- ASA Conecta — Seed 008 — Canal WhatsApp de demonstração (dados 100% fictícios)
--
-- Só roda com a demonstração ligada (ver seedDecision). O canal usa o provedor
-- fake: nada sai para o WhatsApp e só números sintéticos (+999...) são aceitos.
-- Nasce DESCONECTADO: conectar é uma ação da administração, feita no portal.
-- Conversas de exemplo não ficam aqui porque o telefone é cifrado com uma chave
-- fora do repositório; use o simulador em Administração → Canal WhatsApp.
-- =========================================================================

insert into support_channels (id, name, provider, team, public_number, is_demo)
values ('c0000000-0000-4000-8000-000000000001', 'Canal de demonstração', 'fake', 'Atendimento ASA', '+99900000001', true)
on conflict (id) do nothing;

insert into support_provider_connections (channel_id)
values ('c0000000-0000-4000-8000-000000000001')
on conflict (channel_id) do nothing;

insert into support_saved_replies (id, title, body, approval_status)
values
  ('c1000000-0000-4000-8000-000000000001', 'Pedido recebido', 'Olá! Recebemos seu pedido e já estamos verificando. Avisaremos por aqui assim que houver novidade.', 'approved'),
  ('c1000000-0000-4000-8000-000000000002', 'Vincular o WhatsApp à conta', 'Para acompanhar pelo aplicativo, abra o ASA Conecta, entre em Perfil > WhatsApp do atendimento e siga os passos para vincular este número à sua conta.', 'approved')
on conflict (id) do nothing;
