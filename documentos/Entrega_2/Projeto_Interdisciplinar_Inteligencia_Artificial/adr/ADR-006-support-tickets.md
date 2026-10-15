# ADR-006 — Atendimento ASA: abertura e acompanhamento de chamados

- **Status:** aceito (2026-10-06)
- **Contexto da decisão:** pedido do estudante para que o contato com o ASA deixe de depender de mensagens
  soltas ("abrir → esperar sem informação → perguntar de novo") e passe a ser um chamado com protocolo,
  andamento visível, conversa, anexos, prazo, avisos e avaliação.

## Contexto

O app já tinha um BFF Node.js com repositórios (PostgreSQL e memória), contrato Mobile ↔ API versionado em três
cópias, navegação própria (reducer, sem react-navigation) e um design system em revisão visual. Não havia
backend de chamados, armazenamento de arquivos, infraestrutura de tempo real nem notificações no app. Durante a
implementação, outra frente (fila presencial do ASA) adicionou um serviço de push (Expo) com registro de
aparelhos.

## Decisões

1. **Contrato v1.3, aditivo.** Tipos `Support*` no fim de `mobile-api.v1.ts`, sincronizados nas três cópias.
   Rotas do estudante em `/api/support/*` (estudante sempre derivado da sessão; corpos estritos rejeitam
   `studentId`, `status`, `priority`) e rotas da equipe em `/api/support/staff/*` (`institutional_staff`,
   `technical_admin`). Chamado de outro estudante → `403`, como nas demais rotas da API.
2. **Situações técnicas, textos humanos.** 13 situações no servidor (`submitted` … `reopened`); o app mostra
   rótulos e explicações em português e agrupa em quatro etapas visíveis (recebido → triagem → análise →
   resolução). Rascunho existe só no aparelho.
3. **Histórico como auditoria.** `support_ticket_events` é somente-inserção (trigger bloqueia `UPDATE`, exceto
   anonimizar o autor quando a conta é removida). Cada evento guarda quem agiu (interno), o nome público
   (equipe), a situação anterior e a nova. Eventos `internal` (notas, prioridade) nunca saem nas rotas do
   estudante; mensagens da equipe aparecem com o nome da equipe, nunca com dados do atendente.
4. **Regras no servidor.** Permissões (`canReply`, `canCancel`, `canReopen`, `canRate`) e transições são
   decididas pela API: a equipe não define `waiting_student` nem `resolved` diretamente (exigem pedido de ação
   ou texto de solução); reabertura só a partir de `resolved` e por 7 dias; avaliação uma vez.
5. **Prazo (SLA) calculado, nunca inventado.** Dias úteis por categoria (catálogo versionado em
   `api/src/support/catalog.ts`), pausa enquanto aguarda o estudante (o prazo é estendido pelo tempo pausado),
   reinício na reabertura. A situação (`on_track` … `overdue`) é calculada a cada leitura. O app mostra
   "Previsão de resposta" e "Prazo estimado" sem contagem regressiva agressiva.
6. **Concorrência e duplicidade.** Abertura e mensagens têm chave de idempotência gerada no app
   (`clientRequestId`, `clientMessageId`); o chamado tem versão (`version`) e toda alteração é aplicada numa
   transação condicionada a ela (`409 ticket_changed` em corrida).
7. **Anexos no PostgreSQL, em duas fases.** O arquivo sobe assim que é escolhido (`POST /api/support/uploads`,
   base64, até 5 MB, tipo permitido conferido pela assinatura binária) e fica pendente por 24 h; a abertura ou
   a mensagem vinculam os ids na mesma transação. O download usa link assinado (HMAC com chave derivada do
   segredo do servidor, 5 minutos), que abre no navegador sem expor o token. `bytea` mantém o projeto
   autocontido; um bucket de objetos substituiria só o repositório.
8. **Avisos.** Cada mudança relevante grava um aviso em `support_notifications` (centro de avisos do app:
   Atendimento e "Avisos" de Serviços). Quando há aparelhos registrados, a mesma notificação sai por push pelo
   serviço de notificações da fila presencial (`category: 'support'`, chave de idempotência por versão do
   chamado); falha de push nunca afeta a requisição. Tocar na notificação abre o chamado
   (`features/support/push.ts`, inclusive no início a frio), sem reinstalar o handler global de exibição.
9. **Sem tempo real dedicado.** Não há WebSocket/SSE no projeto; o detalhe aberto atualiza a cada 30 s e a lista
   a cada 60 s, só com o app em primeiro plano, além de pull-to-refresh. Mudanças vindas do ASA com a tela
   aberta mostram "Chamado atualizado" e entram animadas na linha do tempo, sem recarregar a tela.
10. **Cache e offline.** Stale-while-revalidate por usuário (memória + AsyncStorage, só texto): a tela abre com
    a última versão conhecida e avisa quando está offline; o cache de outras contas é apagado ao entrar no
    Atendimento.
11. **Movimento.** O módulo usa Reanimated 4 (pedido explícito de `withTiming`/`withSpring`) por um vocabulário
    próprio (`features/support/motion.ts`: 150/220/320 ms, mola `damping 18 / stiffness 180`), sempre
    respeitando "Reduzir movimento" (sistema ou preferência). Nenhum loop infinito: o pulso da etapa atual faz
    três ciclos e para.
12. **Dependências novas (Expo SDK, funcionam no Expo Go):** `expo-document-picker` (escolher arquivos),
    `expo-file-system` (ler o arquivo em base64; já vinha como dependência do `expo`) e `expo-clipboard`
    ("Copiar protocolo").
13. **Modo demonstração.** `EXPO_PUBLIC_USE_MOCK_TICKETS=true` troca a API por dados fictícios centralizados
    (`features/support/api/mockSupportApi.ts`) com os mesmos contratos e regras; chamados novos avançam sozinhos
    (triagem, análise, mensagem do ASA, resolução) conforme o tempo passa, sem timers em segundo plano.

## Alternativas consideradas

- **Arquivos em disco ou bucket externo**: exigiria volume compartilhado ou credenciais de nuvem; adiado.
- **Multipart (`multer`)**: nova dependência no BFF e upload sem progresso no `fetch`; base64 em JSON com
  limite próprio (8 MB só nas rotas de envio) resolve para arquivos de até 5 MB.
- **Permissões calculadas no app**: duplicaria regras e permitiria divergência; o servidor decide.
- **WebSocket**: infraestrutura nova para um ganho pequeno no volume atual; polling controlado basta.

## Consequências

- Banco: migration `004_support_tickets.sql`; seed de chamados fictícios para todos os estudantes.
- Testes: API (17 unitários + 3 de integração com PostgreSQL) e app (34 entre lógica, telas e push, incluindo
  envio duplo, falhas, offline, atualização com a tela aberta, toque em notificação e "Reduzir movimento").
- Sem tela de equipe no app (é um app do estudante): a fila da equipe existe na API e pode ganhar um painel web.
- Push depende do registro de aparelho feito hoje pela tela da fila presencial; um opt-in próprio no
  Atendimento pode reaproveitar o mesmo registro.
