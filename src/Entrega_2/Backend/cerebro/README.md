# Cérebro do assistente ASA Conecta (vault do Obsidian)

Esta pasta é um **vault do Obsidian** com o conhecimento público da FECAP. O assistente do app e do portal
consulta estas notas (junto com os artigos publicados da Base de conhecimento) antes de responder: se a
informação não estiver aqui nem na base, ele diz que não encontrou e oferece falar com a equipe do ASA.

## Como abrir
Obsidian → *Open folder as vault* → `src/Entrega_2/Backend/cerebro`. O *Graph view* mostra as ligações.

## Como ensinar o assistente
1. Veja o que ele não soube responder: painel → **Cérebro do assistente** (ou `npm run brain:gaps` em
   `Backend/api`, que grava `00 Entrada/Perguntas sem resposta.md`).
2. Crie/complete a nota na pasta certa usando `Modelos/Nota do cérebro.md`. Só fatos de fonte oficial, com
   `source_url`. Use `## subtítulos` autoexplicativos (cada um vira um trecho de busca) e `aliases` com o
   jeito que o aluno pergunta ("onde fica a fecap", "horário da biblioteca").
3. Em `Backend/api`: `npm run brain:build` (compila em `src/brain/vault.generated.ts`) e `npm test`.
4. Commit + deploy da API. Marque a pergunta como respondida no painel.

Dúvida de procedimento do ASA (serviço da Cesta) que muda com frequência? Prefira um artigo na Base de
conhecimento do painel: ele vale na hora, sem deploy, e tem revisão/publicação.

## Sincronização automática com o site da FECAP
- **Na API (automático):** o job diário `fecap-site-sync` lê os sitemaps públicos de www.fecap.br, guarda as páginas
  novas/alteradas no banco e o assistente passa a usá-las no mesmo dia, sem deploy.
- **No vault (para ver no Obsidian):** `npm run brain:site` em `Backend/api` recria `Site da FECAP/` com a mesma
  leitura (páginas institucionais, cursos, biblioteca e notícias do último ano voltadas a estudantes). Depois
  `npm run brain:build` e `npm test`.

`Site da FECAP/` é 100% gerada: não edite à mão. Para corrigir ou detalhar um assunto, escreva uma nota curada nas
outras pastas: ela tem prioridade e a página correspondente deixa de ser duplicada.

## Regras
- Nada inventado: cada nota cita a página oficial de onde saiu (`source_url`, e `## Fontes` se houver mais).
- Sem nome, e-mail ou telefone de pessoas; só canais institucionais. Nada de dados de alunos.
- `00 Entrada/`, `Modelos/` e este README **não** entram no cérebro.
- Informação com data (calendário, inscrições) deve dizer a data/semestre a que se refere.

## Pastas
- `FECAP/` — instituição, campus, canais, ouvidoria, CPA, governança.
- `Graduação/` — cursos, formas de ingresso, bolsas e financiamento.
- `Vida acadêmica/` — biblioteca, calendário, provas, estágio, carreira, intercâmbio, pós.
- `Site da FECAP/` — gerada pela sincronização com o site (não editar).
