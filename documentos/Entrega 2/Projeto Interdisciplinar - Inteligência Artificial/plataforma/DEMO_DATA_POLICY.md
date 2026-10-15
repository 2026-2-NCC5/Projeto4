# Política de dados de demonstração

**Regra:** dado fictício sempre aparece identificado como **"DEMONSTRAÇÃO — Dados fictícios"** e nunca substitui
um dado real que esteja indisponível. Quando a fonte real falta, o sistema diz que falta (erro explícito ou
"aguardando integração"). Ele não troca a fonte em silêncio.

## Chaves de configuração

| Variável | Padrão | Efeito |
|---|---|---|
| `APP_ENV` | derivado de `NODE_ENV` | Ambiente exibido nos clientes (`development`, `test`, `staging`, `demo`, `production`). |
| `DEMO_DATA_ENABLED` | `true` | Liga o modo demonstração. Com `false`: contas `@demo.asa` não entram, sessões delas são encerradas na subida da API, a equipe e a administração não veem dados fictícios e a fonte acadêmica fictícia responde 503. |
| `DEMO_SEED_ENABLED` | `true` | Permite aplicar `database/seeds/*.sql`. |
| `DEMO_SEED_ALLOW_REMOTE` | `false` | Libera seeds em banco **remoto**. Use só num banco dedicado à demonstração. |
| `DEMO_SCENARIO` | `academic-full` | Nome do cenário (informativo). |
| `ACADEMIC_DATA_PROVIDER` | `demo` | `demo`: disciplinas, notas e frequência vêm do seed fictício. `institutional`: fonte oficial, ainda não integrada (503 `academic_source_unavailable`). |
| `ASA_QUEUE_PROVIDER` | `mock` | A fila presencial usa o simulador, identificado como demonstração (`sync.source.kind = demo`). |

### Quando os seeds rodam (`seedDecision`, testado)

Os seeds rodam **somente** quando todas as condições abaixo valem:

1. `DEMO_SEED_ENABLED=true`;
2. o ambiente **não** é produção (nem `NODE_ENV` nem `APP_ENV`);
3. `DEMO_DATA_ENABLED=true`;
4. o banco é local, ou é remoto **com** `DEMO_SEED_ALLOW_REMOTE=true`.

Se alguma condição falha, `npm run db:seed` (e a subida do container) registra o motivo e segue sem dados
fictícios. Todos os seeds são idempotentes (`on conflict do nothing`). `db:reset` (recria o schema) é bloqueado em
produção e em bancos remotos, salvo `ALLOW_REMOTE_DB_RESET=true`, que não deve ser usado em banco compartilhado.

## Como os dados fictícios são marcados

- **Contas**: todo e-mail `@demo.asa` recebe `users.is_demo = true` (migration 006 e seed 004). Esse domínio só
  é aceito no cadastro com o modo demonstração ligado.
- **Clientes**:
  - `GET /api/platform/info` informa `dataMode` (`demo` ou `institutional`) e o rótulo.
  - Toda resposta de `/api/*` leva o cabeçalho `X-ASA-Data-Mode`.
  - O portal mostra a faixa "DEMONSTRAÇÃO — Dados fictícios" em todas as páginas.
  - O app mostra o mesmo selo no Início e no Perfil.
  - O simulador da fila aparece como "Simulação — dados fictícios".
- **Indicadores e relatórios**: cada resposta de métrica traz `source` (descrição da origem, horário, fuso e modo
  de dados).
- **Base de conhecimento**: artigos de exemplo têm `is_demo = true` e aparecem com selo de demonstração.

## Conteúdo dos seeds

| Seed | Conteúdo (tudo fictício) |
|---|---|
| `001_demo_students.sql` | Estudantes `student-demo-*`, um por cenário do agente (regular, frequência baixa, desempenho baixo, múltiplos alertas, sem dados, dados inconsistentes, validação), e a conta de equipe `responsavel.exemplo@demo.asa`. |
| `002_demo_registered_students.sql` | Dá um semestre fictício (5 disciplinas, notas, frequência e pendências) a cada estudante **cadastrado** que ainda não tem matrícula, para as telas não ficarem vazias numa demonstração. **Só roda com o modo demonstração ligado** (mesma `seedDecision`): com `DEMO_DATA_ENABLED=false`, contas reais nunca recebem notas inventadas. |
| `003_demo_support_tickets.sql` | Chamados de exemplo em várias situações e prazos. |
| `004_demo_platform.sql` | `atendente.asa@demo.asa` (equipe) e `admin.plataforma@demo.asa` (administração), e marcação `is_demo`. |
| `005_demo_appointments.sql` | Disponibilidade de dois atendentes ("Central de atendimento ASA (local de demonstração)" e online) e dois agendamentos. |
| `006_demo_knowledge.sql` | Artigos publicados da Central de ajuda (versão 1), sobre processos do ASA e da plataforma. |
| `007_demo_automations.sql` | Três regras de automação de exemplo, **desligadas**. |

As senhas das contas fictícias são de desenvolvimento e não dão acesso a nada real. Elas não são reaproveitadas
em nenhum ambiente institucional. Os testes leem a senha de uma única constante
(`api/test/support/fixtures.ts`).

## Comportamento com a demonstração desligada (`DEMO_DATA_ENABLED=false`)

| Situação | Resultado |
|---|---|
| Login, cadastro ou renovação de conta `@demo.asa` | `403 demo_account_disabled` (portal e app) |
| Sessões abertas antes da mudança | Encerradas na subida da API |
| Fila da equipe, métricas, CSV, contas e chamados da administração | Ignoram registros de contas fictícias (`excludeDemo`) |
| Dados acadêmicos | `503 academic_source_unavailable` com mensagem para o aluno ("aguardando integração") |
| Central de ajuda e assistente | Artigos fictícios (`is_demo`) não aparecem na lista, na busca nem no detalhe, e o assistente não os cita. A gestão da equipe continua listando-os, com o selo, para que possam ser arquivados. |
| Agendamentos | Janelas de atendentes fictícios não geram horários e não aparecem na disponibilidade da equipe |
| Selo "DEMONSTRAÇÃO" | Some; `dataMode = institutional` |

Testes:
- API: `test/unit/platform.test.ts` (seedDecision, contas demo bloqueadas), `test/integration/demoOff.integration.test.ts`
  (conta real sem artigos, horários nem notas fictícios) e
  `test/integration/admin.integration.test.ts` (revogação das sessões).
- E2E: `Web/e2e/demo-off.spec.ts`, que roda contra uma API com a demonstração desligada.
