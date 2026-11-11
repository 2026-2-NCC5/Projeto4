# Entrega 2: Sistemas Operacionais e Computação em Nuvem

**Objetivo:** publicar a solução integrada e demonstrar observabilidade, segurança e desempenho.

**Relatório:** [`Entrega_2_Sistemas_Operacionais_e_Computacao_em_Nuvem.pdf`](Entrega_2_Sistemas_Operacionais_e_Computacao_em_Nuvem.pdf)
(20 páginas). O relatório é gerado por [`fonte/gerar_relatorio.py`](fonte/gerar_relatorio.py) a partir das
[`evidencias/`](evidencias/).

| Integrante | RA | GitHub |
|---|---|---|
| Vinícius Nishimura Reis | 24026962 | @Vinishireis |
| Breno Costa | 24026753 | @brenocosta19 |
| Bruno Souza Lima | 24026560 | @BrunoSouza06 |
| Felipe Toshio Yamaschita | 24026779 | @Yamaschita |

## Endereço de acesso controlado

| Componente | Endereço | Acesso |
|---|---|---|
| Portal web (aluno, equipe ASA, administração) | <https://asa-conecta.vercel.app> | login obrigatório; cookie HttpOnly + CSRF |
| API | <https://asa-conecta-api.vercel.app> | JWT (Bearer) e permissões por papel |
| Saúde da API (pública, sem dados pessoais) | <https://asa-conecta-api.vercel.app/health> | aberta |
| App Android / Expo Go | <https://asa-conecta.vercel.app/app> | mesmo login |
| Serviço do agente | sem endereço público | só a API chama, com token |

As credenciais de avaliação são enviadas aos professores de forma privada e não ficam no repositório.

## O que foi entregue

| Item do enunciado | Onde está |
|---|---|
| Deploy da API, banco, serviço do agente e componentes auxiliares em nuvem | Vercel `gru1` (portal, API e agente privado, Cron) + Supabase PostgreSQL `sa-east-1`. Verificado em 11/11/2026 (relatório, §2 e §3) |
| Docker / processo reproduzível, variáveis de ambiente, conexão com banco | Dockerfiles multi-stage, agora **sem root**: [`api/Dockerfile`](../../../src/Entrega_2/Backend/api/Dockerfile), [`agent-service/Dockerfile`](../../../src/Entrega_2/Backend/agent-service/Dockerfile). Também [`docker-compose.yml`](../../../src/Entrega_2/Backend/docker-compose.yml), [`vercel.json`](../../../src/Entrega_2/Backend/vercel.json) e `.env.example` (§4) |
| Logs estruturados, métricas de CPU/memória/latência/erros, painel | logs JSON (pino). Também `GET /metrics` em [`api/src/observability/metrics.ts`](../../../src/Entrega_2/Backend/api/src/observability/metrics.ts), Prometheus + Grafana + cAdvisor + postgres-exporter e 8 alertas em [`observability/`](../../../src/Entrega_2/Backend/observability/) (§5) |
| Teste de carga, gargalos e ajustes | scripts k6 em [`observability/k6/`](../../../src/Entrega_2/Backend/observability/k6/). Gargalo: CPU do PostgreSQL. O ajuste dobrou a vazão (§6) |
| Backup/restauração, segredos, controle de acesso, recuperação | [`observability/backup/`](../../../src/Entrega_2/Backend/observability/backup/) com backup, restore e ensaio. Também [`observability/seguranca/`](../../../src/Entrega_2/Backend/observability/seguranca/), inventário de segredos e RPO/RTO por cenário (§7 e §8) |

## Resultados principais

- **Produção:** 13 verificações de acesso e transporte, todas OK: TLS 1.3, HSTS, CSP, 401 sem token e agente sem rota
  pública. Carga leve: 1.980 requisições, 0 % de falhas, p95 de 225 ms. Cold start de cerca de 2,8 s na primeira
  chamada.
- **Rampa até 100 usuários simultâneos:** 22.116 requisições, 0 % de falhas, p95 de 19,5 ms.
- **Estresse até saturar:** o gargalo foi a CPU do PostgreSQL, preso em 1 vCPU, com até 560 requisições na fila do
  pool. Com 2 vCPU no banco, o pico foi de 183 para 373 req/s. A capacidade com p95 < 1 s foi de 160 para 367 req/s.
  Não houve erro nenhum: sob sobrecarga o sistema fica lento, mas não falha.
- **Recuperação:** backup cifrado (AES-256) restaurado num PostgreSQL descartável em 2,6 s. As 76 tabelas e as
  28.522 linhas foram conferidas, sem divergências.

## Pastas

- `evidencias/`:
  - resumos do k6 (`k6-*.json`) e séries do Prometheus (`series-*.json`);
  - `docker stats` (`docker-stats-*.csv`) e `pg_stat_statements`;
  - EXPLAIN da busca, alertas disparados e amostra de logs;
  - verificações de acesso, manifesto do backup e ensaio de restauração;
  - ambiente: SO, kernel, cgroups e usuários dos contêineres.
- `imagens/`: gráficos do relatório e captura do painel do Grafana.
- `fonte/`: gerador do relatório (`gerar_relatorio.py`, `graficos.py`) e o HTML usado para o PDF.

Como reproduzir: [`src/Entrega_2/Backend/observability/README.md`](../../../src/Entrega_2/Backend/observability/README.md).
