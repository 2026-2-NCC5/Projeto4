# Matriz de papéis e permissões

> Fonte da verdade: `src/Entrega 2/Backend/api/src/auth/permissions.ts`. A tabela abaixo foi **gerada a partir
> desse arquivo** com `npm run docs:permissions` (na pasta `api/`). Não edite à mão: rode o comando de novo quando
> a matriz mudar. Os menus do app e do portal só escondem
> o que o perfil não pode usar — quem decide é sempre a API.

## Papéis

| Papel (`users.role`) | Rótulo | Quem é | Como nasce a conta |
|---|---|---|---|
| `student` | Aluno | Estudante da FECAP | Cadastro próprio com e-mail institucional e RA (app ou portal) |
| `institutional_staff` | Equipe ASA | Atendentes da Área do Sucesso Alvarista | Convite da administração (`POST /api/admin/users`) |
| `technical_admin` | Administração | Responsáveis técnicos/governança | Convite da administração |

Regras de governança (verificadas no servidor, com testes):

- Ninguém altera o próprio papel nem se desativa (`403 self_change`).
- Conta de aluno não muda de papel (`409 invalid_transition`): equipe é sempre uma conta separada.
- Sempre sobra ao menos uma administração ativa (`409 last_admin`). A checagem e a escrita acontecem na mesma
  transação, com as contas de administração travadas (`select … for update`): duas pessoas desativando uma à
  outra ao mesmo tempo não deixam o sistema sem administração (teste de concorrência na integração).
- Mudar papel ou desativar encerra **na hora** todas as sessões da conta (o token antigo deixa de valer na
  próxima requisição, porque toda requisição confere a sessão no banco).

## Permissões por papel

| Grupo | Permissão | Descrição | Aluno | Equipe ASA | Administração |
|---|---|---|:-:|:-:|:-:|
| Conta | `account:read:own` | Ver os próprios dados de conta | ✅ | ✅ | ✅ |
| Conta | `account:sessions:own` | Listar e encerrar as próprias sessões | ✅ | ✅ | ✅ |
| Conta | `notifications:read:own` | Ler a própria central de avisos | ✅ | ✅ | ✅ |
| Acadêmico | `academic:read:own` | Ver disciplinas, notas, frequência e pendências próprias | ✅ | — | — |
| Acadêmico | `agent:run:own` | Pedir análise ao Agente para o Estudante | ✅ | — | — |
| Acadêmico | `agent:feedback:own` | Avaliar as próprias recomendações | ✅ | — | — |
| Acadêmico | `assistant:use` | Conversar com o Assistente ASA | ✅ | — | — |
| Atendimento | `tickets:create:own` | Abrir chamados | ✅ | — | — |
| Atendimento | `tickets:read:own` | Acompanhar os próprios chamados | ✅ | — | — |
| Atendimento | `tickets:read:any` | Ler chamados de qualquer aluno (fila ASA) | — | ✅ | — |
| Atendimento | `tickets:read:metadata` | Ver indicadores e metadados de chamados, sem o conteúdo | — | — | ✅ |
| Atendimento | `tickets:manage` | Responder, atribuir, mudar situação e prioridade | — | ✅ | — |
| Atendimento | `tickets:internal_note` | Registrar notas internas (nunca visíveis ao aluno) | — | ✅ | — |
| Agendamentos | `appointments:book:own` | Agendar, remarcar e cancelar os próprios atendimentos | ✅ | — | — |
| Agendamentos | `appointments:read:any` | Ver a agenda do ASA | — | ✅ | — |
| Agendamentos | `appointments:manage` | Confirmar, concluir, cancelar e registrar ausência | — | ✅ | — |
| Agendamentos | `availability:manage:own` | Gerenciar a própria disponibilidade | — | ✅ | — |
| Agendamentos | `availability:manage:any` | Gerenciar a disponibilidade de qualquer atendente | — | — | ✅ |
| Base de conhecimento | `kb:read:published` | Ler artigos publicados | ✅ | ✅ | ✅ |
| Base de conhecimento | `kb:read:all` | Ler rascunhos e artigos internos | — | ✅ | ✅ |
| Base de conhecimento | `kb:write` | Criar e editar artigos | — | ✅ | ✅ |
| Base de conhecimento | `kb:publish` | Publicar e arquivar artigos | — | ✅ | ✅ |
| Operação | `students:read:support_context` | Ver dados de contato e histórico de atendimento de alunos atendidos | — | ✅ | — |
| Operação | `metrics:read` | Ver métricas e indicadores | — | ✅ | ✅ |
| Operação | `reports:export` | Exportar relatórios (CSV sem dados pessoais) | — | ✅ | ✅ |
| Operação | `agent:insights:read` | Ver indicadores agregados do Agente e do Assistente | — | ✅ | ✅ |
| Governança | `audit:read:own` | Ver a própria trilha de auditoria | — | ✅ | ✅ |
| Governança | `audit:read:any` | Consultar a trilha de auditoria completa | — | — | ✅ |
| Governança | `users:manage` | Convidar contas, mudar papéis e ativar/desativar | — | — | ✅ |
| Governança | `sessions:revoke:any` | Encerrar sessões de qualquer conta | — | — | ✅ |
| Governança | `settings:manage` | Alterar parâmetros institucionais | — | — | ✅ |
| Governança | `sla:manage` | Alterar metas de SLA | — | — | ✅ |
| Governança | `automations:manage` | Configurar automações | — | — | ✅ |
| Governança | `integrations:read` | Ver o estado das integrações | — | — | ✅ |
| Governança | `health:read` | Ver a saúde dos serviços | — | — | ✅ |
| Governança | `permissions:read` | Ver a matriz de permissões | — | — | ✅ |

### O que a administração **não** pode

- Ler o conteúdo de chamados (assunto, descrição, mensagens, anexos, notas internas). Ela vê apenas
  **metadados** (`tickets:read:metadata`): protocolo, categoria, situação, prioridade, equipe, canal, datas e
  prazo — `GET /api/admin/tickets`. As rotas da fila (`/api/support/staff/*`) exigem `tickets:read:any`, que é
  só da equipe ASA.
- Ver dados acadêmicos de alunos (`academic:read:own` é só do próprio aluno).
- Ver dados de contato e o histórico de atendimento de alunos (`students:read:support_context` é da equipe).

## Como a API aplica a matriz

1. `authenticate` valida o token (Bearer do app **ou** cookie do portal com CSRF) **e** a sessão no banco
   (revogada → `401 session_revoked`).
2. `requirePermission(permissão)` confere a matriz pelo papel da sessão. Negações viram `403 permission_denied`
   e entram na auditoria como `authz.denied` (com a rota e a permissão, sem dados pessoais).
3. Rotas do aluno passam antes por `requireStudent` (sessão de aluno com vínculo acadêmico; o `studentId` vem
   **sempre** da sessão, nunca do corpo/URL) e depois pela permissão da matriz.
4. Titularidade: cada recurso confere o dono (chamado ou agendamento de outro aluno → `403`; inexistente → `404`).
   Os identificadores são aleatórios (`ticket-<uuid>`, `appt-<uuid>`), então o 403 não revela nada explorável.

### Rotas e permissões (rotas com `can(...)` explícito)

| Método e rota | Permissão exigida |
|---|---|
| `GET /api/admin/audit-events` | audit:read:any |
| `GET /api/admin/automations` | automations:manage |
| `GET /api/admin/automations/:id/runs` | automations:manage |
| `GET /api/admin/health` | health:read |
| `GET /api/admin/integrations` | integrations:read |
| `GET /api/admin/overview` | health:read |
| `GET /api/admin/permissions` | permissions:read |
| `GET /api/admin/settings` | settings:manage |
| `GET /api/admin/sla-policies` | sla:manage |
| `GET /api/admin/tickets` | tickets:read:metadata |
| `GET /api/admin/users/:id` | users:manage |
| `GET /api/admin/users` | users:manage |
| `GET /api/appointments` | appointments:book:own |
| `GET /api/appointments/:id` | appointments:book:own |
| `GET /api/appointments/:id/calendar.ics` | appointments:book:own |
| `GET /api/appointments/slots` | appointments:book:own |
| `GET /api/asa/agent-insights` | agent:insights:read |
| `GET /api/asa/appointments` | appointments:read:any |
| `GET /api/asa/appointments/:id` | appointments:read:any |
| `GET /api/asa/availability` | [availability:manage:own, availability:manage:any] |
| `GET /api/asa/dashboard` | tickets:read:any |
| `GET /api/asa/metrics` | metrics:read |
| `GET /api/asa/reports/tickets.csv` | reports:export |
| `GET /api/asa/students/:id` | students:read:support_context |
| `GET /api/asa/students` | students:read:support_context |
| `GET /api/audit/mine` | audit:read:own |
| `GET /api/knowledge-base` | kb:read:published |
| `GET /api/knowledge-base/manage/:id` | kb:read:all |
| `GET /api/knowledge-base/manage` | kb:read:all |
| `GET /api/knowledge-base/:slug` | kb:read:published |
| `PATCH /api/admin/automations/:id` | automations:manage |
| `PATCH /api/admin/users/:id` | users:manage |
| `PATCH /api/asa/appointments/:id` | appointments:manage |
| `PATCH /api/asa/availability/:id` | [availability:manage:own, availability:manage:any] |
| `POST /api/admin/automations` | automations:manage |
| `POST /api/admin/users/:id/invite` | users:manage |
| `POST /api/admin/users/:id/revoke-sessions` | sessions:revoke:any |
| `POST /api/admin/users` | users:manage |
| `POST /api/appointments` | appointments:book:own |
| `POST /api/appointments/:id/cancel` | appointments:book:own |
| `POST /api/appointments/:id/reschedule` | appointments:book:own |
| `POST /api/asa/availability` | [availability:manage:own, availability:manage:any] |
| `POST /api/knowledge-base/manage/:id/archive` | kb:publish |
| `POST /api/knowledge-base/manage/:id/publish` | kb:publish |
| `POST /api/knowledge-base/manage/:id/restore` | kb:write |
| `POST /api/knowledge-base/manage/:id/submit` | kb:write |
| `POST /api/knowledge-base/manage` | kb:write |
| `PUT /api/admin/settings/:key` | settings:manage |
| `PUT /api/admin/sla-policies/:categoryId` | sla:manage |
| `PUT /api/knowledge-base/manage/:id` | kb:write |
| `GET /api/student/{summary,subjects,assessments,attendance,pending-items}` | aluno + academic:read:own |
| `GET /api/agent/{recommendations,history}` (e detalhes) | aluno + academic:read:own |
| `POST /api/agent/analyze` | aluno + agent:run:own |
| `POST /api/agent/recommendations/:id/feedback` | aluno + agent:feedback:own |
| `POST /api/assistant/message` | aluno + assistant:use |
| `POST /api/support/tickets` | aluno + tickets:create:own |
| demais `/api/support/{overview,tickets/*,uploads,notifications}` | aluno + tickets:read:own |
| `GET /api/support/staff/*` | tickets:read:any |
| `POST /api/support/staff/tickets/:id/{status,assign,messages,priority,resolve}` e envios | tickets:read:any + tickets:manage |
| `POST /api/support/staff/tickets/:id/notes` | tickets:read:any + tickets:internal_note |
| `/api/auth/me`, `/api/auth/sessions*`, `/api/notifications*` | sessão válida (própria conta) |

Testes que provam a matriz: `test/unit/platform.test.ts` (matriz e negações auditadas), `test/unit/admin.test.ts`
(403 para aluno/equipe em todas as rotas de administração; regras de governança), `test/unit/operations.test.ts`
(perfil hipotético "equipe só leitura" recebe 403 em todas as escritas da fila),
`test/integration/admin.integration.test.ts` (corrida entre administrações) e `Web/e2e/roles.spec.ts` (tela + API).
