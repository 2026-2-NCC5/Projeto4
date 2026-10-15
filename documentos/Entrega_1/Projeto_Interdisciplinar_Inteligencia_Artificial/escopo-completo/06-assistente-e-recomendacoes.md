# Assistente Academico e Recomendacoes

## Papel do assistente

O assistente do ASA Conecta nao atua como chatbot generico. Ele foi desenhado como um agente academico focado em:

- resumir situacao;
- priorizar tarefas;
- explicar desempenho;
- orientar proximos passos;
- recusar acoes indevidas.

## Implementacao atual

O motor esta em `src/services/assistantEngine.ts`.

Ele funciona por reconhecimento de padroes textuais. A entrada do usuario e:

1. normalizada;
2. comparada com expressoes regulares;
3. convertida em uma resposta estruturada.

## Tipos de resposta

Cada resposta pode trazer:

- texto principal;
- evidencias;
- proxima acao;
- indicador de validacao humana.

## Casos cobertos

O motor responde de forma especifica para perguntas sobre:

- pendencias;
- prioridade;
- frequencia;
- faltas;
- notas;
- media;
- situacao geral;
- coordenacao;
- professor;
- divergencia de registro.

## Comportamento seguro

O motor se recusa a executar ou legitimar pedidos como:

- mudar nota;
- mudar frequencia;
- mudar matricula;
- confirmar alteracoes administrativas.

Nesses casos, a resposta:

- explica o limite;
- registra evidencia conceitual;
- orienta procurar validacao humana;
- marca `requiresHumanValidation = true`.

## Mensagem inicial

Ao abrir a tela, o usuario recebe uma saudacao personalizada com o primeiro nome e uma explicacao do que o assistente sabe fazer.

## Prompts rapidos

O app entrega quatro prompts prontos:

- `Como está minha situação?`
- `O que devo priorizar?`
- `Como está minha frequência?`
- `Explique minhas notas`

Isso acelera a demonstracao e reduz friccao de uso.

## Recomendacoes explicaveis

As recomendacoes vivem em `mockData.ts` e possuem a seguinte estrutura:

- `type`
- `title`
- `message`
- `evidence`
- `nextAction`
- `confidence`
- `requiresHumanValidation`
- `tone`

## Filosofia das recomendacoes

Cada orientacao precisa responder tres perguntas:

1. O que esta acontecendo?
2. Por que isso merece atencao?
3. O que o estudante deveria fazer agora?

## Exemplos de logica demonstrada

- prioridade para entrega proxima em disciplina com nota menor;
- alerta preventivo para frequencia baixa;
- reforco positivo quando desempenho e frequencia estao bons.

## Limite tecnico atual

As recomendacoes nao sao calculadas dinamicamente a partir do banco. Elas sao predefinidas no cenario demo.

## Caminho natural de evolucao

Para transformar o assistente em componente de producao, os proximos passos mais naturais seriam:

- ler dados academicos reais do banco;
- registrar execucoes em `agent_runs`;
- persistir recomendacoes e evidencias;
- coletar feedback do estudante;
- opcionalmente conectar um modelo generativo com guardrails.
