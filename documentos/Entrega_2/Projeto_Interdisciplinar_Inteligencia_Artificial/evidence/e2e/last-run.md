# Evidência de execução E2E — ASA Conecta

Gerado automaticamente por `npm run test:e2e` (services/api) em 2026-09-17T04:20:34.771Z.
API 1.0.0 · Agent Service: http://127.0.0.1:8765

Todos os dados são sintéticos (student-demo-*). Nenhum dado pessoal real.

| Cenário | Estudante | HTTP | Resultado | Esperado | correlation_id | run_id | OK |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E2E-001 — Sucesso (SCENARIO-002 atividade pendente) | student-demo-001 | 201 | recommendation · 1 recomendação(ões) | recommendation · pending_activity | `corr-e2e-001` | `run-08740974869a` | ✅ |
| E2E-002 — Agent Service indisponível | student-demo-001 | 503 | DEPENDENCY_ERROR | 503 DEPENDENCY_ERROR | `corr-e2e-002` | — | ✅ |
| E2E-003 — Timeout do Agent Service | student-demo-001 | 504 | TIMEOUT em 378ms (timeout configurado 300ms) | 504 TIMEOUT | `corr-e2e-003` | — | ✅ |
| E2E-004 — Contrato incompatível (2.0) | student-demo-001 | 502 | CONTRACT_ERROR | 502 CONTRACT_ERROR | `corr-e2e-004` | — | ✅ |
| E2E-005 — Abstenção (SCENARIO-006 dados insuficientes) | student-demo-006 | 201 | abstained · Dados insuficientes para realizar uma análise confiável. | abstained | `corr-e2e-005` | `run-a9ae9395ba1a` | ✅ |
| E2E-006 — Validação humana (SCENARIO-008 frequência abaixo do mínimo) | student-demo-008 | 201 | recommendation · human_validation=true | recommendation · requires_human_validation=true | `corr-e2e-006` | `run-aa692a8a635b` | ✅ |
| SCENARIO-001 — Cenário controlado do agente | estudante.regular | 201 | no_action · [] | no_action · [] | `corr-e2e-scenario-001` | `run-7ae8b5b360e2` | ✅ |
| SCENARIO-003 — Cenário controlado do agente | estudante.frequencia | 201 | recommendation · [attendance_attention] | recommendation · [attendance_attention] | `corr-e2e-scenario-003` | `run-6acf95a4b872` | ✅ |
| SCENARIO-004 — Cenário controlado do agente | estudante.desempenho | 201 | recommendation · [performance_attention] | recommendation · [performance_attention] | `corr-e2e-scenario-004` | `run-b54a9a7db720` | ✅ |
| SCENARIO-005 — Cenário controlado do agente | estudante.multiplo | 201 | recommendation · [attendance_attention, pending_activity, performance_attention] | recommendation · [pending_activity, attendance_attention, performance_attention] | `corr-e2e-scenario-005` | `run-a2e2485b396c` | ✅ |
| SCENARIO-007 — Cenário controlado do agente | estudante.inconsistente | 201 | recommendation · [institutional_validation] | recommendation · [institutional_validation] | `corr-e2e-scenario-007` | `run-379234da4b42` | ✅ |
| E2E-008 — Acesso indevido | student-demo-002 → dados de student-demo-001 | 403 | 401 sem token · 403 FORBIDDEN | 401 · 403 FORBIDDEN | `corr-3390cda1-ec1a-448a-867a-6b880bd3abdb` | — | ✅ |

## Detalhes

### E2E-001 — Sucesso (SCENARIO-002 atividade pendente)

```json
{
  "summary": "Foi identificada uma situação que merece atenção.",
  "recommendations": [
    {
      "id": "rec-079f7e49067d",
      "type": "pending_activity",
      "message": "Existe uma atividade pendente que merece sua atenção.",
      "evidence": [
        "Foi identificada uma atividade pendente.",
        "Banco de Dados: Entrega do trabalho prático de Banco de Dados (prazo 2026-09-22, em 5 dias)."
      ],
      "nextAction": "Consultar os detalhes da atividade.",
      "confidence": 0.9,
      "requiresHumanValidation": false,
      "priority": 1,
      "subjectId": "subject-demo-002"
    }
  ],
  "confidence": 0.9,
  "agentVersion": "1.0.0",
  "configVersion": "1.0.0"
}
```

### E2E-002 — Agent Service indisponível

```json
{
  "error": {
    "code": "DEPENDENCY_ERROR",
    "message": "Não foi possível concluir a análise. Tente novamente.",
    "requestId": "req-6eb05bdb-5231-4ea2-9c93-961e8abda99b",
    "correlationId": "corr-e2e-002"
  }
}
```

### E2E-003 — Timeout do Agent Service

```json
{
  "error": {
    "code": "TIMEOUT",
    "message": "A análise está demorando mais que o esperado. Tente novamente.",
    "requestId": "req-c611d465-57b6-4fa9-87b0-1ba786d1b4ee",
    "correlationId": "corr-e2e-003"
  },
  "elapsedMs": 378
}
```

### E2E-004 — Contrato incompatível (2.0)

```json
{
  "error": {
    "code": "CONTRACT_ERROR",
    "message": "Versão de contrato incompatível: esperado 1.x, recebido 2.0.",
    "details": [
      {
        "field": "contract_version",
        "message": "esperado 1.x"
      }
    ],
    "requestId": "req-751f6cc5-a3a6-43e3-a2c2-d49d7c1a33e8",
    "correlationId": "corr-e2e-004"
  }
}
```

### E2E-005 — Abstenção (SCENARIO-006 dados insuficientes)

```json
{
  "data": {
    "runId": "run-a9ae9395ba1a",
    "agent": "student_agent",
    "version": "1.0.0",
    "configVersion": "1.0.0",
    "status": "abstained",
    "summary": "Não foi possível gerar uma recomendação confiável.",
    "recommendations": [],
    "confidence": null,
    "requiresHumanValidation": false,
    "abstained": true,
    "abstentionReason": "Dados insuficientes para realizar uma análise confiável.",
    "correlationId": "corr-e2e-005",
    "createdAt": "2026-09-17T04:20:34.137Z"
  }
}
```

### E2E-006 — Validação humana (SCENARIO-008 frequência abaixo do mínimo)

```json
{
  "data": {
    "runId": "run-aa692a8a635b",
    "agent": "student_agent",
    "version": "1.0.0",
    "configVersion": "1.0.0",
    "status": "recommendation",
    "summary": "Foi identificada uma situação que precisa de confirmação por uma pessoa responsável.",
    "recommendations": [
      {
        "id": "rec-53e91446ae5d",
        "type": "attendance_critical",
        "message": "Sua frequência em Banco de Dados está abaixo do mínimo institucional e precisa ser confirmada por uma pessoa responsável.",
        "evidence": [
          "Sua frequência registrada em Banco de Dados é de 65% (13 de 20 aulas).",
          "O mínimo institucional de referência é 75%."
        ],
        "nextAction": "Procure a coordenação para validar sua situação de frequência.",
        "confidence": 0.85,
        "requiresHumanValidation": true,
        "priority": 1,
        "subjectId": "subject-demo-002"
      }
    ],
    "confidence": 0.85,
    "requiresHumanValidation": true,
    "abstained": false,
    "abstentionReason": null,
    "correlationId": "corr-e2e-006",
    "createdAt": "2026-09-17T04:20:34.220Z"
  }
}
```

### SCENARIO-001 — Cenário controlado do agente

```json
{
  "summary": "Nenhuma situação que mereça atenção foi identificada nos dados disponíveis.",
  "recommendations": [],
  "requiresHumanValidation": false
}
```

### SCENARIO-003 — Cenário controlado do agente

```json
{
  "summary": "Foi identificada uma situação que merece atenção.",
  "recommendations": [
    {
      "id": "rec-9fd2813f602d",
      "type": "attendance_attention",
      "message": "Sua frequência em Computação em Nuvem atingiu um limiar de atenção.",
      "evidence": [
        "Sua frequência registrada em Computação em Nuvem é de 78% (14 de 18 aulas).",
        "O limiar de atenção configurado é 80%."
      ],
      "nextAction": "Confirme com o professor se os registros de presença estão atualizados e evite novas faltas.",
      "confidence": 0.85,
      "requiresHumanValidation": false,
      "priority": 2,
      "subjectId": "subject-demo-004"
    }
  ],
  "requiresHumanValidation": false
}
```

### SCENARIO-004 — Cenário controlado do agente

```json
{
  "summary": "Foi identificada uma situação que merece atenção.",
  "recommendations": [
    {
      "id": "rec-bfe9715d2398",
      "type": "performance_attention",
      "message": "Seu desempenho em Estruturas de Dados merece atenção.",
      "evidence": [
        "Sua média registrada em Estruturas de Dados é 4.5 de 10 considerando 2 avaliações.",
        "O limiar de atenção configurado é 6.0 de 10.",
        "Prova 1: 4 de 10.",
        "Lista avaliativa: 5 de 10."
      ],
      "nextAction": "Consultar os detalhes da avaliação e procurar o professor para orientações de estudo.",
      "confidence": 0.8,
      "requiresHumanValidation": false,
      "priority": 2,
      "subjectId": "subject-demo-005"
    }
  ],
  "requiresHumanValidation": false
}
```

### SCENARIO-005 — Cenário controlado do agente

```json
{
  "summary": "Foram identificadas 3 situações que merecem atenção.",
  "recommendations": [
    {
      "id": "rec-52b653b92bbf",
      "type": "pending_activity",
      "message": "Existem 2 atividades pendentes que merecem sua atenção.",
      "evidence": [
        "Foram identificadas 2 atividades pendentes.",
        "Computação em Nuvem: Questionário sobre containers (prazo 2026-09-16, vencido).",
        "Banco de Dados: Entrega do projeto de modelagem (prazo 2026-09-19, em 2 dias)."
      ],
      "nextAction": "Consultar os detalhes da atividade.",
      "confidence": 0.9,
      "requiresHumanValidation": false,
      "priority": 1,
      "subjectId": "subject-demo-004"
    },
    {
      "id": "rec-7a4c2c711f41",
      "type": "attendance_attention",
      "message": "Sua frequência em Computação em Nuvem atingiu um limiar de atenção.",
      "evidence": [
        "Sua frequência registrada em Computação em Nuvem é de 78% (14 de 18 aulas).",
        "O limiar de atenção configurado é 80%."
      ],
      "nextAction": "Confirme com o professor se os registros de presença estão atualizados e evite novas faltas.",
      "confidence": 0.85,
      "requiresHumanValidation": false,
      "priority": 2,
      "subjectId": "subject-demo-004"
    },
    {
      "id": "rec-22151b211de1",
      "type": "performance_attention",
      "message": "Seu desempenho em Banco de Dados merece atenção.",
      "evidence": [
        "Sua média registrada em Banco de Dados é 5.0 de 10 considerando 2 avaliações.",
        "O limiar de atenção configurado é 6.0 de 10.",
        "Prova 1: 4.5 de 10.",
        "Trabalho: 5.5 de 10."
      ],
      "nextAction": "Consultar os detalhes da avaliação e procurar o professor para orientações de estudo.",
      "confidence": 0.8,
      "requiresHumanValidation": false,
      "priority": 2,
      "subjectId": "subject-demo-002"
    }
  ],
  "requiresHumanValidation": false
}
```

### SCENARIO-007 — Cenário controlado do agente

```json
{
  "summary": "Foi identificada uma situação que precisa de confirmação por uma pessoa responsável.",
  "recommendations": [
    {
      "id": "rec-e3f56377841a",
      "type": "institutional_validation",
      "message": "A informação acadêmica disponível possui inconsistência e precisa ser confirmada.",
      "evidence": [
        "Os dados apresentados possuem inconsistência.",
        "A pendência 'Documento de matrícula pendente em Estruturas de Dados' referencia uma disciplina sem matrícula ativa.",
        "A avaliação 'Prova 2' de Inteligência Artificial possui nota registrada com data futura (2026-10-17)."
      ],
      "nextAction": "Entre em contato com a coordenação para validação.",
      "confidence": 0.75,
      "requiresHumanValidation": true,
      "priority": 1,
      "subjectId": null
    }
  ],
  "requiresHumanValidation": true
}
```

### E2E-008 — Acesso indevido

```json
{
  "anonymous": {
    "code": "UNAUTHORIZED",
    "message": "Token de acesso ausente.",
    "reason": "missing_token",
    "requestId": "req-b237f1d3-c55b-4bbd-9727-1143a9b10f4b",
    "correlationId": "corr-1c93d502-a8a2-49af-9016-9a302231a592"
  },
  "forbidden": {
    "code": "FORBIDDEN",
    "message": "Esta recomendação pertence a outro estudante.",
    "requestId": "req-9551c839-b0ef-4467-a6ec-bd6ab9223739",
    "correlationId": "corr-3390cda1-ec1a-448a-867a-6b880bd3abdb"
  }
}
```
