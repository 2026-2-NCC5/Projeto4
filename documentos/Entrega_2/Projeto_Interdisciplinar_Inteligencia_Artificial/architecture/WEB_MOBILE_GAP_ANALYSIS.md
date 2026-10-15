# ASA Conecta — Análise de lacunas Web ↔ Mobile (Fase 0)

> Auditoria feita em 14/10/2026 sobre o código **real** do Projeto 4 (branch `feature/plataforma-web-integrada`,
> criada a partir de `main` em `6610caa`) e do Projeto 5 (`~/Downloads/Projeto5-main`, usado só como referência).
> Este documento registra o estado inicial, as decisões de arquitetura e o plano incremental. As mudanças
> feitas depois desta auditoria estão em [`../plataforma/`](../plataforma/) e no `TEST_REPORT.md`.

## 1. Estado do repositório no início

- O working tree tinha **177 arquivos alterados ou novos e não commitados**, vindos de sessões anteriores:
  atendimento (chamados), fila presencial, redesign do app e seeds. Eles fazem parte do estado auditado e
  foram preservados. Nenhum arquivo foi revertido ou apagado.
- O banco local (`asa-conecta-db`, volume `projeto4_asa-conecta-pgdata`) tinha as migrations
  `001`–`005` aplicadas. A próxima numeração livre é **006**.
- Nenhuma outra sessão estava editando o Projeto 4 (verificado com `ListAgents`).

### 1.1 Baseline executado antes de qualquer alteração

| Componente | Comando (na pasta do componente) | Resultado |
|---|---|---|
| API Node.js | `npm run typecheck` | ✅ sem erros |
| API Node.js | `npm run lint` | ✅ sem erros |
| API Node.js | `npx vitest run --dir test/unit` | ✅ 13 arquivos, **250 testes** |
| API Node.js | `npx vitest run --dir test/integration` (PostgreSQL 16 local, `asa_conecta_test`) | ✅ 4 arquivos, **17 testes** |
| API Node.js | `npx vitest run --dir test/e2e` (sobe o Agent Service real) | ✅ **16 testes**; 3 ignorados (E2E de autenticação exige o Mailpit no ar). A 1ª execução falhou porque a porta fixa `8765` estava ocupada por outro programa local. O harness passou a escolher uma porta livre (`test/support/agentServiceProcess.ts`). |
| Agent Service | `.venv/bin/python -m pytest -q` | ✅ **47 testes** |
| App Expo | `npx tsc --noEmit` | ✅ sem erros |
| App Expo | `npx eslint .` | ✅ sem erros |
| App Expo | `npx jest --silent` | ✅ 33 suítes, **491 testes** |

## 2. Matriz de situação por capacidade

Legenda: **E** existente e testado · **P** parcial · **A** ausente · **M** mockado/demonstração · **—** não se aplica.

| Capacidade | Mobile (Expo) | Web | API Node.js | PostgreSQL | Agente (Python) |
|---|---|---|---|---|---|
| Login, cadastro, recuperação, "manter conectado" | E | A | E | E | — |
| Biometria | E (dev build / Android Expo Go) | — (sem WebAuthn) | E | E | — |
| Sessão web (cookie HttpOnly + CSRF) | — | A | A (só Bearer) | P (`refresh_sessions` sem canal) | — |
| `GET /api/auth/me`, lista e encerramento de sessões | P (`/api/student/me`) | A | P (só `logout`) | P | — |
| Papéis e permissões (aluno / equipe ASA / admin) | — | A | P (`requireRole` em 10 rotas da equipe) | P (enum `user_role`) | — |
| Dados acadêmicos (disciplinas, notas, frequência, pendências) | E | A | E | E (seed **fictício**) | — |
| Análise do Agente para o Estudante | E | A | E | E | E (regras, sem ML) |
| Feedback sobre recomendações | A | A | A | P (tabela `agent_feedback` sem rota) | — |
| Assistente conversacional (texto/voz) | E | A | E (regras pt-BR, sem LLM) | E (só metadados) | — |
| Base de conhecimento | P (12 artigos fixos no catálogo) | A | P (artigos no código, sem busca) | A | — |
| Chamados — aluno | E | A | E | E (migration 004) | — |
| Chamados — equipe ASA (fila, atribuição, notas internas) | — | A | E (rotas `/api/support/staff/*`) | E | — |
| Leitura de mensagens do aluno pela equipe | — | A | A (só o aluno marca leitura) | P | — |
| SLA | P (rótulo) | A | P (dias úteis fixos no catálogo) | P (colunas no chamado) | — |
| Agendamentos | A | A | A | A | — |
| Fila presencial | E | A | E | E (migration 005) | — |
| Fonte da fila | M (`EXPO_PUBLIC_USE_MOCK_QUEUE`) | — | E/P (endpoint **não documentado** de presencial.fecap.br; simulador `mock`) | E | — |
| Central de notificações (inbox) | P (3 avisos do atendimento) | A | P (só avisos de chamado) | P (`support_notifications`) | — |
| Push | P (token só pelo fluxo da fila; sem `projectId` EAS) | — | E (Expo Push) | E | — |
| Auditoria geral | — | A | P (só eventos de chamado) | P (`support_ticket_events`) | — |
| Métricas, relatórios e CSV | — | A | A | — | — |
| Administração (usuários, convites, SLA, integrações, saúde, configurações) | — | A | A | A | P (`/config` só leitura) |
| Modo demonstração identificado | P (dados fictícios sem rótulo) | A | P (seeds sempre aplicados) | P | — |
| Integração JEV | — | — | A | — | — |
| Dados institucionais (TOTVS / Portal do Aluno) | — | — | A | — | — |

## 3. Inventário

### 3.1 Rotas da API existentes (todas preservadas)

- **Saúde:** `GET /health`, `GET /health/queue`.
- **Auth (14):** `GET /api/auth/policy`, `GET /api/auth/programs`, `POST /api/auth/{login,register,refresh,logout}`,
  `POST /api/auth/{forgot-password,resend-reset-code,verify-reset-code,reset-password}`,
  `POST /api/auth/biometric/{enroll,login,revoke}`.
- **Estudante (6):** `GET /api/student/{me,summary,subjects,assessments,attendance,pending-items}`.
- **Agente (5):** `POST /api/agent/analyze`, `GET /api/agent/recommendations(/:id)`, `GET /api/agent/history(/:runId)`.
- **Assistente (1):** `POST /api/assistant/message`.
- **Atendimento — aluno (17):** `/api/support/{catalog,overview,tickets,tickets/:id,…/events,…/messages,…/read,…/cancel,…/reopen,…/rating,…/attachments/:id/link,uploads,notifications,notifications/read}` e `GET /api/support/files/:id` (link assinado).
- **Atendimento — equipe (10):** `/api/support/staff/tickets(/:id)`, `…/{status,assign,messages,notes,priority,resolve}`, `/api/support/staff/uploads(/:id)`.
- **Fila presencial (8):** `GET /api/queue`, `GET /api/queue/status`, `GET /api/queue/stream` (SSE),
  `POST|GET|PATCH|DELETE /api/queue/subscriptions(/current)`, `POST /api/queue/dev/mock` (só com o simulador).
- **Push (2):** `POST|DELETE /api/notifications/push-token`.

### 3.2 Contratos

- `src/Entrega_2/Backend/contracts/api/mobile-api.v1.ts` é a **fonte canônica** (v1.0 → v1.4), copiada byte a byte
  para `api/src/contracts/mobileApi.v1.ts` e `Frontend/types/api.ts`. A cópia é verificada em CI por
  `scripts/check-contracts-sync.sh`.
- `contracts/agent/student-agent-{request,response}.v1.json`: JSON Schema API ↔ Agent Service (só aceita major 1).

### 3.3 Entidades (PostgreSQL)

`users`, `refresh_sessions`, `students`, `subjects`, `enrollments`, `assessments`, `attendance`, `pending_items`,
`agent_runs`, `agent_recommendations`, `agent_evidence`, `agent_feedback`, `assistant_interactions`, `programs`,
`password_resets`, `device_credentials`, `support_tickets`, `support_ticket_events` (somente-inserção),
`support_ticket_messages`, `support_attachments`, `support_ticket_ratings`, `support_notifications`,
`queue_subscriptions`, `queue_subscription_events`, `queue_calls`, `queue_monitor_state`, `push_devices`,
`notification_deliveries`.

Papéis no banco: `student`, `institutional_staff` e `technical_admin`. Na interface eles se chamam **Aluno**,
**Equipe ASA** e **Administração**. O enum não foi renomeado, para não quebrar JWT, dados e app.

### 3.4 Testes

- API: 13 arquivos unitários, 4 de integração (PostgreSQL real) e 3 E2E (Agent Service real via uvicorn).
- Agent Service: `test_engine.py` (8 cenários oficiais), `test_api.py` e `test_contract.py`.
- App: 33 suítes Jest (cliente HTTP, navegação, voz, autenticação, atendimento e fila).

## 4. Projeto 5 → Projeto 4

O Projeto 5 (React + Vite + Tailwind 3 + React Router 6, backend Express + Prisma/SQLite) é **referência de
experiência e domínio**. Não tem licença ("Todos os direitos reservados © 2026"). Por isso nenhum arquivo,
componente, texto ou imagem foi copiado: os padrões úteis foram **reimplementados** com a identidade ASA
Conecta. A marca do outro projeto não aparece no Projeto 4.

| Projeto 5 (página/ação) | Situação lá | Projeto 4 (módulo / caso de uso) | Decisão |
|---|---|---|---|
| `/login` com botões de perfil demo | API insegura (aceita qualquer senha) | `POST /api/web/auth/login` (mesmo `AuthService` do app) | Reimplementado; sem atalhos demo na tela |
| `AlunoDashboard` | mock | `/aluno`: `student/summary`, chamados, agendamentos, avisos | Reimplementado com dados reais |
| `AlunoChat` + ação "abrir chamado" | Gemini + RAG por palavra-chave | `/aluno/assistente`: `POST /api/assistant/message` + base de conhecimento + encaminhamento com confirmação | Reimplementado sem LLM |
| `AlunoChamados` / `NovoChamado` / `DetalheChamadoAluno` | API (mostrava notas internas ao aluno) | `/aluno/chamados*` sobre `/api/support/*` | Reutiliza a API existente; notas internas nunca saem para o aluno |
| `AlunoDocumentos` | dados fixos | `/aluno/documentos`: chamados da categoria Documentos + arquivos recebidos + artigos | Reimplementado com dados reais |
| `AlunoAgendamento` (dias, grade de horários, voucher, ICS) | API; **inventava sucesso em erro** | `/aluno/agendamentos` + módulo de agendamentos (migration 007) | Reimplementado com bloqueio de conflito no banco |
| `AlunoProfile` | mock | `/aluno/perfil`: conta, sessões, notificações | Reimplementado |
| `AsaFila` (assumir, contagem de SLA) | API | `/asa/chamados` | Padrão de UX reaproveitado |
| `AsaDetalheChamado` (3 colunas, nota interna) | API | `/asa/chamados/:id` | Padrão reaproveitado; o painel de IA mostra só o que existe |
| `AsaAgendamentos` (calendário/linha do tempo/tabela) | API + feed iCal falso | `/asa/agendamentos` + disponibilidade | Reimplementado sem feed falso |
| `AsaConversas` | mock | `/asa/conversas`: chamados com mensagem do aluno não lida | Reimplementado |
| `AsaAlunos` | expunha conversas de todos | `/asa/alunos`: só alunos com chamado ou agendamento, acesso auditado | Reimplementado com minimização |
| `AsaAgenteIA` | mock | `/asa/agente-ia`: indicadores agregados reais + feedback | Reimplementado |
| `AsaBaseConhecimento` | API + cache local que recriava documentos | `/asa/base-conhecimento` (migration 008) | Reimplementado com versões e publicação |
| `AsaSLA`, `AsaMetricas`, `AsaRelatorios`, `AsaNotificacoes`, `AsaAuditoria` | páginas "em construção" | `/asa/{sla,metricas,notificacoes,auditoria}` | Implementado |
| `AdminCommandCenter`, `AdminSaude` | mock | `/admin`, `/admin/saude` | Indicadores de endpoints reais |
| `AdminUsuarios`, `AdminPermissoes` | mock | `/admin/usuarios`, `/admin/permissoes` | Convite, papéis e sessões reais; matriz lida do servidor |
| `AdminSLA`, `AdminCategorias` | mock | `/admin/sla`, `/admin/categorias` | SLA editável (migration 009); categorias versionadas no código (ADR-006) |
| `AdminAutomacoes` | mock | `/admin/automacoes` | Motor mínimo real ou estado "planejado" (ver plataforma/) |
| `AdminPrompts`, `AdminRAG` | mock (GPT-4o / Pinecone inexistentes) | `/admin/agente-ia` | **Não aplicável**: não há LLM nem índice vetorial; a página diz isso |
| `AdminIntegracoes` | mock | `/admin/integracoes` | Estados reais; JEV "planejado", TOTVS "depende de autorização" |
| `AdminAuditoria`, `AdminLogs`, `AdminSeguranca` | mock | `/admin/auditoria` | Trilha real (`audit_events`) |

### 4.1 Padrões do Projeto 5 que não devem ser copiados

- Senha aceita por qualquer valor com 4+ caracteres, rota pública `demo-login` que gera token de admin e segredo
  JWT público versionado.
- Token em `localStorage` e guarda de rota que confia no papel salvo no navegador.
- Autorização ausente na maioria das rotas: aluno lendo chamados de outros, notas internas expostas e base de
  conhecimento editável por alunos.
- CORS `*`, erros com `err.message` para o cliente, sem helmet, rate limit ou validação.
- Sucesso fabricado quando o agendamento falha e caches locais sem escopo de usuário.

## 5. Fluxos divergentes, problemas e riscos encontrados

| # | Achado | Impacto | Tratamento |
|---|---|---|---|
| 1 | API só aceita Bearer; não há sessão web segura | Portal precisaria guardar token em `localStorage` | Sessão web por cookie HttpOnly + CSRF (ADR-008) |
| 2 | ADR-001 diz que equipe/admin não têm funções; ADR-006 criou rotas da equipe | Documentação contraditória | ADR-008 atualiza a decisão |
| 3 | `technical_admin` lê o conteúdo completo dos chamados | Admin com acesso irrestrito a dados pessoais | Conteúdo de chamado passa a exigir permissão da equipe ASA; admin vê só metadados |
| 4 | Papel vem do JWT por até 15 min | Troca de papel demora a valer | Troca de papel e desativação revogam as sessões na hora |
| 5 | Seeds fictícios rodam em toda subida do container, inclusive em banco remoto | Mistura de dados demo e reais | `DEMO_SEED_ENABLED`, bloqueio em produção e opt-in para banco remoto |
| 6 | Contas demo não são identificadas no banco | Impossível isolar dados de demonstração | `users.is_demo` + rótulo "DEMONSTRAÇÃO" nos clientes |
| 7 | Fila presencial usa por padrão um endpoint **não documentado** do portal da FECAP | Autorização institucional não registrada | Padrão passa a ser o simulador identificado; fonte real só com opt-in (`ASA_QUEUE_SOURCE_AUTHORIZED`) |
| 8 | Push não chega a nenhum aparelho (sem `projectId` EAS; token só pelo fluxo da fila) | Avisos só no app aberto | Documentado; inbox interno passa a ser o canal garantido |
| 9 | `reference_date` do agente é a data UTC | Pendências "vencidas" um dia antes depois das 21h | Corrigido para `APP_TIMEZONE` |
| 10 | Agent Service publica a porta 8000 e `/internal/docs` no host | Serviço interno exposto na rede | Portas internas ligadas a `127.0.0.1` no Compose |
| 11 | Mensagens do aluno nunca são marcadas como lidas pela equipe | Equipe sem "não lidas" | Leitura pela equipe registrada no mesmo campo `read_at` |
| 12 | `CORS_ORIGIN=*` | Aceitável só para o app; perigoso para cookies | Cookies não usam CORS (portal na mesma origem via proxy); origem verificada no CSRF |
| 13 | README raiz não cita fila/atendimento e mostra LLM/RAG que não existem | Documentação enganosa | Atualizado |

### 5.1 Dependências externas

- **Agent Service** (FastAPI): já é dependência da API; falhas viram 503/504/502 sem inventar recomendações.
- **E-mail** (Mailpit local / SMTP): recuperação de senha e convites. Com `MAIL_TRANSPORT=disabled` o convite
  informa que o e-mail não foi enviado.
- **Expo Push**: exige build EAS com `projectId`. Não funciona no Expo Go Android.
- **presencial.fecap.br**: sem contrato nem autorização institucional registrados.
- **JEV**: sem especificação técnica no material recebido (ver `JEV_INTEGRATION_ADR.md`).
- **TOTVS / Portal do Aluno**: sem API pública nem autorização; nada é automatizado com senha do aluno.

## 6. Limitações reais do Expo Go

| Recurso | Expo Go | Development build | Web (Chrome/Edge) |
|---|---|---|---|
| Texto + leitura em voz (TTS) | ✅ | ✅ | ✅ |
| Reconhecimento de fala | ❌ (exige módulo nativo) | ✅ | ✅ (Web Speech API) |
| "Hey Asa" | ❌ | ✅ **só em primeiro plano**, opt-in | ✅ em primeiro plano |
| Biometria | iOS ❌ / Android ✅ | ✅ | — |
| Push | Android ❌ | ✅ com `projectId` EAS | — |

O "Hey Asa" **não** escuta em segundo plano e não há motor dedicado de wake word: é uma sessão do
reconhecedor do sistema enquanto o app está aberto (ver `assistant/wake-word.md`). No Expo Go, o assistente
funciona por texto, com resposta falada.

## 7. Decisões tomadas a partir desta auditoria

1. **Portal web novo** em `src/Entrega_2/Web` com React 19 + Vite 8 + TypeScript + Tailwind CSS 4 + React Router 7
   + TanStack Query. Sem Radix/Framer/Recharts/Zustand: diálogos nativos (`<dialog>`), CSS e gráficos SVG próprios.
2. **Uma API, um banco.** O portal usa a mesma API Express e o mesmo PostgreSQL. Não há segunda base nem Prisma.
3. **Sessão web por cookie** (`asa_at`/`asa_rt` HttpOnly, `SameSite=Strict`, `Secure` em produção) com CSRF por
   duplo envio + verificação de origem. O app continua com Bearer + SecureStore.
4. **Autorização no servidor** por matriz `ação:recurso` (`auth/permissions.ts`) + verificação de titularidade.
5. **Migrations aditivas** `006`–`011` (identidade/auditoria/notificações, agendamentos, base de conhecimento,
   SLA/automações, vínculo de remarcação, meta de primeira resposta). Nada é recriado nem apagado.
6. **Modo demonstração explícito** (`APP_ENV`, `DEMO_DATA_ENABLED`, `DEMO_SEED_ENABLED`, `ACADEMIC_DATA_PROVIDER`).
   Sem fonte institucional, o sistema mostra "aguardando integração" e nunca usa mock silenciosamente.
7. **Sincronização** por REST + invalidação de cache + atualização periódica visível. Não há WebSocket novo.
8. **IA:** o Agente para o Estudante continua sendo o MVP. A base de conhecimento usa busca lexical do
   PostgreSQL com citações. A interface `AIProviderAdapter` tem o adaptador atual e um `JevAdapter` desligado.
9. **Contratos:** a fonte canônica ganha seções novas e uma terceira cópia em `Web/src/types/api.ts`,
   verificada pelo mesmo script de CI.

## 8. Plano de migração incremental

| Fase | Entrega | Critério de aceite |
|---|---|---|
| 0 | Esta auditoria, baseline e branch dedicada | Relatório + comandos + resultados |
| 1 | Config/flags, migration 006, permissões, sessão web, `auth/me`, sessões, auditoria, info da plataforma, portal com login e painel do aluno | Mesma conta no app e no portal; rotas protegidas no servidor |
| 2 | Portal do aluno e da equipe sobre o atendimento existente, leitura pela equipe, inbox unificado, métricas e CSV | Ciclo app → portal ASA → app testado com API e banco reais |
| 3 | Agendamentos (migration 007) no portal e no app, avisos e SLA | Sem reserva dupla (teste de concorrência) |
| 4 | Área acadêmica e assistente no portal, base de conhecimento (migration 008), feedback do agente, JEV desligado | Mesma recomendação nos dois canais; abstenção testada |
| 5 | Administração: usuários/convites, permissões, SLA (migration 009), integrações, saúde, auditoria, configurações | Cada tela com CRUD testado ou marcada como planejada |
| 6 | CI, Compose com o portal, documentação, roteiro de demonstração e relatório de testes | Ambiente reproduzível e status verdadeiro |
