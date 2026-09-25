# Visao Geral do Sistema

## Nome do sistema

ASA Conecta

## Contexto

O projeto faz parte da iniciativa `ASA - Agentes Inteligentes para o Sucesso do Estudante`. A proposta do aplicativo e centralizar, em um ambiente mobile, a jornada academica do estudante com tres pilares:

- autenticacao institucional;
- acompanhamento academico;
- apoio a decisao por meio de assistente e recomendacoes explicaveis.

## Objetivo do produto

O app foi construido como um MVP demonstravel. Ele busca provar que um estudante pode:

- entrar com conta institucional;
- visualizar um panorama academico simples;
- identificar pendencias e pontos de atencao;
- receber orientacoes com justificativa;
- conversar com um assistente academico com respostas seguras.

## O que o sistema entrega hoje

### Funcionalidades reais

- Login com e-mail e senha via Supabase Auth
- Cadastro com Supabase Auth
- Recuperacao de senha por e-mail
- Persistencia de sessao no dispositivo
- Logout
- Consulta de cursos no Supabase, com fallback local

### Funcionalidades demonstrativas

- Resumo academico
- Lista de disciplinas
- Lista de pendencias
- Recomendacoes com evidencia, confianca e proxima acao
- Assistente conversacional academico

## Perfil principal atendido

- Estudante da FECAP

O frontend tambem reconhece e-mail institucional `@fecap.br`, mas o comportamento funcional do app atual continua centrado no perfil estudante.

## Proposta de valor

- Reduzir dispersao de informacao academica
- Destacar prioridades com clareza
- Explicar por que uma recomendacao foi emitida
- Manter limites de seguranca, sem alterar registros oficiais

## Escopo do MVP

O MVP separa claramente o que e real do que e demonstrativo:

- Real: identidade, sessao, cadastro e recuperacao de acesso
- Demo: notas, frequencia, pendencias e motor de analise academica

Essa separacao permite apresentar o conceito sem expor dados reais de estudantes.

## Diferencial do sistema

O principal diferencial nao e apenas exibir informacoes, mas transformar dados academicos em orientacao acionavel:

- o usuario recebe prioridade;
- entende a evidencia;
- ve a proxima acao sugerida;
- e alertado quando uma decisao precisa de validacao humana.

## Limite funcional deliberado

O sistema nao altera nota, frequencia, matricula ou qualquer registro oficial. Esse limite aparece:

- na logica do assistente;
- na tela de recomendacoes;
- no perfil;
- nas policies SQL do backend proposto.
