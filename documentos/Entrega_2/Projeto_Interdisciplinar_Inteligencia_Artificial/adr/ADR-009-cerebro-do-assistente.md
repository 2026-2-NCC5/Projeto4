# ADR-009 — Cérebro do assistente: IA generativa só com base oficial

- **Status:** aceito (2026-11-24)
- **Substitui em parte:** a decisão do README/ADR-005 de que "LLMs e RAG generativo não fazem parte do MVP".
  O provedor JEV ([JEV_INTEGRATION_ADR.md](JEV_INTEGRATION_ADR.md)) continua desligado.

## Contexto

O assistente respondia por regras e pela busca lexical nos artigos da Base de conhecimento (Cesta de Serviços
do ASA). Perguntas fora dos serviços do ASA — campus, cursos, ingresso, bolsas, biblioteca, calendário, pós —
ficavam sem resposta, e as respostas soavam mecânicas. A equipe pediu um assistente "mais inteligente e
completo", que aprenda com o uso, sem perder as garantias do MVP: nada inventado, fonte sempre conferível e
nenhum dado pessoal enviado para fora.

## Decisão

1. **Linguagem natural com Gemini, presa à base oficial.** A IA (`ai/gemini.ts`, `assistant/conversational.ts`)
   recebe a pergunta, até 6 turnos anteriores, a resposta já montada pelas regras e os trechos oficiais mais
   próximos. Prazos, valores, locais, canais e regras só podem vir desses trechos; sem base, ela diz que não
   encontrou e o app mantém o encaminhamento para a equipe. Consultas com dados acadêmicos pessoais, análises do
   Agente, fila e comandos **nunca** passam pela IA (`isConversationalEligible`).
2. **Cérebro = vault do Obsidian versionado** (`src/Entrega_2/Backend/cerebro/`). Notas Markdown com
   frontmatter (`title`, `aliases`, `tags`, `source_url`, `updated`) e links `[[...]]`. Três pastas curadas
   (FECAP, Graduação, Vida acadêmica), escritas só com páginas públicas de www.fecap.br, e uma pasta gerada
   (`Site da FECAP/`). `npm run brain:build` compila o vault em `api/src/brain/vault.generated.ts`; um teste
   falha se o arquivo estiver desatualizado. A busca é em memória (BM25 por seção, apelidos, sinônimos,
   cobertura dos termos e reforço pelas ligações entre notas), em poucos milissegundos.
3. **Atualização automática pelo site público.** O job diário `fecap-site-sync` (Vercel Cron, 07h UTC) lê os
   sitemaps oficiais e as páginas novas ou alteradas (até 150 por execução, com intervalo entre requisições),
   guarda o texto em `assistant_site_pages` (migration 018) e o cérebro passa a usá-las **sem novo deploy**.
   Página que saiu do site e notícia com mais de um ano deixam de valer. Notas curadas têm prioridade sobre as
   geradas (peso 0,85) e a página que já é fonte de uma nota curada não é duplicada. `npm run brain:site` faz a
   mesma leitura e grava no vault, para revisão no Obsidian.
4. **Aprendizado com revisão humana.** Resposta sem base oficial vira uma **lacuna** em
   `assistant_knowledge_gaps` (sem usuário, com números e e-mails mascarados, variações agrupadas). A equipe vê
   as lacunas no painel (**Cérebro do assistente**), escreve um artigo na Base de conhecimento (vale na hora) ou
   uma nota no cérebro e marca como respondida; se a dúvida voltar, reabre. O que o aluno diz nunca vira fato
   sozinho.
5. **Portal Educacional (TOTVS) fora do cérebro.** Conteúdo do portal autenticado não entra no cérebro: o vault
   é compartilhado por todos e o repositório é público, e o conector `fecap-collector` declara que não usa
   endpoints fora da interface nem envia dados sem autorização institucional. Dados pessoais continuam com o
   conector local de cada aluno; uma integração institucional exige autorização da TI da FECAP.

## Consequências

- Respostas completas e naturais (até ~180 palavras, com link oficial e data das notícias); a IA recebe a data
  de hoje para não apresentar prazo vencido como aberto.
- Notas do cérebro embasam a resposta, mas não aparecem como "Fonte" clicável (a fonte leva à página de ajuda,
  que só existe para artigos da Base de conhecimento).
- Sem `GEMINI_API_KEY` (ou com `ASSISTANT_LLM_ENABLED=false`) tudo volta a funcionar só por regras, e o cérebro
  não é consultado. `BRAIN_SITE_SYNC_ENABLED=false` desliga a leitura do site.
- Contrato 1.11 (só acréscimos): `GET /api/assistant-brain`, `PATCH /api/assistant-brain/gaps/:id`.
- Ordem de implantação: migration 018 → API → portal.
