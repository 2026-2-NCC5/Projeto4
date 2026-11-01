# Relatório de testes

Resultado verificado nesta revisão: `ruff check fecap_collector tests` passou; `python -m pytest -q` passou com 9 testes em fixtures e dados fictícios; healthcheck reportou Scrapling 0.4.15 e modo read-only. Chromium foi instalado e abriu uma página DOM local de smoke test. Logs de URL dos clientes externos foram desativados e há teste para essa proteção.

API: `npm run build`, `npm run typecheck` e `npm run lint` passaram; suíte unitária completa: 21 arquivos, 340 testes aprovados (execução autorizada fora do sandbox para o servidor HTTP efêmero). Frontend: `npm run typecheck` passou; Jest: 43 suítes, 567 testes aprovados. ESLint terminou sem erros e com 6 avisos preexistentes em `types/api.ts`.

Foram feitas tentativas de login com as credenciais autorizadas, mas a aplicação não confirmou a sessão; não houve varredura de dados acadêmicos. Não houve teste de conta DocuSign/TOTVS nem envio institucional. Testes de banco/API dependem de PostgreSQL de teste configurado. A migration e contratos ainda precisam ser validados em ambiente com banco antes de deployment.
