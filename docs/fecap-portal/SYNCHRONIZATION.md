# Sincronização

O padrão é local, sem rede ASA. Para sincronizar: autentique-se no app, crie o token pessoal, configure URL da API e token no `.env` local, defina `FECAP_SYNC_ENABLED=true` e execute `fecap-portal sync`. A execução é iniciada manualmente; sincronização agendada e comparação incremental ainda não são implementadas. Cada comando realiza nova varredura completa dentro dos limites configurados. MFA ou sessão expirada requer intervenção.

O endpoint aceita sessão repetida idempotentemente por `(connection_id, client_session_id)` e substitui as rotas dessa execução dentro da mesma transação. Erros externos são resumidos, sem imprimir corpo da resposta nem token. Revogue a conexão no app quando não quiser mais sincronizar.
