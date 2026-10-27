# 01 — Auditoria do backend e do ambiente Docker

Levantamento feito em 27/10/2026 sobre o branch `feat/fecap-hub-whatsapp` (mesmo commit da `main`, `4ebc55e`),
antes de qualquer alteração. Tudo o que está aqui foi lido no código ou executado. Nada foi presumido a partir
do escopo esperado do projeto.

## 1. Arquitetura encontrada

```text
src/Entrega_2/
├── Backend/
│   ├── api/              API principal (BFF) — Node.js + TypeScript + Express 5 + pg + zod + pino (~21 mil linhas)
│   ├── agent-service/    Agent Service — Python + FastAPI + Pydantic + PyYAML (motor de regras explicáveis)
│   ├── database/         migrations SQL 001–011 + seeds fictícios (runner próprio: tabela schema_migrations)
│   ├── contracts/        contrato Node ↔ Python (JSON Schema) e contrato dos clientes (TypeScript, 3 cópias)
│   ├── scripts/          e2e.sh, check-contracts-sync.sh
│   └── docker-compose.yml
├── Frontend/             app mobile — Expo SDK 57 / React Native 0.86 / TypeScript
└── Web/                  portal web — React 19 / Vite 8 / Tailwind 4 / React Router 7 / TanStack Query 5
src/Entrega_1/            protótipo anterior (Supabase direto do app) — histórico, fora do escopo
```

Não existe backend Python além do Agent Service, e não existe Prisma, Alembic, Redis, fila nem worker separado.
O banco é PostgreSQL. As migrations são SQL puro aplicadas pelo runner da API (`npm run db:migrate`).

`src/Entrega_2/Backend/fecap-collector/` tem só `__pycache__` e `.venv`. Os fontes não estão no repositório e a
pasta é ignorada pelo git. Ela foi tratada como resto local e ficou fora da migração.

## 2. Serviços do Docker Compose

| Serviço | Linguagem / imagem | Finalidade | Porta | Dependências | Volumes | Destino na migração | Estratégia |
|---|---|---|---|---|---|---|---|
| `db` | `postgres:16-alpine` | banco principal + banco de testes (`01-create-test-database.sql`) | 127.0.0.1:5432 | — | `asa-conecta-pgdata` (persistente), `database/docker` (init) | PostgreSQL gerenciado (Supabase, projeto "ASA Conecta", `sa-east-1`) | **Substituir** |
| `mailpit` | `axllent/mailpit` | caixa de e-mail falsa (recuperação de senha, convites) | 1025 / 8025 | — | — | SMTP real do provedor escolhido (ou `MAIL_TRANSPORT=disabled`) | **Substituir** (só desenvolvimento) |
| `agent-service` | Python 3.12 + uvicorn | Agente para o Estudante (`/internal/v1/student-agent/evaluate`) | 127.0.0.1:8000 | — | — | Vercel Service `agent` (FastAPI), privado | **Migrar** sem reescrever |
| `api` | Node 20 + Express | API única do app e do portal | 0.0.0.0:3000 | `db` (healthy), `agent-service`, `mailpit` | `./database` → `/srv/database` (somente leitura) | Vercel Service `api` (Express → Vercel Function) | **Migrar** com adaptações para serverless |
| `web` | nginx 1.29 + build do Vite | portal estático + proxy `/api` e `/health` para `api:3000` | 8080 | `api` | — | Vercel Service `web` (Vite estático no CDN) | **Migrar**: o proxy do nginx vira roteamento da Vercel |

### Comportamentos que dependiam do Compose

| Configuração | O que fazia | Como ficou |
|---|---|---|
| `command: migrate && seed && server` | aplicava migrations e seeds fictícios a cada subida do container | migrations rodam fora das requisições (`npm run db:migrate` no deploy, nunca na subida da função) |
| `depends_on: db: service_healthy` | a API só subia com o banco pronto | `GET /health` informa banco e agente; erros de banco viram 503 tratado |
| `volumes: ./database:/srv/database` | runner e painel de saúde liam a pasta de migrations | o painel usa a lista `EXPECTED_MIGRATIONS` no código (a função não leva a pasta) |
| hostnames `db`, `agent-service`, `mailpit`, `api` | rede interna do Compose | `DATABASE_URL` do banco gerenciado; `AGENT_SERVICE_URL` injetada pelo *binding* da Vercel; SMTP por variável |
| nginx `proxy_pass` + `proxy_buffering off` + `client_max_body_size 8m` | mesma origem para cookies, SSE sem buffer, upload de 8 MB | roteamento da Vercel (`vercel.json`) na mesma origem; SSE suportado; limite da plataforma é 4,5 MB (ver §5) |
| `healthcheck` / `restart` | reinício automático | Fluid compute da Vercel recria instâncias; o monitor da fila deixou de depender de processo vivo |

## 3. Referências a `localhost` e a hosts do Docker

| Onde | Valor | Classificação | Ação |
|---|---|---|---|
| `api/src/config/env.ts` | `AGENT_SERVICE_URL` padrão `http://localhost:8000` | padrão de desenvolvimento que, em produção, falharia **sem aviso** | produção (`NODE_ENV=production`) exige a variável; na Vercel ela vem do binding |
| `api/src/config/env.ts` | `WEB_ORIGINS` padrão `localhost:5173` | desenvolvimento | na Vercel as URLs do próprio deploy entram automaticamente; domínio próprio vai em `WEB_ORIGINS` |
| `api/src/db/pool.ts` | `LOCAL_HOSTS` inclui `db` | decide TLS (`DATABASE_SSL=auto`) | mantido; hosts remotos usam TLS |
| `Frontend/config/env.ts` | cai em `http://localhost:3000` sem `EXPO_PUBLIC_API_URL` | **bug em release**: o app tentaria o localhost do próprio celular | release sem a variável falha com erro explícito (`api_url_not_configured`) |
| `Web/vite.config.ts` | proxy para `localhost:3000` | só `vite dev`/`preview` | mantido; em produção o roteamento é da Vercel |
| `Backend/.env.example`, `api/.env.example` | `localhost`, `mailpit` | exemplos de desenvolvimento | mantidos, com as variáveis novas documentadas |
| `.github/workflows/ci.yml` | `localhost:5432` (service container do CI) | infraestrutura de CI | mantido |

## 4. Processos residentes e estado em memória

| Processo / estado | Onde | Comportamento no Docker | Problema em funções serverless |
|---|---|---|---|
| Monitor da fila presencial | `queue/monitor.ts` | laço a cada 10 s; líder eleito por **advisory lock de sessão** (conexão reservada) | não há laço entre requisições; advisory lock de sessão não funciona pelo pooler em modo transação e prende conexão |
| Varredura de prazos (automações) | `server.ts` (`setInterval`, 300 s) | timer no processo | timer não roda com a instância suspensa |
| Recibos de push (Expo) | `notifications/notificationService.ts` | `setTimeout` de 60 s após o envio | pode não rodar (melhor esforço; só desativa aparelhos inexistentes) |
| Tempo real da fila (SSE) | `queue/realtime.ts` | conexões de 5 min alimentadas pelo laço | a função tem limite de 300 s (Hobby) e não há laço que alimente a conexão |
| Barramento de eventos | `queue/eventBus.ts` | ouvintes assíncronos "dispara e esquece" | a instância pode ser suspensa antes de o push sair |
| Limitadores de taxa | `auth/rateLimiter.ts` | memória do processo | contam por instância (ver pendências) |

## 5. Outras incompatibilidades com a Vercel

- **Corpo de requisição e resposta limitado a 4,5 MB.** Anexos de até 5 MiB, enviados em base64 (~6,7 MB) e
  baixados inteiros, seriam recusados com `413 FUNCTION_PAYLOAD_TOO_LARGE`.
- **Detecção do Express.** A Vercel procura `src/app.ts` antes de `src/index.ts`. O `src/app.ts` era a fábrica
  (sem `export default`) e seria escolhido como entrada.
- **IP do cliente atrás do proxy.** Com `TRUST_PROXY=false`, todos os clientes compartilhariam o IP do proxy e o
  limite de login (20 por 10 min por IP) valeria para todos ao mesmo tempo.
- **Origem do portal em previews.** Cada preview tem uma URL nova, e o CSRF por origem recusaria o portal.
- **Pool de conexões.** `max: 10` fixo por processo. Em funções, cada instância tem o seu pool e isso esgota o
  pooler do Supabase.
- **Python.** O `pyproject.toml` não listava dependências. A Vercel usa esse arquivo antes do
  `requirements.txt` e o agente subiria sem FastAPI (confirmado no `vercel build`).
- **Node 20** já está fora de suporte (EOL em abril de 2026). Com `engines: ">=20"` a Vercel usa a 24.x e troca de
  major sozinha.

## 6. Inventário das APIs

**134 rotas HTTP** antes da migração (136 depois: entraram `GET` e `POST /api/internal/jobs/:job`). Todas foram
extraídas do código (`router.get/post/...`) e cruzadas com os consumidores do app e do portal. A lista completa,
com consumidor, handler, persistência e teste de cada rota, está em
[03-matriz-integracoes.md](03-matriz-integracoes.md).

| Grupo | Rotas | Consumidor |
|---|---:|---|
| `/api/support` (aluno + equipe) | 29 | app e portal |
| `/api/admin` | 20 | portal (`/admin`) |
| `/api/auth` | 18 | app (Bearer); portal usa `/api/web/auth` |
| `/api/asa` | 12 | portal (`/asa`) |
| `/api/knowledge-base` | 10 | portal e assistente |
| `/api/appointments` | 8 | app e portal |
| `/api/queue` | 8 | app |
| `/api/agent` | 6 | app e portal |
| `/api/notifications` | 6 | app e portal |
| `/api/student` | 6 | app e portal |
| `/api/web/auth` | 6 | portal |
| `/api/assistant`, `/api/audit`, `/api/platform` | 1 cada | app / portal |
| `/health`, `/health/queue` | 2 | monitoramento |

Clientes HTTP:

- **App** (`Frontend/services/apiClient.ts`): `fetch` com timeout, cancelamento, renovação única de sessão,
  detecção de offline, erros normalizados e refresh token no SecureStore. O token de acesso fica só em memória.
- **Portal** (`Web/src/services/api/client.ts`): `fetch` relativo (mesma origem), cookies HttpOnly, CSRF e
  renovação única compartilhada.
- **Tempo real**: SSE em `GET /api/queue/stream`, usado pelo app.

## 7. Inteligência artificial e voz (o que existe de fato)

| Componente | Implementação | Impacto da migração |
|---|---|---|
| Agente para o Estudante | Python puro (`agent-service/app/agent`): regras em YAML, recomendações com evidências, abstenção | sem dependência nativa nem modelo treinado; cabe numa função Python (o pacote tem ~855 arquivos, quase todos dependências) |
| Assistente ASA | intérprete de intenções por regras (TypeScript) + busca textual do PostgreSQL na base de conhecimento, com fontes | roda dentro da função da API |
| RAG / LLM | **não existe** no MVP (sem embeddings nem modelo de linguagem); JEV documentado e desligado | nada a migrar; não foi criado nada fictício |
| Voz e "Hey ASA" | reconhecimento e síntese **no aparelho** (`expo-speech-recognition`, `expo-speech`); o backend recebe texto | nenhum áudio passa pelo backend |

## 8. Linha de base dos testes (sem Docker, antes das mudanças)

PostgreSQL 17 instalado na máquina, sem Docker (cluster temporário na porta 55432).

| Suíte | Resultado |
|---|---|
| API — lint, typecheck | ok |
| API — unitários | 317 passaram |
| API — integração (PostgreSQL real) | 52 passaram |
| API — E2E (PostgreSQL + Agent Service real) | 16 passaram, 3 pulados (precisam do Mailpit) |
| Agent Service — pytest, ruff | 47 passaram |
| Portal — typecheck, lint, 262 testes, build | ok |
| App — lint (0 erros, 6 avisos), 565 testes | ok |
| App — **typecheck** | **falhava**: `App.tsx:217` usa `StyleSheet.absoluteFillObject`, que saiu dos tipos do RN 0.86 |

## 9. Riscos

| Risco | Probabilidade | Mitigação aplicada |
|---|---|---|
| Vercel Services e Daemons estão em beta | média | build validado localmente (`vercel build`); alternativa com três projetos documentada em 04 |
| Push da fila com o app fechado depende de leitura contínua da fonte | alta sem worker | worker residente (`npm run worker`) pronto para Vercel Daemon; sem ele, a fila atualiza sob demanda |
| Plano Hobby: Cron só uma vez por dia | certa no Hobby | varredura também por agendador externo ou Pro (a cada 5 min) |
| Estado do banco remoto desconhecido | — | o projeto Supabase "ASA Conecta" não está acessível nesta sessão; procedimento com backup em 07 |
| Limitadores em memória por instância | baixa (tráfego acadêmico) | registrado como pendência P2 |

## 10. Estratégia adotada

1. Manter os dois backends existentes. A API TypeScript tem 21 mil linhas e 385 testes, e o Agent Service já é
   Python. Ver [02-decisoes-arquiteturais.md](02-decisoes-arquiteturais.md).
2. Separar a composição (`runtime.ts`) das três formas de execução: servidor tradicional, função Vercel e worker
   residente.
3. Trocar o que só funciona com processo vivo: concessão no banco no lugar do advisory lock de sessão, leitura sob
   demanda, rotas de tarefas agendadas e `bus.idle()`.
4. Ajustar limites e padrões ao ambiente: anexos, IP real, origens do deploy, pool e Node 24.
5. Validar sem Docker: suítes completas, `vercel dev` (roteamento dos três serviços), `vercel build` (artefatos de
   produção), E2E do portal pela origem da Vercel e smoke test configurável por URL.
6. Manter o Docker como alternativa opcional de desenvolvimento.
