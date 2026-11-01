# API ASA do conector

Rotas próprias do ASA, sem vínculo com endpoints oficiais TOTVS:

- `POST /api/v1/portal/connect` (sessão estudante): emite token de sincronização pessoal, exibido uma vez.
- `GET /api/v1/portal/status`, `GET /api/v1/portal/navigation`, `GET /api/v1/portal/sync-history` (sessão estudante): dados isolados pelo estudante da sessão; não aceita ID de estudante do cliente.
- `POST /api/v1/portal/sync` (Bearer token pessoal): recebe inventário validado, persiste em transação e deduplica sessões por conexão/ID.
- `DELETE /api/v1/portal/connection` (sessão estudante): revoga conexão sem apagar histórico.

Inventários têm limite de corpo de 2 MiB, 300 rotas, tabelas/linhas e campos limitados por Zod. Não registrar o header Bearer. A rota de sync usa o token como capability escopada a uma conexão, compara hash pelo lookup e recusa tokens revogados. Erros padronizados seguem o middleware Express existente.

A API limita cada conexão a cinco sincronizações por minuto com lock transacional PostgreSQL e resposta 429. O limite de inventário e a serialização do banco mantêm payloads e gravações sob controle.
