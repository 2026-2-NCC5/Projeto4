# Roteiro de demonstração (≈ 20 minutos)

Mostra a mesma plataforma pelos olhos do **aluno** (app e portal), da **equipe ASA** e da **administração**.
Tudo roda com dados **fictícios**: as telas mostram "DEMONSTRAÇÃO — Dados fictícios", e é bom dizer isso logo
no começo.

## Preparação (antes da apresentação)

```bash
cd "src/Entrega_2/Backend" && docker compose up -d --build     # banco, API, Agent Service, Mailpit e portal
# ou, em desenvolvimento: API (npm run dev em api/), portal (npm run dev em Web/) e app (npx expo start em Frontend/)
```

- **Portal:** http://localhost:8080 (Compose) ou http://localhost:5173 (desenvolvimento). **E-mails:**
  http://localhost:8025.
- **Contas (senha comum no README da raiz):**
  - aluno: `estudante.exemplo@demo.asa`;
  - equipe: `atendente.asa@demo.asa`;
  - administração: `admin.plataforma@demo.asa`.
- **Três janelas:** o celular com o app logado como aluno; uma janela do navegador como equipe; uma janela anônima
  como administração.
- **Limite de logins:** são 20 a cada 10 minutos por IP. Entre antes e não saia das contas durante a
  apresentação.

## 1. Aluno — portal e app com a mesma conta (5 min)

1. **Portal → Início** (`/aluno`): próximo agendamento, chamados em andamento, avisos e resumo acadêmico, com o
   selo de demonstração.
2. **Vida acadêmica → Agente para o Estudante → "Solicitar análise".** A recomendação vem com **evidências** e
   **próxima ação**. Marque "Esta recomendação ajudou você?". Fale: são regras explicáveis, não nota, e
   matrícula, notas e frequência continuam sob responsabilidade da instituição.
3. **Assistente ASA.**
   - Pergunte algo coberto pela Central de ajuda, por exemplo "Como peço segunda via do boleto?". A resposta
     cita a **fonte** (link para o artigo).
   - Pergunte algo próximo, mas sem resposta confiável. O assistente **se abstém** e oferece **"Abrir chamado
     com este resumo"**. Clique: o formulário chega pré-preenchido e nada é enviado sem confirmação.
   - Envie o chamado e anote o protocolo `ASA-2026-…`.
4. **No celular:** na área de atendimento do app, o mesmo chamado aparece com o mesmo protocolo. A central de
   avisos do app tem o aviso "Chamado recebido".

## 2. Equipe ASA — atendimento (6 min)

1. **Painel** (`/asa`): em aberto, aguardando a equipe, não lidas, prazo próximo e excedido. Os cartões levam à
   **Fila de chamados** filtrada.
2. Abra o chamado do passo 1.3.
   - **Assumir** fica só no histórico interno quando a situação não muda.
   - Mostre **"Primeira resposta"** no resumo (meta da categoria, em horas).
   - Escreva uma **nota interna** e diga que ela nunca aparece para o aluno.
   - **Responda** e use **"Pedir uma ação ao aluno"** (por exemplo, enviar um comprovante): o prazo **pausa**.
3. **No celular:** o aluno vê "Aguardando você", responde com uma foto, e o prazo **retoma**. No portal da
   equipe, a mensagem aparece em **Conversas → Não lidas**.
4. **Alunos atendidos:** abra o contexto do aluno. Fale: cada consulta fica na auditoria.
5. **Agenda do ASA:** confirme um agendamento (ver o passo 3).

## 3. Agendamento entre canais (3 min)

1. **Aluno (portal ou app) → Agendar atendimento:** assunto, modalidade, dia, horário (com o **local**) e
   observações. Na confirmação aparece o protocolo `AGD-2026-…` e o botão "Adicionar à agenda (.ics)".
2. **Equipe → Agenda do ASA → Confirmar.** O aluno recebe o aviso.
3. **Remarcar** pelo app. O agendamento antigo mostra "Remarcado para …" e o novo mostra "Ver o horário anterior".
4. Fale da garantia: duas pessoas no mesmo horário → só uma consegue, e a outra recebe "Esse horário não está
   mais disponível". Quem garante é o banco, e há um teste de concorrência com cinco reservas simultâneas.

## 4. Conhecimento, métricas e SLA (3 min)

1. **Equipe → Base de conhecimento:** edite um artigo publicado e envie para revisão. A versão publicada
   **continua no ar** até a nova ser publicada. Mostre o histórico de versões.
2. **Métricas e relatórios:** período de 30 dias, gráficos com **"Ver como tabela"**, origem dos dados.
   **Exportar CSV**: sem nome, e-mail nem RA, e a exportação é auditada.
3. **SLA:** listas "prazo próximo" e "excedido", primeira resposta no prazo e metas por categoria.

## 5. Administração (3 min)

1. **Visão geral:** contas, sessões ativas, chamados (só **metadados**), segurança (logins com falha e acessos
   negados) e integrações.
2. **Usuários e equipe → Convidar pessoa** com um e-mail `@fecap.br`. O convite chega no **Mailpit**. Mude o
   papel de alguém: as sessões dessa pessoa caem **na hora**. Tente se rebaixar: a plataforma não deixa, e
   também não deixa ficar sem nenhuma administração.
3. **SLA e categorias:** mude a meta de uma categoria. Um chamado novo já nasce com o prazo novo.
4. **Automações:** ligue "Avisar a equipe sobre novos chamados de Matrícula". Abra um chamado de Matrícula
   como aluno e veja o aviso para a equipe. As automações nunca escrevem para o aluno.
5. **Integrações:**
   - Agent Service operacional;
   - dados acadêmicos e fila presencial em **demonstração**;
   - **JEV e login institucional "Planejado"**, nunca apresentados como funcionando.
6. **Saúde dos serviços** (migrations em dia, versões) e **Auditoria** (filtros e resultado das ações).
7. **Permissões:** a matriz mostra que a administração não lê conteúdo de chamados.

## 6. Fechamento: honestidade dos dados (1 min)

- Com `DEMO_DATA_ENABLED=false`:
  - contas fictícias não entram;
  - artigos, horários e notas fictícios somem;
  - a área acadêmica mostra "aguardando integração" (503), em vez de inventar dados.
  - Há um teste automatizado para isso.
- **Próximos passos dependem da FECAP:**
  - integração autorizada com o Portal do Aluno/TOTVS;
  - contrato técnico do JEV;
  - SSO;
  - textos de privacidade.

## Se algo falhar ao vivo

| Sintoma | O que fazer |
|---|---|
| Login recusado por excesso de tentativas (429) | Limite de 20 logins a cada 10 min por IP: espere ou use outra rede. Por isso é bom entrar antes. |
| Agente "indisponível" | Agent Service fora do ar: `docker compose up -d agent-service`. A plataforma mostra o erro em vez de inventar uma recomendação. |
| E-mail de convite não chega | Confira o Mailpit (http://localhost:8025) e `MAIL_TRANSPORT=smtp`. Sem e-mail, o convite avisa que nada foi enviado. |
| Push não chega no celular | Esperado no Expo Go: os avisos ficam na central do app (push real exige build EAS). |
