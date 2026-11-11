# Observabilidade, carga, backup e segurança

Infraestrutura executável da **Entrega 2 de Sistemas Operacionais e Computação em Nuvem**. O relatório com os resultados
está em
[`documentos/Entrega_2/Sistemas_Operacionais_e_Computacao_em_Nuvem/`](../../../../documentos/Entrega_2/Sistemas_Operacionais_e_Computacao_em_Nuvem/).

| Pasta / arquivo | O que faz |
|---|---|
| `docker-compose.observability.yml` | soma ao `docker-compose.yml` o Prometheus, o Grafana, o cAdvisor, o postgres-exporter e o k6. Também aplica limites de CPU e memória por contêiner (cgroups) |
| `prometheus/` | coleta a cada 5 s e define 8 regras de alerta: API fora, p95 > 1 s, 5xx > 2 %, event loop, pool do banco, memória, throttling, conexões |
| `grafana/` | fonte de dados e painel **ASA Conecta — Observabilidade** (26 painéis), provisionados como código. O JSON do painel é gerado por `grafana/gerador/gerar_painel.py` |
| `k6/jornada-aluno.js` | carga local: jornada do aluno na API (perfil, assistente, base de conhecimento, chamados) e chamadas diretas ao serviço do agente. Perfis: `fumaca`, `rampa` (até 100 usuários com tempo de leitura), `estresse` (5 → 100 jornadas/s sem pausa) e `constante` |
| `k6/producao-leve.js` | carga leve em produção, só com leituras públicas (até 10 req/s) |
| `backup/` | `backup.sh` (pg_dump + sha256 + AES-256 opcional + retenção), `restore.sh` (com travas para produção) e `drill.sh` (ensaio de restauração com conferência tabela a tabela) |
| `seguranca/verificar-acesso.sh` | verificações de 401/403/404, HTTPS, HSTS, CSP e TLS, em produção ou no ambiente local |
| `exportar-metricas.py` | exporta as séries do Prometheus de uma janela de teste para JSON |
| `resultados/` | saídas do k6 e do `docker stats` (o Git ignora o conteúdo; as evidências publicadas ficam em `documentos/`) |

A API publica `GET /metrics` no formato do Prometheus (código em `api/src/observability/metrics.ts`). A rota só existe
quando `METRICS_TOKEN` está definido e exige `Authorization: Bearer <token>`. Sem o token ela responde 404, como em
produção hoje.

## Subir o ambiente

Pré-requisitos: Docker Engine com Compose v2, em Linux, para o cAdvisor ler os cgroups.

```bash
cd src/Entrega_2/Backend
cp observability/.env.example observability/.env      # preencha: openssl rand -base64 36
chmod 600 observability/.env
alias dco='docker compose --env-file observability/.env -f docker-compose.yml -f observability/docker-compose.observability.yml'
dco up -d --build db mailpit agent-service api prometheus grafana cadvisor postgres-exporter
docker exec asa-conecta-api node dist/db/content.js    # conteúdo oficial da base de conhecimento (179 artigos)
docker exec asa-conecta-db psql -U asa -d asa_conecta -c 'create extension if not exists pg_stat_statements'
```

- Painel: <http://127.0.0.1:3300>, usuário `admin` e a senha `GRAFANA_ADMIN_PASSWORD`. Não há acesso anônimo.
- Prometheus: <http://127.0.0.1:9090> (alvos em `/targets`, alertas em `/alerts`).
- O ambiente usa o mesmo modo da produção: institucional, sem dados fictícios e com o limite de tentativas de login
  ligado.

## Teste de carga

```bash
dco --profile carga run --rm k6 run -o experimental-prometheus-rw -e PERFIL=fumaca /scripts/jornada-aluno.js
dco --profile carga run --rm k6 run -o experimental-prometheus-rw -e PERFIL=rampa -e RODADA=rampa /scripts/jornada-aluno.js
dco --profile carga run --rm k6 run -o experimental-prometheus-rw -e PERFIL=estresse -e RODADA=estresse /scripts/jornada-aluno.js
python3 observability/exportar-metricas.py --inicio <início UTC> --fim <fim UTC> --saida observability/resultados/series.json
```

Para repetir o ajuste do relatório, mude `DB_CPUS=2.0` no `observability/.env` e recrie o banco com
`dco up -d db`. Os dados ficam no volume.

O `setup` cria até 8 contas `carga.NN@edu.fecap.br` no banco local e faz um login por conta. O limite de 20 logins
por IP a cada 10 minutos vale também para o teste. Se o setup receber 429, aguarde a janela ou reinicie a API: o
contador fica em memória.

Produção (só leituras públicas):

```bash
docker run --rm -u "$(id -u):$(id -g)" -v "$PWD/observability/k6:/scripts:ro" \
  -v "$PWD/observability/resultados:/resultados" grafana/k6:1.3.0 run /scripts/producao-leve.js
```

## Backup e restauração

```bash
# banco local (inteiro)
DATABASE_URL='postgres://asa:<senha>@127.0.0.1:5432/asa_conecta' observability/backup/backup.sh --label local
# produção (Supabase, schema asa; a URL do papel asa_migrator fica fora do repositório)
DATABASE_URL="$ASA_MIGRATOR_URL" BACKUP_KEY_FILE=~/.config/asa-conecta/backup.key observability/backup/backup.sh --schema asa --label prod
# ensaio de recuperação num PostgreSQL descartável: confere a contagem de cada tabela
observability/backup/drill.sh ~/asa-conecta-backups/local-AAAAMMDD-HHMMSS.dump
```

`restore.sh` recusa destino remoto, a menos que `--confirm-remote <host>` repita o host. Ele confere o sha256 antes de
escrever e roda numa transação única.

## Verificações de acesso

```bash
observability/seguranca/verificar-acesso.sh producao
API_PORT=3000 AGENT_SERVICE_PORT=8000 observability/seguranca/verificar-acesso.sh local
```
