# Relatório de implementação — fila presencial ASA

**Atualizado:** 01/11/2026
**Regra de dados:** a aplicação não serve filas sintéticas. Fixtures artificiais permanecem isoladas aos testes automatizados.

## Status

| Funcionalidade | Status | Evidência / implementação | Pendência |
|---|---|---|---|
| Auditoria da arquitetura | TESTADO | Mobile Expo/React Native, web React/Vite, API Express/TypeScript e PostgreSQL existentes | Homologação institucional |
| Consulta pública do painel | PARCIAL | [Painel oficial](https://presencial.fecap.br/) mostra modo somente leitura e aviso de falta de permissão; nenhuma senha atual foi legível | FECAP habilitar leitura/documentar API |
| Provider real FECAP | PARCIAL | Adapters Power Pages e HTML, cache/monitor, backoff, health e distribuição SSE já implementados; sem autorização ficam inativos | Permissão autorizada e validação com resposta atual |
| Proteção contra acesso negado | TESTADO | Parser trata aviso explícito de permissão em HTML/JSON como erro HTTP 403; não converte em fila vazia | Validar formato final no ambiente de homologação autorizado |
| Backend/API | IMPLEMENTADO | Rotas autenticadas de status, acompanhamento, preferências, cancelamento e SSE | Não há endpoint FECAP confirmado para titularidade |
| Acompanhamento no mobile | IMPLEMENTADO | Tela existente consome API ASA; removida interface de simulação; dados demonstrativos são suprimidos | Fonte real indisponível neste momento |
| Acompanhamento no web | IMPLEMENTADO | `/aluno/fila-presencial` consome o mesmo contrato, atualiza e sinaliza integração desativada | Fonte real indisponível neste momento |
| Vínculo de titularidade | BLOQUEADO | A página não expõe CPF/RA/titular e não há formato de QR verificável documentado | API/token de vinculação fornecido pela FECAP |
| Inscrição manual em senha pública | PARCIAL | Só aceita número encontrado em snapshot oficial recente; UI informa que isso não prova titularidade | Não equivale a vínculo individual oficial |
| Notificações/assistente | PARCIAL | Componentes usam estado da assinatura da conta ASA e dados da fonte | Dependem da fonte autorizada e não confirmam titularidade |
| Configuração real sem dados fictícios | TESTADO | Compose usa provider FECAP, scraping desligado sem autorização e seeds demo desligados por padrão | Configurar flags após autorização formal |
| Testes com dados reais | BLOQUEADO | Não executados; o painel desta consulta não permitiu ler registros | Homologação com acesso institucional autorizado |

## Rotas existentes

- `GET /api/queue/status`: snapshot da fila e acompanhamento da sessão ASA.
- `POST /api/queue/subscriptions`: acompanha uma senha observada no snapshot atual; não aceita `userId` do cliente.
- `GET/PATCH/DELETE /api/queue/subscriptions/current`: consulta, preferências e cancelamento.
- `GET /api/queue/stream`: eventos SSE autenticados.
- `GET /health/queue`: saúde da integração, sem dados de estudantes.

Os endpoints pertencem ao ASA Conecta. Não representam APIs confirmadas da FECAP/TOTVS.

## Configuração

`.env.example` e Docker selecionam `ASA_QUEUE_PROVIDER=fecap`. A fonte não é consultada enquanto `ASA_QUEUE_SOURCE_AUTHORIZED` e `ASA_QUEUE_ALLOW_PUBLIC_SCRAPING` não forem habilitados. Esses parâmetros não podem ser ativados para contornar a mensagem de permissão do painel; dependem de liberação institucional. Em caso de indisponibilidade, a interface informa o estado e não fabrica registros.

O Compose também mantém `DEMO_DATA_ENABLED=false`, `DEMO_SEED_ENABLED=false` e `ACADEMIC_DATA_PROVIDER=institutional` por padrão.

## Validação executada nesta alteração

- API: typecheck, lint e build passaram; suíte unitária completa passou (22 arquivos, 354 testes), incluindo parser, provider, monitor e API da fila.
- Mobile: typecheck passou, lint sem erros (10 avisos preexistentes em `types/api.ts`) e suíte completa passou (43 arquivos, 564 testes).
- Web: typecheck, lint, build e suíte completa passaram (53 arquivos, 279 testes), incluindo os 3 testes da tela de fila.
- Docker Compose: `docker compose config --quiet` passou.
- A consulta pública não retornou dados de senhas utilizáveis, então nenhum teste em produção ou com dados reais foi alegado.

## Arquivos alterados nesta revisão

- `src/Entrega_2/Backend/api/src/queue/fecapParser.ts`
- `src/Entrega_2/Backend/api/src/queue/providers/fecapHtmlProvider.ts`
- `src/Entrega_2/Backend/api/src/queue/providers/fecapPortalProvider.ts`
- `src/Entrega_2/Backend/api/src/queue/service.ts`
- `src/Entrega_2/Backend/api/src/queue/module.ts`
- testes unitários de parser e API da fila
- `src/Entrega_2/Frontend/features/queue/screens/QueueScreen.tsx`
- `src/Entrega_2/Frontend/__tests__/queueSourceLabel.test.tsx`
- `src/Entrega_2/Backend/.env.example`
- `src/Entrega_2/Backend/docker-compose.yml`
- este relatório e `fecap-queue-investigation.md`

## Próximos passos institucionais

1. Liberar leitura para a integração ou fornecer API/webhook oficial documentado.
2. Definir frequência permitida e um ambiente de homologação.
3. Fornecer mecanismo de prova de titularidade do atendimento (incluindo contrato do QR, se houver).
4. Validar tratamento, retenção e responsabilidades LGPD.
5. Habilitar os flags somente no ambiente aprovado e testar uma consulta real antes da produção.
