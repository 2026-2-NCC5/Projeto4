# ADR-001 — Escolha do agente do MVP

- **Status:** Aceito
- **Data:** 2026-08-26 (registrado em código em 2026-09-16)
- **Origem:** [TASK-001](<../../../Entrega 1/Projeto Interdisciplinar - Inteligência Artificial/pipelines/TASK_001.md>)

## Contexto

O edital do projeto ASA sugeria três agentes candidatos: Monitoramento de Estudantes,
Pendências e Agente para o Estudante. A equipe possui quatro integrantes e um semestre.
Era necessário escolher exatamente um agente obrigatório para o MVP, com escopo
compatível com validação ponta a ponta (mobile → API → agente → banco).

## Decisão

Implementar exclusivamente o **Agente para o Estudante** como agente obrigatório do MVP.

- Usuário principal: o próprio estudante, via aplicativo Expo.
- Entradas: disciplinas, matrículas, avaliações, frequência e pendências (dados sintéticos).
- Saídas: situação identificada, resumo, recomendações com evidências e próxima ação,
  confiança, abstenção com motivo e indicação de validação humana.
- O agente é ferramenta de apoio à decisão: **nunca** reprova, altera matrícula, nota ou
  frequência, aplica sanções ou bloqueia o estudante (`FORBIDDEN_ACTIONS` em
  `src/Entrega 2/Backend/agent-service/app/agent/engine.py`).

## Alternativas descartadas

| Alternativa | Decisão | Motivo |
| --- | --- | --- |
| Agente de Monitoramento de Estudantes | Fora do escopo do MVP (evolução futura) | Exige perfis institucionais, autorização ampla e tratamento adicional de dados sensíveis. |
| Agente de Pendências | Não é agente independente | Pendências são uma **capacidade** do Agente para o Estudante (`pending_activity`). |

## Consequências

- Um único engine (`app/agent/`) com regras determinísticas e limiares configuráveis.
- Backlog do MVP não trata três agentes simultâneos.
- Perfis `institutional_staff` e `technical_admin` existem no modelo de dados, mas não
  possuem funcionalidades no MVP (recebem `403` nos recursos de estudante).
