# Relatório de testes — plataforma web + app

- **Data:** 15/10/2026
- **Branch:** `feature/plataforma-web-integrada`. Alterações ainda não enviadas ao GitHub, por isso o workflow
  de CI não rodou remotamente; os mesmos comandos foram executados localmente.
- **Ambiente local:** Linux, Node.js 26.10 (o CI usa 20 para a API e o app e 24 para o portal), PostgreSQL 16.15
  (Docker), Python 3.13 (Agent Service), Playwright 1.63 (Chromium).

## Resultado

| Projeto | Verificação | Resultado |
|---|---|---|
| Contratos | `scripts/check-contracts-sync.sh` (canônico + 3 cópias) | ✅ idênticos |
| API (Node) | `eslint` / `tsc --noEmit` / `npm run build` | ✅ / ✅ / ✅ |
| API | Unitários (`test/unit`, repositórios em memória) | ✅ **317** testes em 18 arquivos |
| API | Integração com PostgreSQL real (`test/integration`) | ✅ **52** testes em 10 arquivos |
| API | E2E com o Agent Service real (`test/e2e`) | ✅ **19** testes em 3 arquivos |
| Agent Service (Python) | `pytest` / `ruff check` | ✅ **47** testes / sem avisos |
| Portal web | `tsc -b` / `eslint` / `vite build` | ✅ / ✅ / ✅ |
| Portal web | Vitest + Testing Library | ✅ **262** testes em 44 arquivos |
| Portal web | Playwright contra a pilha local (API :3000 + Vite :5173) | ✅ **10** testes (login dos 3 perfis, guardas e 403 da API, chamado entre canais, disputa de horário, agendamento entre canais) |
| Portal web | Playwright "demonstração desligada" (API :3001 com `DEMO_DATA_ENABLED=false` + portal :5174) | ✅ **2** testes |
| App (Expo) | `tsc` / `eslint` / Jest | ✅ / 0 erros (6 avisos de estilo na cópia do contrato) / **563** testes em 42 suítes |
| Docker | `docker compose build web` + teste de fumaça da imagem | ✅ 63 MB; SPA e rota de fallback, cabeçalhos de segurança, proxy `/api`, cache imutável de `/assets`, nenhuma violação de CSP no Chromium |

**Total automatizado:** 1.272 testes. Somente a API: 388 (317 + 52 + 19).

## Defeitos encontrados pelos testes (e corrigidos nesta entrega)

| Defeito | Como apareceu | Correção e prova |
|---|---|---|
| Duas reservas simultâneas do mesmo horário: a perdedora recebia **500** (impasse `40P01` entre as restrições de exclusão), não `409` | E2E Playwright (`appointments.spec.ts`) | Travas consultivas por atendente e por aluno, sempre na mesma ordem, mais repetição em caso de impasse. Teste de integração com **5** reservas simultâneas: um 201, quatro 409. Passou 3 vezes seguidas com outra suíte rodando em paralelo. |
| Artigo publicado saía da Central de ajuda e do assistente quando uma alteração ia para revisão | Agente do portal, em teste ao vivo | Leitura pública passou a usar a versão publicada sempre que ela existe e o artigo não está arquivado (`knowledge.integration.test.ts`) |
| Com a demonstração desligada, artigos fictícios e horários de atendentes fictícios ainda chegavam a contas reais | Revisão manual da política de demonstração | Filtros `is_demo` na leitura pública e na geração de horários (`demoOff.integration.test.ts`) |
| Sessões de contas fictícias abertas antes de desligar a demonstração continuavam válidas por até 15 min | Revisão manual | Sessões revogadas na subida da API (`admin.integration.test.ts`) |
| Duas abas renovando a sessão ao mesmo tempo: a aba "perdedora" mandava a pessoa para o login | Revisão do cliente web | O pedido original é repetido uma vez depois da renovação (`client.test.ts`) |
| Escritas da fila da equipe só exigiam permissão de leitura | Agente do portal | `tickets:manage` / `tickets:internal_note` exigidos no servidor (perfil "só leitura" recebe 403 em todas as escritas, `operations.test.ts`) |
| "Assumir" na mesma equipe avisava o aluno como se o chamado tivesse sido encaminhado; encaminhar tornava quem encaminhou o responsável | Agente do portal | Assumir é interno, salvo mudança de situação; encaminhar deixa o chamado sem atendente (`operations.test.ts`) |
| Cartão "Prazo próximo" do painel e a lista da fila contavam conjuntos diferentes | Agente do portal | Novo filtro `sla=near_deadline` (`admin.integration.test.ts`) |
| Meta de "primeira resposta" da administração era gravada e ignorada | Agente da administração | Prazo gravado na abertura (migration 011), situação no chamado, índice nas métricas (`admin.test.ts`, `admin.integration.test.ts`) |
| Reserva ignorava o local escolhido quando dois locais tinham o mesmo horário | Agente de agendamentos | `location` na reserva e na remarcação (`appointments.integration.test.ts`) |
| Mensagens de validação em inglês ("Too big…") | Agente da administração | Zod em pt-BR (`admin.test.ts`) |
| Servidor da API seguia "no ar" sem abrir a porta (Express 5 passa o erro ao callback do `listen`) | Processos antigos respondendo na porta 3000 | `server.ts` encerra o processo se a porta não abrir |

## O que não foi verificado automaticamente

- **CI no GitHub:** o workflow (`.github/workflows/ci.yml`, com os jobs novos `web` e `web-e2e`) não rodou
  remotamente, porque nada foi enviado. Os passos foram reproduzidos localmente, inclusive as duas instâncias da
  API do E2E.
- **App em aparelho físico:** fluxos cobertos por testes de tela e por um roteiro ao vivo contra a API (agentes do
  app). Não houve teste manual em celular. Push real exige build EAS.
- **Pilha completa pelo Compose:** a imagem do portal foi construída e testada isoladamente contra a API local. O
  `docker compose up` com todos os serviços juntos não foi executado nesta sessão.
- **Revisão adversarial por vários agentes:** foi planejada para todo o código novo, mas parou no limite de uso
  da sessão antes de produzir resultados. Ficou no lugar uma revisão manual focada (autorização, isolamento da
  demonstração, sessão web, concorrência). Ela encontrou e corrigiu os itens marcados "revisão" na tabela acima.
- **Acessibilidade:** verificada pelos agentes com axe e por inspeção (contraste AA, foco, rótulos). Não houve
  auditoria completa com leitor de tela.

## Como reproduzir

```bash
cd "src/Entrega_2/Backend"
docker compose up -d db mailpit
./scripts/check-contracts-sync.sh
( cd agent-service && .venv/bin/pytest -q && .venv/bin/ruff check . )
( cd api && npm run lint && npm run typecheck && npm run test:unit && npm run test:integration && npm run test:e2e && npm run build )
cd ../Web && npm run typecheck && npm run lint && npm test && npm run build
npx playwright test                       # com a API em :3000 e o Vite em :5173
cd ../Frontend && npm run typecheck && npm run lint && npx jest
```

Os testes de integração recriam o banco de **teste** (`TEST_DATABASE_URL`, nome com "test"). O banco de
desenvolvimento não é tocado.
