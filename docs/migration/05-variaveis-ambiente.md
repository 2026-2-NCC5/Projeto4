# 05 — Variáveis de ambiente

Nenhum valor real aparece aqui. Os segredos ficam no painel da Vercel (ou no `.env` local, ignorado pelo git).
Os modelos versionados são [`api/.env.example`](../../src/Entrega_2/Backend/api/.env.example),
[`agent-service/.env.example`](../../src/Entrega_2/Backend/agent-service/.env.example),
[`Backend/.env.example`](../../src/Entrega_2/Backend/.env.example) (Compose, opcional),
[`Web/.env.example`](../../src/Entrega_2/Web/.env.example) e
[`Frontend/.env.example`](../../src/Entrega_2/Frontend/.env.example).

A API valida tudo na inicialização (`src/config/env.ts`, zod). Configuração inválida derruba a subida com a lista
dos campos. Exemplos: `JWT_SECRET` curto, `CRON_SECRET` curto, `WEB_ORIGINS` malformada ou `NODE_ENV=production`
sem `AGENT_SERVICE_URL`.

## Como a Vercel entrega as variáveis

- São dois projetos. As variáveis abaixo pertencem ao **backend** (`asa-conecta-api`) e valem para os dois serviços
  dele (`api` e `agent`). O **frontend** (`asa-conecta`) não precisa de nenhuma. Cada variável é cadastrada por
  ambiente (*Development*, *Preview*, *Production*).
- `AGENT_SERVICE_URL` é **gerada** pelo binding `api → agent`. Não cadastre.
- Variáveis de sistema que a API usa sozinha: `VERCEL` (padrões da plataforma), `VERCEL_REGION` (logs), `VERCEL_URL`,
  `VERCEL_BRANCH_URL` e `VERCEL_PROJECT_PRODUCTION_URL` (origens aceitas no CSRF). Exigem a opção "Automatically
  expose System Environment Variables", ligada por padrão.
- A Vercel define `NODE_ENV=production` nas funções, inclusive em preview. Use `APP_ENV=staging` no preview para os
  clientes mostrarem o ambiente certo.

## Backend — projeto `asa-conecta-api`, serviço `api`

| Variável | Obrigatória | Segredo | Preview | Production | Observação |
|---|---|---|---|---|---|
| `DATABASE_URL` | sim | **sim** | banco de preview (outro projeto/branch do Supabase) | Supabase "ASA Conecta", papel `asa_api`, pooler | nunca compartilhe o banco de produção com previews |
| `DATABASE_SSL` | não | não | `auto` | `auto` | remoto → TLS |
| `DATABASE_POOL_MAX` | não | não | `3` | `3` | conexões por instância (padrão 10 é para processo único) |
| `JWT_SECRET` | sim (≥ 32) | **sim** | valor próprio | valor próprio | `openssl rand -hex 32`; trocar invalida as sessões |
| `CRON_SECRET` | para o Cron | **sim** | valor próprio | valor próprio | sem ela, `/api/internal/jobs/*` respondem 404 e o Cron falha |
| `AGENT_SERVICE_TOKEN` | recomendada | **sim** | igual à do agente | igual à do agente | a mesma variável vale para os dois serviços |
| `AGENT_SERVICE_URL` | em produção | não | — | — | **não cadastrar** (binding) |
| `APP_ENV` | não | não | `staging` | `production` (ou `demo`) | exibido no app e no portal |
| `DEMO_DATA_ENABLED` | não | não | `1` | `1` enquanto não houver integração acadêmica oficial; `0` com dados reais | dados fictícios sempre identificados como demonstração |
| `ACADEMIC_DATA_PROVIDER` | não | não | `demo` | `demo` | `institutional` responde 503 até existir integração autorizada |
| `WEB_ORIGINS` | **sim** | não | — | `https://<domínio-do-portal>` (ex.: `https://asa-conecta.vercel.app`) | o portal é outro projeto; as URLs automáticas da Vercel são as do backend |
| `CORS_ORIGIN` | recomendada | não | `https://<domínio-do-portal>` | `https://<domínio-do-portal>` | o portal chama pelo proxy (mesma origem); o app nativo não usa CORS; `*` gera aviso no log em produção |
| `TRUST_PROXY` | não | não | (vazio) | (vazio) | vazio = `true` na Vercel |
| `RATE_LIMIT_ENABLED` | não | não | `true` | `true` | — |
| `MAIL_TRANSPORT` | não | não | `disabled` ou `smtp` | `smtp` | sem SMTP, a recuperação de senha mostra indisponível |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER` | com `smtp` | não | — | do provedor | — |
| `SMTP_PASS` | com `smtp` | **sim** | — | do provedor | — |
| `MAIL_FROM` | não | não | — | remetente verificado no provedor | — |
| `PUSH_PROVIDER` | não | não | `log` | `expo` | — |
| `EXPO_ACCESS_TOKEN` | só com "Enhanced Security for Push" | **sim** | — | do projeto Expo | — |
| `ASA_QUEUE_PROVIDER` | não | não | (vazio) | (vazio) até haver autorização; depois `fecap` | vazio em produção = fila desligada (o simulador é recusado) |
| `ASA_QUEUE_SOURCE_AUTHORIZED` | não | não | `false` | `true` só com autorização registrada | — |
| `ASA_QUEUE_STREAM_MAX_SECONDS` | não | não | (vazio) | (vazio) | vazio = 240 s na Vercel |
| `SUPPORT_MAX_ATTACHMENT_BYTES` | não | não | (vazio) | (vazio) | vazio = 3 MiB na Vercel; acima de ~3,3 MiB a plataforma recusa |
| `LOG_LEVEL` | não | não | `info` | `info` | — |
| `SIGNUP_ALLOWED_EMAIL_DOMAINS` | não | não | padrão | `edu.fecap.br,fecap.br` (+ `demo.asa` só em demonstração) | — |
| `TERMS_URL`, `PRIVACY_URL` | não | não | — | URLs reais (ou vazio) | o app não mostra link falso |

Usadas **só na linha de comando** (migrations e seeds), nunca no painel: `DEMO_SEED_ENABLED`,
`DEMO_SEED_ALLOW_REMOTE`, `ALLOW_REMOTE_DB_RESET` e `TEST_DATABASE_URL`. Esta última nunca pode apontar para banco
remoto: os testes recriam o schema.

Usadas só pelo processo residente (`npm start`, `npm run worker`, Docker): `PORT`,
`AUTOMATION_SCAN_INTERVAL_SECONDS` e `ASA_QUEUE_POLL_INTERVAL_SECONDS`. A última também define o ritmo da leitura
sob demanda.

## Backend — serviço `agent`

| Variável | Obrigatória | Segredo | Observação |
|---|---|---|---|
| `AGENT_SERVICE_TOKEN` | recomendada (obrigatória se o agente for público) | **sim** | mesma da API; `/health` continua aberto |
| `AGENT_LOG_LEVEL` | não | não | `INFO` |
| `AGENT_CONFIG_DIR` | não | não | vazio = `app/config` (YAML já vai no pacote) |

## Frontend — projeto `asa-conecta` (portal)

Nenhuma variável em produção. O portal usa caminhos relativos e a mesma origem. `VITE_API_PROXY_TARGET` e
`WEB_PORT` servem só ao `vite dev`/`preview` local. Nunca coloque segredo em `VITE_*`: vai para o navegador.

## App mobile (Expo)

| Variável | Valor | Observação |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `https://<domínio-de-produção>` | **obrigatória em build de release**; é pública (vai no bundle), nunca um segredo |
| `EXPO_PUBLIC_*` restantes | ver `Frontend/.env.example` | timeouts, voz, "Hey Asa", mocks locais (`EXPO_PUBLIC_USE_MOCK_*` = `false` em produção) |

## Separação de ambientes

| | Development | Preview | Production |
|---|---|---|---|
| Banco | PostgreSQL local (sem Docker) ou banco de dev | banco próprio de preview | Supabase "ASA Conecta" |
| Segredos (`JWT_SECRET`, `CRON_SECRET`, `AGENT_SERVICE_TOKEN`) | do `.env` local | próprios | próprios |
| Dados | seeds fictícios | seeds fictícios | demonstração identificada (`DEMO_DATA_ENABLED=1`) até haver dados reais autorizados |
| E-mail | `disabled` ou Mailpit (Docker, opcional) | `disabled` | SMTP real |
| Push | `log` | `log` | `expo` |
