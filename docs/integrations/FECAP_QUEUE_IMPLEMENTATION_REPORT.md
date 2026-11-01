# Relatório de implementação — fila presencial ASA

Atualizado em 01/11/2026. A funcionalidade já existia no app mobile e no backend. Esta revisão adiciona o consumidor web, impede scraping sem opt-ins explícitos, desliga dados e seeds demonstrativos fora dos testes e documenta os limites observados na página pública.

## Status por capacidade

| Funcionalidade | Status | Implementação / evidência | Pendências e dependências |
|---|---|---|---|
| Auditoria da arquitetura | TESTADO | Mobile Expo/React Native, web React/Vite, API Express/TypeScript e PostgreSQL identificados no repositório | Revisão institucional antes da publicação |
| Inspeção do painel público | PARCIAL | GET da página retornou Power Pages com grades e colunas; sem consulta de registros | A chamada às grades não foi feita sem autorização; acesso e estado atual não confirmados |
| Parser do painel | TESTADO | Parser por nomes lógicos de coluna e fixtures cobrem posição, chamadas, mesa, data, zeros à esquerda e HTML sem dados | Validar em homologação com captura atual autorizada |
| Fonte real no backend | PARCIAL | Provider JSON do portal com fallback HTML já implementado; monitor central, cache, backoff, SSE e health check | Desligado até `ASA_QUEUE_SOURCE_AUTHORIZED=true` e `ASA_QUEUE_ALLOW_PUBLIC_SCRAPING=true` |
| Dados demonstrativos | TESTADO | Seeds e provider acadêmico demonstrativo ficam desligados por padrão; configuração explícita de demo/mock é recusada fora dos testes; telas ocultam snapshot de fila marcado como demo | Fixtures sintéticas existem somente na suíte automatizada |
| Acompanhamento mobile | IMPLEMENTADO | Tela existente com posição real do snapshot, chamadas, timeline, alertas locais/push e cancelamento | Número digitado só cria acompanhamento ASA; titularidade FECAP não verificada |
| Acompanhamento web | IMPLEMENTADO | `/aluno/fila-presencial`, menu do aluno e consumo das rotas existentes; atualiza a cada 15 s | Não há leitor QR porque o formato/prova institucional não foi confirmado |
| Vínculo titular verificado | BLOQUEADO | Nenhum CPF/RA/titular é exposto no painel inspecionado; não existe prova de QR documentada | API institucional ou código opaco verificável fornecido pela FECAP |
| Assistente ASA | PARCIAL | Contratos de intenção e serviço de status já existem no backend | Deve responder desconhecido quando dados estão desativados/indisponíveis; sem associação de titularidade |
| Notificações | IMPLEMENTADO / CONDICIONAL | Monitor processa marcos e envia somente para a conta ASA inscrita naquela senha | Push real depende de credenciais Expo e de fonte autorizada; não comprova titularidade |
| Segurança de ativação | TESTADO | Fonte real não consulta enquanto aprovação e opt-in de scraping estiverem falsos; intervalo padrão 30 s | Registrar autorização institucional no ambiente correto |

## Rotas existentes

- `GET /api/queue/status`: snapshot e acompanhamento da conta autenticada.
- `POST /api/queue/subscriptions`: registra uma senha para acompanhamento na conta autenticada; não aceita `userId`/`studentId` do cliente.
- `GET/PATCH/DELETE /api/queue/subscriptions/current`: consulta, preferências e encerramento.
- `GET /api/queue/stream`: eventos SSE autenticados.
- `GET /health/queue`: estado do monitor, sem dados de estudantes.

A interface web usa o mesmo contrato e rotas do app. Não foram criadas rotas oficiais presumidas na FECAP.

## Configuração

O app não apresenta dados simulados. Sem aprovação e opt-in, o provedor real fica desativado e a interface informa indisponibilidade. `mock` só é aceito no processo de testes. Para ativar leitura real após autorização institucional:

```env
ASA_QUEUE_ENABLED=true
ASA_QUEUE_PROVIDER=fecap
ASA_QUEUE_SOURCE_AUTHORIZED=true
ASA_QUEUE_ALLOW_PUBLIC_SCRAPING=true
ASA_QUEUE_SOURCE_URL=https://presencial.fecap.br/
ASA_QUEUE_POLL_INTERVAL_SECONDS=30
```

Essas variáveis são uma barreira técnica, não substituem aprovação institucional. A integração continua sem ser considerada homologada até validar uma consulta autorizada em ambiente de teste.

## Testes desta revisão

- API: typecheck e lint aprovados; 350 testes unitários aprovados.
- Web: typecheck, lint e build aprovados; 3 testes da tela de fila aprovados.
- Mobile: typecheck aprovado; lint sem erros (10 avisos preexistentes em `types/api.ts`); 6 testes da tela/indicador da fila aprovados. Os testes exibem avisos de mocks de `expo-notifications`, sem falha.
- Inspeção online: um `GET` da página pública respondeu 200 e confirmou os metadados das grades; não foi chamada a rota JSON das grades nem validada uma conta institucional.
- Não foram executados testes automatizados com dados de alunos reais. As fixtures são sintéticas e restritas aos testes; não provam que o scraper recebeu dados atuais da FECAP nesta execução.

## Arquivos principais

- API: `src/Entrega_2/Backend/api/src/queue/` e `src/Entrega_2/Backend/api/src/config/env.ts`.
- App: `src/Entrega_2/Frontend/features/queue/`.
- Web: `src/Entrega_2/Web/src/pages/student/QueuePage.tsx`, `src/Entrega_2/Web/src/services/api/queue.ts` e rotas/nav do aluno.
- Investigação: `docs/integrations/fecap-queue-investigation.md`.
