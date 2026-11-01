# Dados e proveniência

Local: inventário JSON por sessão em `.private/fecap-data`, atômico e permissão `0600`. Ele contém DOM textual potencialmente pessoal e não deve ser sincronizado a serviços não autorizados.

Servidor: `portal_connections` guarda somente hash SHA-256 do token; `portal_sync_sessions` registra resumo e erros; `portal_discovered_routes` guarda o inventário da sessão; `portal_audit_events` é append-only. Chaves estrangeiras vinculam cada conexão ao estudante resolvido da sessão ASA. O payload preserva rota, sessão, hash de conteúdo e horário de descoberta. Exclusão de conta remove a conexão conforme relação de dados do schema.

Retenção não está automatizada; aplicar política institucional antes de uso produtivo. O token é pessoal e rotacionado quando uma conexão nova é emitida.
