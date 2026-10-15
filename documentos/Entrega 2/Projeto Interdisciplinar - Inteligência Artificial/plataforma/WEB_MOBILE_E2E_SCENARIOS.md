# Cenários ponta a ponta entre app e portal

Cada cenário diz quais canais participam e **qual teste automatizado o cobre**. Todos rodam contra a API e o
PostgreSQL reais, exceto onde está escrito "unitário". Pastas:
- `api/test` = `src/Entrega 2/Backend/api/test`;
- `Web/e2e` = Playwright do portal;
- `Web/src/**.test.tsx` = testes de tela do portal;
- `Frontend/__tests__` = testes do app.

| # | Cenário | Canais | Cobertura automatizada |
|---|---|---|---|
| 1 | Mesma conta no app (Bearer) e no portal (cookie HttpOnly). Nenhum token no `localStorage`. Sessões listadas e encerradas | app + portal | `Web/e2e/global.setup.ts`; `api/test/integration/platform.integration.test.ts`; `api/test/unit/platform.test.ts` |
| 2 | Aluno abre chamado pelo **app**, equipe responde pelo **portal**, aluno lê no portal **e** no app | app → portal → app | `Web/e2e/ticket-cross-channel.spec.ts`; `api/test/integration/support.integration.test.ts` |
| 3 | Equipe pede uma ação, prazo pausa, aluno responde com anexo, prazo retoma (estendido) | portal ↔ app | `api/test/unit/support.test.ts`; `Web/src/pages/asa/TicketWorkspacePage.test.tsx` |
| 4 | "Assumir" na mesma equipe é interno (sem aviso ao aluno, salvo mudança de situação). Encaminhar avisa o aluno e deixa sem atendente | portal → app | `api/test/unit/operations.test.ts`; `Web/src/pages/asa/TicketWorkspacePage.test.tsx` |
| 5 | Pessoas da equipe alteram o mesmo chamado ao mesmo tempo: nenhuma alteração se perde (as que chegam com versão velha recebem `409 ticket_changed` e a tela recarrega) | portal | `api/test/integration/support.integration.test.ts` (8 alterações em paralelo no PostgreSQL); `Web/src/pages/asa/TicketWorkspacePage.test.tsx` |
| 6 | Dois (e cinco) alunos disputam o último horário: um consegue, os outros recebem `409 slot_unavailable`, nunca `500` | app + app | `api/test/integration/appointments.integration.test.ts` (2 e 5 reservas simultâneas no PostgreSQL); `Web/e2e/appointments.spec.ts` |
| 7 | Agendado pelo app aparece no portal do aluno e da equipe. Cancelado pelo portal, o app vê o cancelamento | app → portal → app | `Web/e2e/appointments.spec.ts` |
| 8 | Mesmo horário em dois locais: a reserva fica no local escolhido. Remarcação atômica com vínculo de/para | app / portal | `api/test/integration/appointments.integration.test.ts`; `Web/src/pages/student/appointments/*.test.tsx`; `Frontend/__tests__/appointmentDetail.test.tsx` |
| 9 | Central de avisos única: lido no portal fica lido no app | portal ↔ app | `api/test/unit/platform.test.ts`; `Frontend/__tests__/NotificationsScreen.test.tsx` |
| 10 | Cada perfil só abre a própria área. A API responde 403 na mesma sessão. A administração não lê conteúdo de chamado | portal | `Web/e2e/roles.spec.ts`; `api/test/unit/admin.test.ts`; `api/test/integration/admin.integration.test.ts` |
| 11 | Escrita na fila exige a permissão da ação: um perfil só de leitura recebe 403 em todas as escritas | API | `api/test/unit/operations.test.ts` |
| 12 | Mudança de papel ou desativação derruba as sessões nos dois canais na próxima requisição | portal (admin) → app | `api/test/unit/admin.test.ts`; `api/test/integration/admin.integration.test.ts` |
| 13 | Nunca fica sem administração, mesmo com duas desativações simultâneas | portal (admin) | `api/test/integration/admin.integration.test.ts` |
| 14 | Demonstração desligada: contas fictícias bloqueadas (tela e app), selo some, acadêmico responde 503 honesto, sessões antigas caem | portal + app | `Web/e2e/demo-off.spec.ts`; `api/test/unit/platform.test.ts`; `api/test/integration/admin.integration.test.ts` |
| 15 | Meta de SLA da administração vale para o próximo chamado e aparece no catálogo | portal (admin) → app | `api/test/unit/admin.test.ts`; `api/test/integration/admin.integration.test.ts` |
| 16 | Automação avisa a equipe na abertura, uma vez por chamado (também com duas instâncias). Prazo excedido eleva a prioridade como evento interno | API | `api/test/unit/admin.test.ts`; `api/test/integration/admin.integration.test.ts` |
| 17 | Base de conhecimento: o assistente responde com **fonte**. Pouca confiança gera abstenção, que vira chamado pré-preenchido | app / portal | `api/test/integration/knowledge.integration.test.ts`; `api/test/unit/aiProviders.test.ts`; testes do assistente no portal |
| 18 | Agente: mesma recomendação nos dois canais e avaliação "foi útil?" | app + portal | `api/test/unit/agent.test.ts` (recomendações); `api/test/integration/knowledge.integration.test.ts` (avaliação gravada e auditada); testes da área acadêmica do portal; `Frontend/__tests__` |
| 19 | Fila presencial identifica o simulador como demonstração | app | `Frontend/__tests__/queueSourceLabel.test.tsx`; `api/test/unit/platform.test.ts` |

## Como rodar

```bash
# API: unitários (memória) e integração (PostgreSQL de teste em TEST_DATABASE_URL)
cd "src/Entrega 2/Backend/api" && npm run test:unit && npm run test:integration
# Portal: telas (Vitest) e ponta a ponta (Playwright) contra a pilha local já no ar (API :3000 + Vite :5173)
cd "src/Entrega 2/Web" && npm test && npx playwright test
# Cenário "demonstração desligada": precisa de uma segunda API com DEMO_DATA_ENABLED=false e de um
# `vite preview` apontado para ela. O CI (job web-e2e) sobe as duas instâncias; localmente, defina
# E2E_DEMO_OFF_URL para incluir o projeto demo-off.
# App
cd "src/Entrega 2/Frontend" && npm test
```

Os testes Playwright entram uma vez por perfil (projeto `setup`) e reaproveitam a sessão, por causa do limite de
logins por IP. Tudo que criam é cancelado no fim de cada teste.

## Verificação manual no celular (Expo Go)

O que depende de aparelho e não roda no CI:

1. **Login no celular e no portal com a mesma conta.** Em **Perfil e segurança**, as duas sessões aparecem.
   "Encerrar outras sessões" no portal derruba o app na próxima ação.
2. **Abrir um chamado no app com foto anexada.** A equipe vê o anexo no portal e responde. A resposta aparece no
   app ao voltar para a tela (sem push no Expo Go Android).
3. **Agendar no app escolhendo o local.** A equipe confirma no portal. O app mostra "Confirmado" e o aviso
   aparece na central.
4. **Push real:** só com build EAS (`projectId`). Ver o runbook.
