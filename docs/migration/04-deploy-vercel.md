# 04 — Implantação na Vercel (e execução sem Docker)

**Estado em 27/10/2026: em produção.**

| Projeto (time `ux-brasils-projects`, Hobby) | URL de produção | Validação |
|---|---|---|
| `asa-conecta` (portal) | **https://asa-conecta.vercel.app** | smoke 22/22 pela URL do portal; login por cookie com CSRF pelo proxy |
| `asa-conecta-api` (backend) | **https://asa-conecta-api.vercel.app** | smoke 19/19; análise da IA 201; agente sem rota pública; Cron registrado |

Banco: schema `asa` no Supabase "ASA Conecta", migrations 001–012 e dados de demonstração (ver
[07](07-migracao-banco.md)). Os resultados detalhados estão em [06](06-testes-validacao.md#5-produção-27102026).

Comandos a partir da raiz do repositório (`Projeto4/`), salvo indicação.

## 1. Dois projetos

| Projeto Vercel | Pasta (Root Directory) | Conteúdo | Endereço esperado |
|---|---|---|---|
| **`asa-conecta-api`** (backend) | `src/Entrega_2/Backend` | [`vercel.json`](../../src/Entrega_2/Backend/vercel.json) com Services: `api` (Express, `src/index.ts`, Node 24, 300 s) e `agent` (FastAPI, Python 3.12, **sem rota pública**, alcançado pela API por binding). Região `gru1`. Cron diário | `https://asa-conecta-api.vercel.app` |
| **`asa-conecta`** (frontend, o portal) | `src/Entrega_2/Web` | [`vercel.json`](../../src/Entrega_2/Web/vercel.json): build do Vite no CDN, CSP e cabeçalhos, rotas do SPA, e **`/api/*` e `/health*` encaminhados ao backend** (proxy na mesma origem) | `https://asa-conecta.vercel.app` |

```text
Navegador ──https──▶ asa-conecta (portal)  ──rewrite /api, /health──▶ asa-conecta-api ──binding──▶ agent (privado)
App Expo  ──https──────────────────────────────────────────────────▶ asa-conecta-api ──▶ PostgreSQL (Supabase, schema asa)
```

Por que o portal encaminha `/api` em vez de chamar o backend direto: a sessão do portal é por cookie HttpOnly com
CSRF por origem. Na mesma origem não há CORS aberto nem cookie de terceiros, que os navegadores bloqueiam. O rewrite
externo da Vercel repassa o IP do visitante (`x-forwarded-for`/`x-real-ip`) e os cabeçalhos `Set-Cookie`, e o cache
de rewrite está desligado para `/api` e `/health`.

O app mobile chama o backend direto (`EXPO_PUBLIC_API_URL`), porque usa token Bearer e precisa do SSE da fila.

Cada pasta tem o seu `.vercelignore`. Os `.env` locais nunca sobem: o `.env` da API apontaria para o banco e o SMTP
de desenvolvimento.

## 2. Pré-requisitos

| Item | Situação |
|---|---|
| Vercel CLI ≥ 65 logada no time do grupo | `vercel whoami` → `ux-brasil` / time `ux-brasils-projects` |
| Supabase CLI logada (`npx supabase`) com o projeto "ASA Conecta" vinculado | ok (`supabase/.temp/project-ref`) |
| Credenciais do banco | `~/.config/asa-conecta/production.env` (fora do repositório, `chmod 600`) |
| Senhas das contas de equipe e admin de produção | `~/.config/asa-conecta/contas-equipe-admin.txt` (`chmod 600`; **não** usar `source`) |

## 3. Backend — `asa-conecta-api`

Já feito:

```bash
cd src/Entrega_2/Backend
vercel project create asa-conecta-api
vercel link --yes --project asa-conecta-api        # cria .vercel/ e .env.local (ignorados pelo git)
```

Variáveis de **produção** já cadastradas. Os segredos foram gerados com `openssl rand -hex 32` e enviados pela
entrada padrão, sem aparecer em tela nem em histórico:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | papel `asa_api` no pooler do Supabase (sensível) |
| `JWT_SECRET`, `CRON_SECRET`, `AGENT_SERVICE_TOKEN` | gerados (sensíveis) |
| `DATABASE_SSL` / `DATABASE_POOL_MAX` | `auto` / `3` |
| `APP_ENV` / `DEMO_DATA_ENABLED` / `ACADEMIC_DATA_PROVIDER` | `production` / `1` / `demo` |
| `MAIL_TRANSPORT` / `PUSH_PROVIDER` / `LOG_LEVEL` / `RATE_LIMIT_ENABLED` | `disabled` / `expo` / `info` / `true` |

Cadastradas depois que o portal ganhou endereço (feito):

```bash
printf 'https://asa-conecta.vercel.app' | vercel env add WEB_ORIGINS production   # origem do portal (CSRF)
printf 'https://asa-conecta.vercel.app' | vercel env add CORS_ORIGIN production
```

Deploy (cada mudança de variável exige um deploy novo):

```bash
cd src/Entrega_2/Backend
vercel deploy --prod
SMOKE_EMAIL=estudante.exemplo@demo.asa SMOKE_PASSWORD='Demo@2026' \
  node scripts/smoke.mjs https://asa-conecta-api.vercel.app
```

## 4. Frontend — `asa-conecta`

1. O endereço de produção do backend (`asa-conecta-api.vercel.app`) é o que está nas três URLs de
   `src/Entrega_2/Web/vercel.json`. Se o backend mudar de domínio, troque-as.
2. Crie, vincule e implante (feito em 27/10/2026):

   ```bash
   cd src/Entrega_2/Web
   vercel project create asa-conecta
   vercel link --yes --project asa-conecta
   vercel deploy --prod                      # nenhuma variável de ambiente é necessária
   ```

3. Cadastre `WEB_ORIGINS` e `CORS_ORIGIN` no backend (§3) com o endereço real do portal e implante o backend de
   novo (`vercel deploy --prod` na pasta do backend). Variáveis só valem depois de um novo deploy.
4. Valide pela origem do portal:

   ```bash
   SMOKE_WEB=1 SMOKE_EMAIL=estudante.exemplo@demo.asa SMOKE_PASSWORD='Demo@2026' \
     node src/Entrega_2/Backend/scripts/smoke.mjs https://asa-conecta.vercel.app
   ```

5. Confira o IP repassado pelo proxy, porque o limite de login é por IP:

   ```bash
   # 21 tentativas com e-mail inexistente pelo portal → a 21ª deve dar 429
   for i in $(seq 1 21); do curl -s -o /dev/null -w "%{http_code} " -X POST https://asa-conecta.vercel.app/api/auth/login \
     -H 'content-type: application/json' -d '{"email":"teste-ip@demo.asa","password":"x"}'; done; echo
   # Em seguida, direto no backend: 429 também = o backend viu o SEU IP nos dois caminhos (correto).
   # 401 aqui = o proxy chegou com outro IP. Nesse caso, todos os usuários do portal dividiriam o limite: avise.
   curl -s -o /dev/null -w "%{http_code}\n" -X POST https://asa-conecta-api.vercel.app/api/auth/login \
     -H 'content-type: application/json' -d '{"email":"teste-ip@demo.asa","password":"x"}'
   ```

## 5. Banco: migrations futuras

O schema `asa` pertence ao papel `asa_migrator`, e a API usa `asa_api`, que só lê e escreve. Migrations novas (013+)
rodam com o migrador, antes do deploy que as usa, com backup antes (ver [07](07-migracao-banco.md)):

```bash
cd src/Entrega_2/Backend/api
DATABASE_URL="$(grep '^ASA_MIGRATOR_DATABASE_URL=' ~/.config/asa-conecta/production.env | cut -d= -f2-)" npm run db:migrate
```

## 6. Tarefas agendadas

- O `vercel.json` do backend agenda `0 9 * * *` (06h de Brasília) para `/api/internal/jobs/sla-scan`. O Hobby só
  aceita uma execução por dia, e expressões mais frequentes **falham no deploy**.
- No Pro, use `*/5 * * * *`. Sem Pro, um agendador externo pode chamar
  `curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://asa-conecta-api.vercel.app/api/internal/jobs/sla-scan`
  (o segredo está no painel: `vercel env pull` na pasta do backend).

## 7. Worker residente (opcional)

Para o push da fila com o app fechado (só relevante com a fila ativa, que exige autorização da FECAP), acrescente ao
`vercel.json` do **backend** um Daemon (beta, só produção):

```json
"daemons": {
  "queue-worker": { "root": "api/", "entrypoint": "Dockerfile", "command": ["node", "dist/worker.js"], "instances": { "gru1": 1 } }
}
```

## 8. App mobile

```bash
cd src/Entrega_2/Frontend
echo 'EXPO_PUBLIC_API_URL=https://asa-conecta-api.vercel.app' > .env    # URL pública do BACKEND; nunca um segredo
npx expo start                                                         # ou: eas build (cadastre a variável no projeto Expo)
```

## 9. Reversão

- `vercel rollback` em cada projeto volta o código na hora.
- O banco só recebeu adições, então o código anterior continua compatível.
- Remover tudo do banco: `drop schema asa cascade; drop role asa_api; drop role asa_migrator;`, executado como
  `postgres`. A Entrega 1 em `public` não é afetada. Backup em `~/asa-conecta-backups/20261027-100231/`.

## 10. Sem Docker: desenvolvimento local

```bash
# PostgreSQL 16+ seu (instalado, cluster próprio ou gerenciado de desenvolvimento), ex. porta 55432
initdb -D ~/asa-pg -U asa --auth=trust && pg_ctl -D ~/asa-pg -o "-p 55432" -l ~/asa-pg.log start
createdb -h 127.0.0.1 -p 55432 -U asa asa_conecta && createdb -h 127.0.0.1 -p 55432 -U asa asa_conecta_test

# Agent Service (Python 3.12)
cd src/Entrega_2/Backend/agent-service && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --reload --port 8000

# API (Node 24) — outro terminal
cd src/Entrega_2/Backend/api && npm ci && cp .env.example .env
export DATABASE_URL=postgres://asa@127.0.0.1:55432/asa_conecta TEST_DATABASE_URL=postgres://asa@127.0.0.1:55432/asa_conecta_test MAIL_TRANSPORT=disabled
npm run db:migrate && npm run db:seed
npm run dev                      # tradicional (laço da fila e timers), :3000
# ou: npm run start:vercel-entry # a MESMA entrada da Vercel (src/index.ts), sem laços

# Portal — outro terminal (o Vite repassa /api para :3000)
cd src/Entrega_2/Web && npm ci && npm run dev
```

**Backend como na Vercel** (api + agent com binding e segredo):
`cd src/Entrega_2/Backend && DATABASE_URL=… JWT_SECRET=… MAIL_TRANSPORT=disabled npx vercel@65.4.0 dev --local --listen 3000`.

**Conferir o build de produção sem implantar.** É o mesmo processo do job `vercel-build` do CI. Use uma cópia
limpa, porque arquivos locais como `dist/` mascaram erros:

```bash
rsync -a --exclude node_modules --exclude .venv --exclude dist --exclude .vercel --exclude '.env*' src/Entrega_2/Backend/ /tmp/asa-backend/
mkdir -p /tmp/asa-backend/.vercel && echo '{"projectId":"prj_local","orgId":"team_local","settings":{}}' > /tmp/asa-backend/.vercel/project.json
( cd /tmp/asa-backend && npx vercel@65.4.0 build --yes -Q /tmp/vercel-cli-isolado )   # exige o uv no PATH
```

O Docker continua disponível (`src/Entrega_2/Backend/docker-compose.yml`), mas é opcional.
