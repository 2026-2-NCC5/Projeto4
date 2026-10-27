# 02 — Decisões arquiteturais

## D1. Linguagem do backend: manter TypeScript na API e Python no Agent Service (opção C, híbrida)

**Contexto.** A preferência inicial era consolidar o backend em Python/FastAPI. O código encontrado tem:

- API em TypeScript/Express com ~21 mil linhas, 19 módulos (autenticação, chamados, SLA, agendamentos, base de
  conhecimento, fila, push, administração, auditoria) e 385 testes (unitários, integração com PostgreSQL real,
  E2E com o Agent Service real);
- Agent Service já em Python/FastAPI, com o motor de regras explicáveis e 47 testes;
- contrato dos clientes em TypeScript, mantido em três cópias sincronizadas por script.

**Avaliação.**

| Critério | A — tudo em Python | B — tudo em TypeScript | C — manter cada um onde está |
|---|---|---|---|
| Código reaproveitado | reescrever 21 mil linhas e 385 testes | reescrever o motor do agente | 100% |
| Risco de regressão | alto (contratos, regras de SLA, permissões) | médio | baixo |
| Compatibilidade com a Vercel | FastAPI suportado | Express suportado | ambos suportados, no mesmo projeto backend (Services) |
| Prazo e custo | semanas | dias | horas |
| IA | Python já é o lugar do agente | perderia o ecossistema Python | Python continua disponível para evoluir o agente |

**Decisão.** Opção C. As regras do projeto proíbem reescrever um módulo funcional só por preferência de linguagem,
e a Vercel executa as duas linguagens sem perda. Nada foi reescrito: só foram adaptados os pontos que dependiam de
processo residente.

## D2. Plataforma: dois projetos Vercel — backend (Services api + agent) e frontend (portal)

Decisão do responsável: **o frontend (o sistema) e o backend em projetos separados**.

| Projeto | Pasta | Configuração | Rota pública |
|---|---|---|---|
| `asa-conecta-api` (backend) | `src/Entrega_2/Backend/` | `vercel.json` com Services: `api` (Express → Vercel Function, `src/index.ts`) e `agent` (FastAPI → função Python) | `/*` → `api`; o `agent` **não tem rota pública** (só a API o alcança, por binding) |
| `asa-conecta` (frontend) | `src/Entrega_2/Web/` | `vercel.json` do Vite: CDN, CSP, SPA e rewrite de `/api/*` e `/health*` para o backend | `/` (portal) |

Consequências:

- **Mesma origem para o portal.** O rewrite externo faz da Vercel um proxy reverso: o navegador fala só com o
  domínio do portal, e os cookies HttpOnly e o CSRF por origem funcionam como funcionavam com o nginx. A Vercel
  repassa o IP do visitante (`x-forwarded-for`/`x-real-ip`) e o `Set-Cookie`, e o cache de rewrite fica desligado
  para `/api` e `/health`.
- **O backend precisa conhecer a origem do portal.** `WEB_ORIGINS` e `CORS_ORIGIN` recebem o domínio do portal. As
  URLs automáticas da Vercel (`VERCEL_URL`…) passam a ser as do próprio backend.
- **Previews do portal** chamam o backend de produção (o destino do rewrite é fixo), e o CSRF recusa a origem do
  preview. Validar escrita pelo portal exige produção ou um backend de preview com `WEB_ORIGINS` próprio.
- **O app** chama o backend direto (`EXPO_PUBLIC_API_URL`), com Bearer e SSE.
- **O agente continua privado**, pelo binding dentro do projeto backend, com o segredo opcional
  `AGENT_SERVICE_TOKEN`.

O projeto único com três Services (a primeira versão desta migração) foi validado no `vercel dev` e no
`vercel build`, mas foi descartado por decisão do responsável.

## D3. Banco: PostgreSQL gerenciado do Supabase (projeto existente "ASA Conecta")

O time já tinha o projeto `lxfssnqxsxiywfndsfdn` em `sa-east-1`, e o schema é aplicado pelo runner da API.

- **Schema próprio `asa`.** O projeto tinha o schema da Entrega 1 em `public` (tabelas vazias de mesmo nome). Por
  decisão do responsável, a Entrega 2 vive em `asa`, com dois papéis: `asa_migrator` (dono; migrations) e `asa_api`
  (só leitura e escrita; usado pela API). O `search_path` é definido por papel. A Entrega 1 não é tocada, e as chaves
  públicas do Supabase não enxergam o schema (ver [07](07-migracao-banco.md)).
- **Região das funções:** `gru1` (São Paulo), a mesma do banco. Em `iad1`, o padrão, cada consulta cruzaria o
  continente.
- **Conexão:** pooler do Supabase. O modo sessão (5432) é o caminho já usado pelo time. Com a troca do advisory lock
  de sessão por concessões em tabela (D4), a API deixou de exigir sessão dedicada, e o modo transação (6543), mais
  adequado a funções, ficou viável. Ele ainda precisa ser validado num preview (ver 07).
- **Pool por instância:** `DATABASE_POOL_MAX` (recomendado 3 na Vercel) e `attachDatabasePool` (`@vercel/functions`),
  que fecha conexões ociosas antes de a instância ser suspensa.

## D4. Fila presencial sem processo residente

O monitor consultava a fonte num laço de 10 s, com líder eleito por advisory lock de sessão. Isso foi substituído
por:

1. **Concessão no banco (`job_leases`, migration 012).** É um `UPDATE` condicional atômico: não reserva conexão e
   funciona pelo pooler e entre instâncias.
2. **Modo sob demanda.** Cada leitura (rotas da fila, assistente, saúde) segue o estado gravado. Se o intervalo
   venceu, consulta a fonte, desde que obtenha a concessão. A concessão dura um intervalo e serve de limite global:
   no máximo uma consulta por intervalo em todo o sistema, respeitando o backoff de falhas de qualquer instância.
3. **`bus.idle()`.** A requisição só termina depois que acompanhamentos, alertas e push processaram a leitura.
4. **SSE com relógio próprio.** Enquanto houver conexões abertas numa instância, ela atualiza a fila no ritmo do
   intervalo. Cada conexão dura 240 s na Vercel (o limite da função é 300 s) e o app reconecta.
5. **Worker residente opcional** (`src/worker.ts`, `npm run worker`), pronto para Vercel Daemon (beta, só
   produção). Ele restaura o comportamento antigo: leitura contínua e push com o app fechado. Pode coexistir com a
   API serverless pela mesma concessão.

O laço do `server.ts` (Docker, `npm start`) continua igual, agora com a mesma concessão.

## D5. Tarefas periódicas por rota protegida

Os timers viraram `GET|POST /api/internal/jobs/:job` (`sla-scan`, `queue-refresh`), protegidas por
`Authorization: Bearer <CRON_SECRET>` com comparação em tempo constante. Sem `CRON_SECRET` as rotas nem existem
(404). O `vercel.json` do backend agenda `sla-scan` uma vez por dia (limite do Hobby). No Pro, ou com agendador externo, a
frequência original é de 5 min.

## D6. Limites da plataforma viram configuração, não código especial

| Item | Antes | Agora |
|---|---|---|
| Anexo de chamado | 5 MiB fixos | `SUPPORT_MAX_ATTACHMENT_BYTES`; padrão **3 MiB na Vercel** (base64 + JSON < 4,5 MB) e 5 MiB fora; app e portal leem o limite do catálogo da API |
| IP do cliente | `TRUST_PROXY=false` | padrão `true` na Vercel (o proxy dela sobrescreve `X-Forwarded-For`) |
| Origens do portal (CSRF) | só `WEB_ORIGINS` | na Vercel, mais as URLs do próprio deploy (`VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`) |
| Duração do SSE | 300 s | `ASA_QUEUE_STREAM_MAX_SECONDS`; padrão 240 s na Vercel |
| Pool | 10 fixo | `DATABASE_POOL_MAX` |

A detecção usa a variável de sistema `VERCEL=1`. Valores explícitos sempre vencem.

## D7. Migrations fora do ciclo das requisições

A função não leva a pasta `database/` nem aplica migrations ao subir. As migrations rodam em um passo explícito
(`npm run db:migrate` com a `DATABASE_URL` do ambiente), antes do deploy que precisa delas. Todas as migrations
existentes são aditivas, e a nova (012) só cria uma tabela. O painel de saúde compara o banco com a lista
`EXPECTED_MIGRATIONS` do código; um teste garante que ela é igual à pasta.

## D8. Runtimes fixados

- Node **24.x** na API (`engines`), no Dockerfile e no job da API no CI. O Node 20 já está fora de suporte.
- Python **3.12** no agente (`.python-version`, `requires-python`), com `uv.lock` fixando as versões instaladas pela
  Vercel. Docker e CI continuam usando `requirements.txt`, e um teste garante que as duas listas são iguais.

## D9. Docker continua opcional

`docker-compose.yml` e Dockerfiles permanecem e passam as variáveis novas adiante. Nada de produção depende deles.
O job de CI que compila as imagens foi mantido.

## O que **não** foi feito, de propósito

- Nenhum endpoint mudou de caminho. Não houve prefixo `/api/v1`: os 134 contratos e os três clientes continuam
  iguais, e a versão do contrato já é exposta em `GET /api/platform/info`.
- Nenhuma integração foi trocada por dado fictício. A fila em produção continua desligada até haver fonte autorizada
  (o simulador é recusado com `NODE_ENV=production`), e a fonte acadêmica continua `demo` identificada como
  demonstração.
- Nenhum LLM, RAG com embeddings ou fila externa foi introduzido sem necessidade real.
