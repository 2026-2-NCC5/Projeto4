# TASK-001 — Seleção do Agente e Definição da Arquitetura Inicial

## 1. Decisão da TASK-001

**Agente escolhido:** `Agente para o Estudante`

O **Agente para o Estudante** será o único agente inteligente considerado como escopo obrigatório do MVP do projeto **ASA — Agentes Inteligentes para o Sucesso do Estudante**.

O agente será responsável por analisar informações acadêmicas disponibilizadas ao sistema e fornecer diretamente ao estudante:

* orientações acadêmicas;
* alertas;
* recomendações;
* evidências que justifiquem as recomendações;
* próximos passos sugeridos;
* indicação de situações que necessitem de validação humana.

O agente atuará exclusivamente como ferramenta de **apoio à decisão**.

Ele **não poderá executar automaticamente sanções, bloqueios, alterações de matrícula, reprovações, restrições ou qualquer outra decisão administrativa que possa afetar direitos do estudante**.

Quando identificar uma situação que exija intervenção institucional, o agente deverá:

1. informar o estudante sobre a situação identificada;
2. apresentar as evidências disponíveis;
3. recomendar uma próxima ação;
4. indicar a necessidade de validação humana quando aplicável.

---

## 2. Stack oficial do ASA

A arquitetura inicial do projeto será baseada na seguinte stack tecnológica:

```text
Mobile
└── Expo / React Native / TypeScript
    └── Execução e testes iniciais utilizando Expo Go

Backend
├── Node.js / TypeScript
│   ├── API/BFF consumida pelo aplicativo mobile
│   ├── autenticação
│   ├── gerenciamento de sessões
│   ├── regras de aplicação
│   └── integração e orquestração entre serviços
│
└── Python / FastAPI
    ├── Agente para o Estudante
    ├── processamento de dados
    ├── regras e recomendações
    ├── Pandas
    ├── NumPy
    └── scikit-learn, quando necessário

Banco de Dados
└── PostgreSQL

Infraestrutura
├── Docker
├── GitHub Actions
└── Um único provedor de cloud, quando aplicável
```

A utilização de **Node.js** e **Python** terá responsabilidades distintas.

O Node.js será responsável pela API principal consumida pelo aplicativo, enquanto o serviço Python ficará especializado no processamento relacionado ao agente inteligente.

Essa separação também atende ao requisito de manter o **componente Python do agente desacoplado da camada HTTP**.

---

## 3. Estrutura inicial do projeto

A estrutura inicial sugerida para o repositório é:

```text
apps/
└── mobile/                    # Expo / React Native / TypeScript
    ├── app/
    ├── components/
    ├── hooks/
    ├── services/
    ├── types/
    └── utils/

services/
├── api/                       # Node.js / TypeScript
│   ├── src/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── middlewares/
│   │   ├── config/
│   │   └── types/
│   └── package.json
│
└── agent-service/             # Python / FastAPI
    ├── app/
    │   ├── api/
    │   ├── agent/
    │   │   ├── engine.py
    │   │   ├── models.py
    │   │   ├── evaluator.py
    │   │   ├── abstention.py
    │   │   └── recommendations.py
    │   ├── config/
    │   ├── services/
    │   └── main.py
    ├── tests/
    └── requirements.txt

database/
├── migrations/
├── seeds/
└── documentation/

docs/
├── adr/
├── architecture/
├── requirements/
└── api/

.github/
└── workflows/
```

---

## 4. Separação entre agente e camada HTTP

O código responsável pela lógica do agente deverá permanecer independente do FastAPI.

O fluxo esperado será:

```text
HTTP Request
    ↓
FastAPI
    ↓
Application / Service Layer
    ↓
Agent Engine
    ↓
Dados necessários
    ↓
PostgreSQL / Serviços internos
    ↓
Resultado estruturado
    ↓
FastAPI
    ↓
HTTP Response
```

Por exemplo, o arquivo:

```text
services/agent-service/app/agent/engine.py
```

não deverá depender diretamente de:

* `Request`;
* `Response`;
* rotas HTTP;
* FastAPI;
* headers HTTP;
* autenticação HTTP.

A responsabilidade do `engine.py` será exclusivamente receber dados estruturados, executar as regras do agente e devolver um resultado estruturado.

Isso permitirá:

* testes unitários independentes;
* execução reproduzível;
* substituição futura da camada HTTP;
* melhor separação de responsabilidades;
* menor acoplamento;
* avaliação isolada do comportamento do agente.

---

# 5. ADR — Escolha do Agente

Para registrar formalmente a decisão arquitetural, deverá ser criado o arquivo:

```text
docs/adr/ADR-001-agent-selection.md
```

## Status

**Aceito**

## Decisão

Implementar exclusivamente o **Agente para o Estudante** como agente inteligente obrigatório no escopo do MVP.

Os demais agentes avaliados não serão tratados como funcionalidades obrigatórias simultâneas nesta etapa do projeto.

---

## 6. Alternativas avaliadas

### 6.1. Agente de Monitoramento de Estudantes

**Status:** descartado para o MVP.

Esse agente teria como foco principal o acompanhamento contínuo da situação acadêmica dos estudantes por professores, coordenação ou outros responsáveis institucionais.

Entre suas possíveis responsabilidades estariam:

* acompanhamento de desempenho;
* análise de frequência;
* identificação de estudantes em situação de risco;
* acompanhamento de evolução acadêmica;
* geração de alertas para responsáveis institucionais.

Apesar de ser uma possibilidade válida de evolução do ASA, sua implementação como agente principal aumentaria:

* o escopo institucional do projeto;
* a necessidade de diferentes perfis de acesso;
* os requisitos de autorização;
* a complexidade relacionada à privacidade;
* o tratamento de dados acadêmicos sensíveis;
* a necessidade de processos adicionais de validação humana.

Por esses motivos, não será implementado como agente obrigatório no MVP.

---

### 6.2. Agente de Pendências

**Status:** descartado como agente independente no MVP.

Esse agente teria como principal objetivo identificar pendências acadêmicas, como:

* atividades não entregues;
* avaliações;
* documentos;
* prazos;
* tarefas acadêmicas;
* outras obrigações relacionadas ao estudante.

A funcionalidade de identificação de pendências continua sendo relevante para o projeto.

Entretanto, ela poderá ser incorporada como uma **capacidade do Agente para o Estudante**, sem necessidade de criação de um segundo agente autônomo.

Dessa forma, o sistema poderá utilizar informações de pendências como evidência para gerar recomendações ao estudante.

---

### 6.3. Agente para o Estudante

**Status:** escolhido.

O Agente para o Estudante foi selecionado porque:

* está diretamente alinhado ao aplicativo mobile;
* possui o próprio estudante como usuário principal;
* entrega valor diretamente ao aluno;
* permite demonstrar o uso de Inteligência Artificial no PI;
* possui escopo compatível com uma equipe de quatro desenvolvedores;
* possibilita recomendações explicáveis;
* permite apresentar evidências para cada recomendação;
* permite implementar mecanismos de confiança e abstensão;
* pode utilizar informações de pendências como parte de suas análises;
* reduz a necessidade de funcionalidades administrativas no MVP;
* permite evolução futura para outros agentes especializados.

---

# 7. Usuário principal

O usuário principal do agente será o:

```text
Estudante
```

O estudante utilizará o aplicativo mobile para consultar informações acadêmicas e receber recomendações produzidas pelo agente.

---

# 8. Entradas do agente

O agente deverá receber informações acadêmicas estruturadas.

Uma entrada conceitual poderá seguir o seguinte formato:

```json
{
  "student_id": "student-demo-001",
  "academic_context": {
    "subjects": [],
    "pending_items": [],
    "attendance": [],
    "assessments": []
  }
}
```

As principais categorias de entrada previstas são:

* identificação interna do estudante;
* disciplinas;
* matrículas;
* avaliações;
* notas;
* frequência;
* pendências;
* atividades acadêmicas;
* informações necessárias para geração de recomendações.

Durante o desenvolvimento, demonstrações e testes deverão ser utilizados exclusivamente:

* dados fictícios;
* dados sintéticos;
* dados anonimizados.

Não deverão ser versionados dados acadêmicos reais ou informações pessoais de estudantes.

---

# 9. Saída do agente

A saída do agente deverá ser estruturada e possuir informações suficientes para permitir explicabilidade e rastreabilidade.

Exemplo:

```json
{
  "agent": "student_agent",
  "version": "1.0.0",
  "status": "recommendation",
  "summary": "Foram identificadas situações que merecem atenção.",
  "recommendations": [
    {
      "type": "academic_attention",
      "message": "Considere revisar as atividades pendentes da disciplina.",
      "evidence": [
        "Existem atividades sem registro de conclusão."
      ],
      "next_action": "Consultar a disciplina no aplicativo."
    }
  ],
  "confidence": 0.82,
  "requires_human_validation": false,
  "abstained": false,
  "abstention_reason": null
}
```

A resposta deverá possuir, quando aplicável:

* identificação do agente;
* versão do agente;
* versão das configurações utilizadas;
* status da execução;
* resumo;
* recomendações;
* evidências;
* próxima ação;
* métrica de confiança;
* indicação de validação humana;
* indicação de abstensão;
* motivo da abstensão.

---

# 10. Abstensão

O agente deverá possuir capacidade explícita de **abstenção**.

Quando os dados forem insuficientes ou quando não houver confiança adequada para gerar uma recomendação, o agente não deverá produzir uma orientação como se tivesse certeza.

Exemplo:

```json
{
  "agent": "student_agent",
  "version": "1.0.0",
  "status": "abstained",
  "recommendations": [],
  "confidence": 0.31,
  "requires_human_validation": true,
  "abstained": true,
  "abstention_reason": "Dados insuficientes para produzir uma recomendação confiável."
}
```

Entre as possíveis condições de abstensão estão:

* ausência de dados suficientes;
* informações inconsistentes;
* dados desatualizados;
* confiança abaixo do limiar configurado;
* situação não contemplada pelas regras atuais;
* possibilidade de impacto relevante sobre direitos do estudante;
* necessidade de avaliação institucional.

Os limiares utilizados deverão ser configuráveis e versionados, evitando valores críticos hardcoded no código-fonte.

---

# 11. Papel do Node.js e do Python

A utilização de duas tecnologias de backend terá responsabilidades claramente separadas.

## Node.js / TypeScript

O Node.js será responsável pela API principal do sistema.

Entre suas responsabilidades estão:

* comunicação com o aplicativo Expo;
* autenticação;
* autorização;
* gerenciamento de sessão;
* regras gerais da aplicação;
* acesso aos dados necessários;
* integração com PostgreSQL;
* comunicação com o serviço Python;
* composição das respostas para o aplicativo.

Fluxo simplificado:

```text
Expo
 ↓
Node.js API
 ↓
PostgreSQL
 ↓
Python Agent Service
```

---

## Python / FastAPI

O Python será responsável pelo serviço especializado do agente.

Entre suas responsabilidades estão:

* processamento de dados;
* avaliação das informações acadêmicas;
* aplicação das regras do agente;
* geração de recomendações;
* cálculo de métricas;
* produção de evidências;
* implementação da lógica de abstensão;
* futuras técnicas de Machine Learning, quando necessárias.

Fluxo:

```text
Node.js
   ↓
FastAPI
   ↓
Application Layer
   ↓
Agent Engine
```

Essa separação evita a implementação de duas APIs com exatamente as mesmas responsabilidades e fornece uma justificativa arquitetural clara para a utilização de Node.js e Python.

---

# 12. Endpoints iniciais

A API Node.js poderá disponibilizar endpoints como:

```text
GET  /api/student/me
GET  /api/student/subjects
GET  /api/student/pending-items
GET  /api/student/assessments
GET  /api/student/attendance

POST /api/agent/analyze
GET  /api/agent/recommendations
GET  /api/agent/recommendations/:id
```

Para comunicação interna entre o Node.js e o serviço Python, poderá existir um endpoint privado como:

```text
POST /internal/v1/student-agent/evaluate
```

Esse endpoint não deverá ser exposto diretamente ao aplicativo mobile.

Fluxo completo:

```text
Expo Go
   ↓
React Native / TypeScript
   ↓
Node.js API
   ↓
Python Agent Service
   ↓
Agent Engine
   ↓
Resultado
   ↓
Node.js API
   ↓
Expo
```

---

# 13. Banco de Dados — PostgreSQL

O PostgreSQL será utilizado como banco de dados relacional principal do sistema.

Uma estrutura inicial poderá incluir as seguintes entidades:

```text
users
students
subjects
enrollments
assessments
attendance
pending_items

agent_runs
agent_recommendations
agent_evidence
agent_feedback
```

---

## 13.1. Execuções do agente

Exemplo conceitual:

```text
agent_runs
────────────────────────────────
id
student_id
agent_version
config_version
status
confidence
abstained
abstention_reason
requires_human_validation
created_at
```

A tabela permitirá registrar cada execução do agente e fornecer rastreabilidade sobre:

* estudante analisado;
* versão utilizada;
* configuração utilizada;
* resultado;
* confiança;
* ocorrência de abstensão;
* necessidade de validação humana.

---

## 13.2. Recomendações

Exemplo:

```text
agent_recommendations
────────────────────────────────
id
agent_run_id
type
message
next_action
requires_human_validation
created_at
```

---

## 13.3. Evidências

Também deverá existir associação entre recomendações e evidências.

Exemplo:

```text
agent_evidence
────────────────────────────────
id
recommendation_id
evidence_type
description
source_reference
created_at
```

Essa estrutura permitirá apresentar ao estudante os motivos que contribuíram para determinada recomendação.

---

## 13.4. Feedback

Uma estrutura de feedback também poderá ser utilizada:

```text
agent_feedback
────────────────────────────────
id
recommendation_id
student_id
feedback_type
comment
created_at
```

Essa informação poderá ser utilizada posteriormente para avaliação da qualidade das recomendações.

---

# 14. Configuração e versionamento

Regras, pesos, limiares e configurações do agente deverão ser externalizados sempre que aplicável.

Exemplo:

```text
services/agent-service/app/config/
├── agent.yaml
├── thresholds.yaml
└── rules.yaml
```

Exemplo conceitual:

```yaml
agent:
  name: student_agent
  version: "1.0.0"

thresholds:
  minimum_confidence: 0.70

abstention:
  enabled: true
  insufficient_data: true
  require_human_validation_on_sensitive_cases: true
```

Isso evita hardcode desnecessário e permite identificar exatamente quais regras foram utilizadas em uma determinada execução.

---

# 15. Segurança e privacidade

O projeto deverá seguir, desde o início, algumas regras básicas de segurança.

Não deverão ser versionados:

```text
.env
tokens
passwords
API keys
credenciais de banco
dados pessoais reais
dados financeiros reais
dados acadêmicos reais
```

O repositório deverá conter apenas um arquivo de exemplo, quando necessário:

```text
.env.example
```

Sem credenciais reais.

---

# 16. Impacto da decisão no backlog

A partir desta ADR, o backlog do MVP deverá considerar como agente obrigatório somente:

```text
Agente para o Estudante
```

Os outros dois agentes não deverão aparecer como três implementações obrigatórias paralelas.

O tratamento recomendado será:

```text
Agente para o Estudante
└── Escopo obrigatório do MVP

Agente de Pendências
└── Não será um agente independente
    └── Pendências poderão ser utilizadas como dados/funcionalidades do Agente para o Estudante

Agente de Monitoramento de Estudantes
└── Fora do escopo obrigatório do MVP
    └── Possível evolução futura
```

---

# 17. Critérios de aceite da TASK-001

A TASK-001 será considerada concluída quando os seguintes critérios estiverem atendidos:

* [ ] ADR registra exatamente um agente escolhido.
* [ ] ADR registra as alternativas descartadas.
* [ ] O agente escolhido é o **Agente para o Estudante**.
* [ ] O usuário principal do agente está definido como estudante.
* [ ] As entradas do agente estão documentadas.
* [ ] As saídas do agente estão documentadas.
* [ ] Evidências e próxima ação estão previstas na resposta.
* [ ] Existe mecanismo documentado de abstensão.
* [ ] Situações relevantes podem ser encaminhadas para validação humana.
* [ ] O backlog não trata os três agentes como escopo obrigatório simultâneo.
* [ ] O Agente de Pendências não é tratado como segundo agente obrigatório do MVP.
* [ ] O Agente de Monitoramento de Estudantes está registrado como possível evolução futura.
* [ ] A separação entre Node.js, FastAPI e componente Python do agente está documentada.
* [ ] Configurações, regras e limiares relevantes poderão ser versionados.
* [ ] Nenhum dado pessoal ou acadêmico real será utilizado nos artefatos de teste versionados.

---

# 18. Resultado da decisão

Com esta definição, a arquitetura inicial do ASA fica estabelecida como:

```text
Frontend
Expo + React Native + TypeScript + Expo Go

Backend principal
Node.js + TypeScript

Serviço do agente
Python + FastAPI

Processamento de dados / IA
Python + Pandas + NumPy + scikit-learn, quando necessário

Banco de Dados
PostgreSQL

Infraestrutura
Docker + GitHub Actions + Cloud Provider

Agente obrigatório do MVP
Agente para o Estudante
```

A decisão mantém o escopo do projeto controlado, permite desenvolvimento incremental e estabelece uma base arquitetural para futuras evoluções do ASA sem exigir a implementação simultânea dos três agentes.

