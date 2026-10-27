# Runbook de implantação e operação

> **Atualização (27/10/2026):** a implantação passou a ser na **Vercel**, em dois projetos: backend
> (`src/Entrega_2/Backend`: API + agente privado) e portal (`src/Entrega_2/Web`), com PostgreSQL gerenciado. Nada de produção depende de Docker, e o ambiente abaixo vale
> como alternativa local opcional. Procedimento atual, variáveis, banco, testes e reversão:
> [`docs/migration/`](../../../../docs/migration/04-deploy-vercel.md).

## 1. Desenvolvimento local

Pré-requisitos: Node.js 22.12+ (portal; o CI usa 24), Node 20+ (API), Python 3.12 (Agent Service), Docker com
`docker compose`.

```bash
cd "src/Entrega_2/Backend"
cp .env.example .env                       # opcional: valores de desenvolvimento já são o padrão
docker compose up -d db mailpit agent-service
cd api && cp .env.example .env && npm install && npm run db:migrate && npm run db:seed && npm run dev   # :3000
cd "../../Web" && npm install && npm run dev                                                           # :5173 (proxy /api → :3000)
cd "../Frontend" && npx expo start                                                                     # app (EXPO_PUBLIC_API_URL = IP da máquina:3000)
```

- Portal: http://localhost:5173. Mailpit (e-mails de recuperação e convites): http://localhost:8025.
- Contas fictícias: ver [DEMO_DATA_POLICY.md](DEMO_DATA_POLICY.md). A senha comum está no README da raiz do repositório.

### Pilha completa pelo Compose

```bash
cd "src/Entrega_2/Backend"
docker compose up -d --build        # db, mailpit, agent-service, api (migrate + seed + server) e web
```

- Portal: http://localhost:8080 (nginx serve o build e repassa `/api` para a API).
- API: http://localhost:3000, publicada na rede local para o app no celular.
- Banco, Mailpit e Agent Service ficam só em `127.0.0.1`.

## 2. Checklist de produção

| Item | Valor |
|---|---|
| `NODE_ENV` / `APP_ENV` | `production` / `production` |
| `JWT_SECRET` | Aleatório com 32+ caracteres, vindo do cofre de segredos. Trocar o segredo invalida os tokens de **acesso**; os clientes renovam pela sessão (o refresh é guardado como hash e não depende do segredo). Para encerrar **todas** as sessões (ex.: vazamento), veja §7. |
| `DEMO_DATA_ENABLED` / `DEMO_SEED_ENABLED` | `false` / `false`. Os seeds também são bloqueados em produção. |
| `ACADEMIC_DATA_PROVIDER` | `institutional`. Responde 503 com aviso até existir integração autorizada. |
| `WEB_ORIGINS` | URL pública do portal, por exemplo `https://asaconecta.fecap.br`, e nada mais |
| `WEB_COOKIE_SECURE` | `auto` (vira `Secure` com `NODE_ENV=production`). O portal **exige HTTPS**. |
| `TRUST_PROXY` | Número de proxies confiáveis (ex.: `1`) **somente** se a API não for acessível sem passar pelo proxy. Ver §3. |
| `RATE_LIMIT_ENABLED` | `true` |
| `CORS_ORIGIN` | Origem do portal. O app nativo não depende de CORS; `*` só em desenvolvimento. |
| `DATABASE_URL` / `DATABASE_SSL` | Banco gerenciado com `require` ou `verify-full` (+ `DATABASE_SSL_CA_FILE`) |
| `MAIL_TRANSPORT` e SMTP | `smtp` com credenciais do cofre. Sem e-mail, a recuperação de senha e os convites ficam indisponíveis e a API informa isso. |
| `PUSH_PROVIDER` | `expo` com build EAS (`projectId`); `EXPO_ACCESS_TOKEN` só com "Enhanced Security for Push" |
| `ASA_QUEUE_PROVIDER` | Explícito. Sem valor, a fila fica desligada em produção. `fecap` somente com autorização (`ASA_QUEUE_SOURCE_AUTHORIZED=true`). |
| `AI_PROVIDER` / `JEV_ENABLED` | `existing` / `false` (ver [JEV_INTEGRATION_ADR.md](../adr/JEV_INTEGRATION_ADR.md)) |
| `AUTOMATION_SCAN_INTERVAL_SECONDS` | `300` (as regras continuam desligadas até a administração ligar) |

Segredos nunca vão para `VITE_*` nem para `EXPO_PUBLIC_*`. Essas variáveis só levam URLs públicas.

## 3. Proxy reverso e cabeçalhos

- O portal **precisa** chegar à API pela mesma origem (`https://portal/api/...`). O `Web/Dockerfile` (nginx) já
  faz isso, com CSP restrita, `X-Frame-Options: DENY` e cache imutável para `/assets`.
- O SSE da fila presencial precisa de proxy sem buffer e com tempo de leitura longo; o `nginx.conf.template` já
  configura isso.
- **Limite por IP:**
  - com o app e o portal entrando pelo **mesmo** proxy, use `TRUST_PROXY=1` e não publique a porta da API;
  - se a API ficar exposta diretamente para o app, mantenha `TRUST_PROXY=false`. Assim o `X-Forwarded-For` não
    é confiável, mas os usuários do portal compartilham o IP do proxy no limite de login.
- TLS na borda, com HSTS.

## 4. Banco de dados

1. Backup ou ponto de restauração.
2. `node dist/db/migrate.js` (ou `npm run db:migrate`) a cada versão. As migrations são aditivas e
   transacionais (ver [DATABASE_MIGRATION_PLAN.md](DATABASE_MIGRATION_PLAN.md)).
3. **Nunca** rode `db:reset` nem seeds em produção. O código bloqueia; não force.
4. Depois da implantação, **Administração → Saúde** deve mostrar "migrations em dia", sem pendentes.

## 5. Várias instâncias da API

- **Fila presencial:** só a instância líder consulta a fonte (advisory lock). As outras leem o último estado do
  banco.
- **Automações:** cada instância varre os prazos. A restrição única `automation_runs (rule_id, ticket_id,
  trigger)` garante uma execução por regra, chamado e gatilho (teste com duas instâncias simultâneas).
- **Parâmetros e metas de SLA** ficam em cache de até 15 s por instância.
- **Limites de taxa ficam em memória, por processo.** Com N instâncias, o limite efetivo é N vezes o
  configurado. Para limite global, seria preciso um armazenamento compartilhado. Hoje isso **não** está
  implementado.

## 6. Saúde, logs e auditoria

| Verificação | Como |
|---|---|
| API no ar | `GET /health` (banco e Agent Service) |
| Fila presencial | `GET /health/queue` |
| Visão completa (administração) | `GET /api/admin/health`: migrations aplicadas e pendentes, latências, versões do agente, fila, e-mail, push, tempo no ar, memória |
| Integrações | `GET /api/admin/integrations`: estados honestos (operacional, demonstração, não configurado, planejado) |
| Logs | JSON (pino) com `request_id` e `correlation_id`. Procure pelo `requestId` mostrado nos erros do portal ou do app. |
| Auditoria | **Administração → Auditoria**: logins, negações, mudanças de papel, convites, parâmetros, SLA, automações, exportações, consultas ao contexto de aluno |

## 7. Reversão

- **Aplicação:** volte para a imagem anterior. As migrations são aditivas, então a versão anterior roda sobre o
  banco novo.
- **Banco:** corrija para frente, com uma migration nova. Os comandos manuais de reversão (só para ambientes de
  teste) estão no plano de migração.
- **Encerrar todas as sessões (incidente):** troque o `JWT_SECRET` e revogue as sessões no banco:
  `update refresh_sessions set revoked_at = now() where revoked_at is null;`. Toda requisição confere a sessão,
  então o efeito é imediato nos dois canais. Uma conta isolada é encerrada em **Administração → Usuários →
  Encerrar sessões**.
- **Recurso com problema:** desligue sem implantar em **Administração → Configurações → Recursos ativos**
  (agendamentos, base de conhecimento, respostas do assistente pela base, automações) ou pelas variáveis
  `FEATURE_*`.

## 8. Teste rápido pós-implantação

1. `GET /health` → 200; **Saúde** sem migrations pendentes.
2. Login de uma conta da equipe no portal. Abra a fila e um chamado. Confira se o cabeçalho
   `X-ASA-Data-Mode: institutional` está presente.
3. Login de um aluno no app. Abra um chamado de teste. A equipe deve vê-lo no portal com canal "App".
4. **Administração → Integrações:** confira os estados esperados (JEV "Planejado"; fila conforme a
   autorização).
5. Cancele ou encerre os registros de teste. A auditoria guarda o que foi feito.
