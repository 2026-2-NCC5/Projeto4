# TASK-004 — Definição do Escopo MVP Comum

## 1. Definição da TASK-004

A **TASK-004** tem como objetivo definir formalmente o **escopo comum do MVP** do projeto:

```text
ASA — Agentes Inteligentes para o Sucesso do Estudante
```

O escopo definido nesta task estabelece quais funcionalidades, módulos, integrações e comportamentos deverão obrigatoriamente estar presentes na primeira versão funcional do sistema.

A TASK-004 deverá permanecer consistente com:

```text
TASK-001
Seleção do Agente e Definição da Arquitetura Inicial

TASK-002
Definição do Problema, Objetivo e Indicadores de Sucesso

TASK-003
Mapeamento de Usuários, Perfis e Jornada Principal
```

O objetivo não será definir todas as funcionalidades futuras do ASA.

O objetivo será determinar o menor conjunto integrado de funcionalidades capaz de demonstrar, de ponta a ponta, a proposta principal do projeto:

```text
Estudante
    ↓
Aplicativo mobile
    ↓
Dados acadêmicos
    ↓
Agente para o Estudante
    ↓
Análise
    ↓
Recomendação
    ↓
Evidências
    ↓
Próxima ação
```

---

# 2. Objetivo do MVP

O MVP do ASA deverá demonstrar que é possível:

> **Receber informações acadêmicas estruturadas de um estudante, processá-las por meio do Agente para o Estudante e apresentar, em uma aplicação mobile, recomendações explicáveis, evidências e próximos passos de forma segura e reproduzível.**

O MVP deverá funcionar como uma prova integrada do conceito definido nas tasks anteriores.

---

# 3. Princípio de escopo

O MVP será orientado pelo seguinte princípio:

```text
Implementar somente o necessário para comprovar
o fluxo principal do produto de ponta a ponta.
```

Uma funcionalidade será considerada obrigatória quando for necessária para demonstrar:

* a jornada principal do estudante;
* o funcionamento do agente;
* a integração entre os módulos;
* a geração de recomendações;
* a apresentação de evidências;
* a indicação de próxima ação;
* o comportamento de abstensão;
* a necessidade de validação humana;
* a rastreabilidade básica da execução.

Funcionalidades adicionais poderão ser desenvolvidas posteriormente, desde que não comprometam a entrega do núcleo obrigatório.

---

# 4. Agente obrigatório do MVP

Conforme definido na TASK-001, somente um agente será obrigatório no MVP:

```text
Agente para o Estudante
```

O agente deverá ser capaz de:

* receber contexto acadêmico estruturado;
* avaliar os dados fornecidos;
* identificar situações contempladas pelas regras do MVP;
* produzir recomendações;
* associar evidências às recomendações;
* sugerir uma próxima ação;
* indicar confiança quando aplicável;
* abster-se quando os dados forem insuficientes;
* indicar necessidade de validação humana.

Não será necessário implementar múltiplos agentes autônomos no MVP.

---

# 5. Usuário principal do MVP

O usuário principal continuará sendo:

```text
Estudante
```

O fluxo obrigatório do MVP será direcionado ao estudante.

Perfis institucionais poderão aparecer apenas como destinos de encaminhamento humano.

Não será obrigatório implementar:

* portal do professor;
* portal da coordenação;
* painel administrativo acadêmico;
* painel institucional completo;
* área financeira;
* sistema de gestão de matrícula.

---

# 6. Proposta central do MVP

A proposta mínima será:

```text
Dados acadêmicos
        ↓
ASA
        ↓
Análise
        ↓
Situação identificada
        ↓
Evidências
        ↓
Recomendação
        ↓
Próxima ação
```

Quando o agente não puder concluir uma análise:

```text
Dados insuficientes
        ↓
Abstenção
        ↓
Explicação
        ↓
Próxima ação segura
```

Quando houver situação institucional relevante:

```text
Situação sensível
        ↓
Agente identifica limite
        ↓
Validação humana necessária
        ↓
Estudante recebe orientação
```

---

# 7. Módulos obrigatórios do MVP

O MVP deverá possuir os seguintes módulos:

```text
1. Aplicativo Mobile
2. API principal
3. Serviço do Agente
4. Agent Engine
5. Persistência
6. Contratos compartilhados
7. Dados sintéticos de demonstração
8. Testes e evidências
```

Arquitetura:

```text
Expo / React Native
        ↓
Node.js API
        ↓
Python / FastAPI
        ↓
Agent Engine
        ↓
PostgreSQL
```

---

# 8. Módulo 1 — Aplicativo Mobile

O aplicativo deverá utilizar:

```text
Expo
React Native
TypeScript
```

O aplicativo será responsável pela experiência do estudante.

No escopo mínimo deverá existir uma jornada funcional envolvendo:

```text
Home
    ↓
Resumo acadêmico
    ↓
Recomendações
    ↓
Detalhes da recomendação
    ↓
Evidências
    ↓
Próxima ação
```

---

# 9. Funcionalidades obrigatórias do Mobile

O aplicativo deverá possuir, no mínimo:

* tela inicial;
* resumo acadêmico;
* consulta de recomendações;
* detalhamento de uma recomendação;
* apresentação das evidências;
* apresentação da próxima ação;
* estado de carregamento;
* estado vazio;
* estado de erro;
* tratamento de timeout;
* apresentação de abstensão;
* apresentação de necessidade de validação humana;
* navegação funcional entre as telas do fluxo principal.

---

# 10. Funcionalidades não obrigatórias no Mobile

Não serão obrigatórios para validação inicial do MVP:

* chat em tempo real;
* modo offline completo;
* notificações push;
* integração com calendário;
* upload de documentos;
* câmera;
* reconhecimento de imagem;
* entrada por voz;
* biometria;
* social login;
* temas personalizados;
* dashboards avançados;
* gamificação;
* ranking de estudantes;
* funcionalidades sociais;
* suporte a múltiplas instituições.

Esses recursos poderão ser considerados posteriormente.

---

# 11. Separação de responsabilidades no Mobile

O aplicativo deverá manter separadas as responsabilidades de:

```text
UI
Estado
Serviços
Tipos / Contratos
```

Estrutura conceitual:

```text
apps/mobile/
├── app/
├── components/
├── hooks/
├── services/
├── types/
└── utils/
```

Exemplo:

```text
Tela
 ↓
Hook / Estado
 ↓
Service
 ↓
API Client
 ↓
Backend
```

A UI não deverá conter lógica complexa de integração diretamente.

---

# 12. Módulo 2 — API principal

A API principal deverá utilizar:

```text
Node.js
TypeScript
```

Sua responsabilidade será atuar como camada principal de integração do aplicativo.

Ela será responsável por:

* receber requisições do aplicativo;
* validar autenticação;
* validar autorização;
* acessar dados necessários;
* consultar PostgreSQL;
* montar contexto para o agente;
* chamar o serviço Python;
* tratar falhas de dependências;
* propagar informações relevantes;
* retornar um contrato consistente para o aplicativo.

---

# 13. Endpoints mínimos previstos

O MVP poderá possuir endpoints semelhantes a:

```text
GET /api/student/me

GET /api/student/summary

GET /api/student/pending-items

POST /api/agent/analyze

GET /api/agent/recommendations

GET /api/agent/recommendations/:id
```

O conjunto definitivo deverá refletir a implementação real.

Endpoints que não forem utilizados pelo MVP não precisarão ser implementados apenas para completar uma lista teórica.

---

# 14. Módulo 3 — Serviço do Agente

O serviço especializado do agente deverá utilizar:

```text
Python
FastAPI
Pydantic
```

Sua responsabilidade será receber uma solicitação estruturada da API Node.js e executar a lógica de análise por meio do Agent Engine.

Fluxo:

```text
Node.js API
     ↓
FastAPI
     ↓
Application Layer
     ↓
Agent Engine
     ↓
Resultado estruturado
```

---

# 15. Endpoint interno do agente

A comunicação interna poderá utilizar um endpoint como:

```text
POST /internal/v1/student-agent/evaluate
```

Esse endpoint deverá ser tratado como integração interna.

Ele não deverá ser consumido diretamente pelo aplicativo mobile.

---

# 16. Módulo 4 — Agent Engine

O Agent Engine será responsável pela lógica principal do Agente para o Estudante.

Ele deverá permanecer desacoplado da camada HTTP.

Estrutura conceitual:

```text
services/agent-service/app/agent/
├── engine.py
├── evaluator.py
├── recommendations.py
├── abstention.py
└── models.py
```

O Agent Engine deverá receber dados estruturados e retornar dados estruturados.

Não deverá depender diretamente de:

* objetos `Request`;
* objetos `Response`;
* headers HTTP;
* FastAPI;
* rotas;
* cookies;
* detalhes do protocolo HTTP.

---

# 17. Capacidades mínimas do Agent Engine

O Agent Engine deverá possuir, no mínimo:

```text
Entrada estruturada
        ↓
Validação
        ↓
Avaliação
        ↓
Regras
        ↓
Recomendação
        ↓
Evidências
        ↓
Próxima ação
        ↓
Confiança
        ↓
Abstenção / Validação humana
```

---

# 18. Módulo 5 — Persistência

O PostgreSQL será o banco de dados principal do ASA.

O MVP deverá persistir apenas o necessário para sustentar o fluxo principal e a rastreabilidade.

Entidades iniciais poderão incluir:

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
```

A estrutura definitiva dependerá das migrations implementadas.

---

# 19. Persistência mínima do agente

Cada execução relevante do agente deverá possuir informações suficientes para identificar:

```text
run_id
student_id
agent_version
config_version
status
confidence
abstained
requires_human_validation
created_at
```

A persistência deverá permitir associar:

```text
Agent Run
    ↓
Recommendations
    ↓
Evidence
```

---

# 20. Escopo mínimo de dados acadêmicos

O MVP não precisará reproduzir integralmente o banco de uma instituição.

O contexto acadêmico necessário poderá considerar:

```text
students
subjects
assessments
attendance
pending_items
```

Essas informações deverão ser suficientes para permitir os cenários inicialmente definidos.

---

# 21. Dados utilizados no MVP

Durante desenvolvimento, testes e demonstração deverão ser utilizados:

```text
Dados fictícios
Dados sintéticos
Dados anonimizados, quando aplicável
```

Não deverão ser versionados:

```text
Dados acadêmicos reais
Dados pessoais reais
Dados financeiros reais
```

Exemplo aceitável:

```json
{
  "student_id": "student-demo-001",
  "name": "Estudante Exemplo"
}
```

---

# 22. Contratos explícitos entre módulos

Toda integração entre os principais módulos deverá utilizar contratos explícitos.

Não deverá haver dependência implícita em formatos de dados não documentados.

Os principais contratos serão:

```text
Mobile
    ↕
Node.js API

Node.js API
    ↕
Python Agent Service

Agent Service
    ↕
Agent Engine

Serviços
    ↕
PostgreSQL
```

Os contratos deverão possuir tipos ou schemas correspondentes.

---

# 23. Contrato Mobile ↔ Node.js

A resposta destinada ao mobile deverá possuir um formato previsível.

Exemplo:

```ts
export type AgentRecommendation = {
  id: string;
  type: string;
  message: string;
  evidence: string[];
  nextAction: string | null;
  confidence: number | null;
  requiresHumanValidation: boolean;
};
```

E:

```ts
export type AgentAnalysis = {
  runId: string;
  agent: "student_agent";
  version: string;
  status: "recommendation" | "no_action" | "abstained";
  summary: string;
  recommendations: AgentRecommendation[];
  confidence: number | null;
  requiresHumanValidation: boolean;
  abstained: boolean;
  abstentionReason: string | null;
};
```

---

# 24. Contrato Node.js ↔ Python

A requisição interna deverá transportar apenas os dados necessários.

Exemplo conceitual:

```json
{
  "contract_version": "1.0",
  "request_id": "req-demo-001",
  "correlation_id": "corr-demo-001",
  "student_id": "student-demo-001",
  "academic_context": {
    "subjects": [],
    "pending_items": [],
    "attendance": [],
    "assessments": []
  }
}
```

Resposta:

```json
{
  "contract_version": "1.0",
  "request_id": "req-demo-001",
  "correlation_id": "corr-demo-001",
  "agent": "student_agent",
  "agent_version": "1.0.0",
  "status": "recommendation",
  "summary": "Foram identificadas situações que merecem atenção.",
  "recommendations": [],
  "confidence": 0.82,
  "requires_human_validation": false,
  "abstained": false,
  "abstention_reason": null
}
```

---

# 25. Versionamento de contratos

Os contratos entre módulos deverão possuir identificação de versão quando necessário.

Exemplo:

```text
contract_version: 1.0
```

Isso permitirá distinguir mudanças compatíveis e incompatíveis.

Quando houver alteração incompatível:

```text
1.x
 ↓
2.0
```

o consumidor deverá ser atualizado de maneira coordenada.

---

# 26. Validação de contrato

No Node.js, as respostas recebidas de dependências deverão ser validadas antes de serem utilizadas.

No Python, Pydantic deverá validar os contratos recebidos pelo serviço.

Exemplo conceitual:

```python
class StudentAgentRequest(BaseModel):
    contract_version: str
    request_id: str
    correlation_id: str
    student_id: str
    academic_context: AcademicContext
```

Dados incompatíveis não deverão ser tratados silenciosamente como válidos.

---

# 27. IDs de requisição e correlação

As chamadas relevantes entre serviços deverão utilizar identificadores que permitam correlacionar uma execução.

Os identificadores previstos serão:

```text
request_id
correlation_id
run_id
```

---

# 28. Request ID

O `request_id` identifica uma requisição específica.

Exemplo:

```text
req-5fe9eab8
```

Uma nova tentativa poderá possuir outro `request_id`.

---

# 29. Correlation ID

O `correlation_id` deverá identificar o fluxo lógico completo entre os módulos.

Exemplo:

```text
corr-8e01a317
```

Fluxo:

```text
Mobile
   ↓
Node.js
   ↓
FastAPI
   ↓
Agent Engine
```

Os serviços deverão preservar o mesmo `correlation_id` quando estiverem processando o mesmo fluxo lógico.

---

# 30. Run ID

O `run_id` identificará uma execução do agente.

Exemplo:

```text
run-b8192a41
```

Ele poderá ser utilizado para:

* rastreabilidade;
* consulta de resultados;
* associação com recomendações;
* associação com evidências;
* testes;
* investigação de falhas.

---

# 31. Fluxo de IDs

Exemplo:

```text
correlation_id
corr-001
   │
   ├── request_id: req-mobile-001
   │
   ├── request_id: req-agent-001
   │
   └── run_id: run-agent-001
```

A intenção não será expor detalhes internos desnecessários para o estudante, mas permitir rastreabilidade técnica.

---

# 32. Autenticação

A autenticação será responsabilidade da camada principal da aplicação.

Fluxo:

```text
Mobile
   ↓
Autenticação
   ↓
Node.js API
```

O serviço interno do agente não deverá implementar uma autenticação independente destinada ao usuário final.

---

# 33. Propagação de identidade

A API deverá fornecer ao serviço interno apenas o contexto necessário.

A identidade do estudante deverá ser derivada de uma sessão ou token previamente validado.

O aplicativo não deverá conseguir alterar arbitrariamente:

```text
student_id
```

para consultar informações pertencentes a outro estudante.

---

# 34. Autorização

A API Node.js deverá validar se o usuário autenticado possui autorização para acessar os recursos solicitados.

Regra central:

```text
Estudante autenticado
        ↓
Pode consultar seus próprios dados
        ↓
Não pode consultar dados de outro estudante
```

---

# 35. Propagação de erros

Os módulos não deverão mascarar falhas críticas como se a operação tivesse funcionado corretamente.

Exemplo inadequado:

```text
Agent Service indisponível
        ↓
Node.js retorna recomendação vazia com HTTP 200
```

Isso faria uma falha técnica parecer ausência legítima de recomendações.

---

# 36. Classificação mínima de resultados

A integração deverá diferenciar:

```text
SUCESSO

Operação realizada corretamente.
```

```text
EMPTY

Operação válida, porém sem itens.
```

```text
ABSTAINED

Agente executado corretamente e decidiu não recomendar.
```

```text
VALIDATION ERROR

Contrato ou dados inválidos.
```

```text
DEPENDENCY ERROR

Dependência externa ou interna falhou.
```

```text
TIMEOUT

Dependência não respondeu no prazo.
```

```text
UNAUTHORIZED

Usuário não autenticado.
```

```text
FORBIDDEN

Usuário autenticado sem autorização.
```

---

# 37. Timeout

Chamadas entre módulos deverão possuir timeout configurável.

Fluxo:

```text
Node.js
   ↓
Agent Service
   ↓
Tempo limite excedido
   ↓
Timeout controlado
   ↓
Resposta apropriada ao mobile
```

O sistema não deverá aguardar indefinidamente.

---

# 38. Configuração de timeout

Os valores de timeout não deverão estar espalhados pela UI ou hardcoded em múltiplos componentes.

Exemplo conceitual:

```text
config/
└── services.ts
```

ou:

```text
AGENT_SERVICE_TIMEOUT_MS
```

A variável poderá vir de configuração de ambiente quando apropriado.

O valor sensível não deverá ser versionado quando aplicável.

---

# 39. Mapeamento de erro para o Mobile

O aplicativo não precisa conhecer todos os detalhes internos.

Exemplo:

```text
Agent Service timeout
        ↓
Node.js identifica timeout
        ↓
Retorna erro controlado
        ↓
Mobile apresenta:
"A análise está demorando mais que o esperado."
```

Detalhes técnicos poderão permanecer nos logs internos sanitizados.

---

# 40. Cenário de sucesso obrigatório

O MVP deverá possuir pelo menos um cenário completo de sucesso executável de ponta a ponta.

Exemplo:

```text
SCENARIO-E2E-001
Estudante possui atividade pendente
```

Fluxo:

```text
Mobile
   ↓
Solicita análise
   ↓
Node.js valida usuário
   ↓
Carrega dados sintéticos
   ↓
Envia contexto ao Agent Service
   ↓
Agent Engine identifica pendência
   ↓
Produz recomendação
   ↓
Node.js retorna resultado
   ↓
Mobile apresenta recomendação
   ↓
Estudante visualiza evidência
   ↓
Estudante visualiza próxima ação
```

---

# 41. Dados do cenário de sucesso

Entrada:

```json
{
  "student_id": "student-demo-001",
  "academic_context": {
    "pending_items": [
      {
        "id": "pending-demo-001",
        "subject_id": "subject-demo-001",
        "type": "assignment",
        "status": "pending"
      }
    ],
    "attendance": [],
    "assessments": []
  }
}
```

Resultado esperado:

```json
{
  "status": "recommendation",
  "recommendations": [
    {
      "type": "pending_activity",
      "evidence": [
        "Foi identificada uma atividade pendente."
      ],
      "next_action": "Consultar os detalhes da atividade."
    }
  ],
  "abstained": false,
  "requires_human_validation": false
}
```

---

# 42. Critérios do cenário de sucesso

O cenário será considerado válido quando:

* o aplicativo iniciar sem crash;
* o usuário fictício acessar o fluxo;
* a requisição chegar à API;
* a API chamar o Agent Service;
* o Agent Engine produzir resultado;
* o resultado retornar ao aplicativo;
* a recomendação aparecer;
* a evidência aparecer;
* a próxima ação aparecer;
* o `correlation_id` permitir acompanhar a execução;
* nenhum dado real estiver presente.

---

# 43. Cenário de falha de dependência

O MVP deverá possuir pelo menos um teste de falha relevante.

Cenário:

```text
SCENARIO-E2E-002
Agent Service indisponível
```

Fluxo:

```text
Mobile
   ↓
Node.js
   ↓
Agent Service indisponível
   ↓
Dependency Error
   ↓
Node.js propaga falha controlada
   ↓
Mobile apresenta estado de erro
```

Resultado esperado:

```text
Não foi possível concluir a análise.

Tente novamente.
```

---

# 44. Comportamento proibido em falha de dependência

O sistema não deverá transformar:

```text
Agent Service indisponível
```

em:

```text
Nenhuma recomendação encontrada.
```

Essas situações são semanticamente diferentes.

---

# 45. Cenário de timeout

Outro cenário relevante será:

```text
SCENARIO-E2E-003
Agent Service ultrapassa o timeout
```

Resultado esperado:

```text
A análise está demorando mais que o esperado.

Tente novamente.
```

O estado de loading deverá ser encerrado.

---

# 46. Cenário de incompatibilidade de contrato

Também deverá existir um cenário de incompatibilidade.

Exemplo:

```text
SCENARIO-E2E-004
Agent Service retorna contrato incompatível
```

Resposta inválida:

```json
{
  "contract_version": "2.0",
  "unexpected_field": true
}
```

quando o consumidor suporta apenas:

```text
contract_version = 1.x
```

Resultado esperado:

```text
Contrato rejeitado
        ↓
Erro registrado
        ↓
Resposta controlada ao consumidor
```

---

# 47. Comportamento esperado para contrato incompatível

O sistema não deverá:

* ignorar campos obrigatórios ausentes;
* assumir valores arbitrários;
* produzir recomendação baseada em resposta inválida;
* mascarar a incompatibilidade.

Deverá existir falha controlada.

---

# 48. Cenário de abstensão

O MVP deverá possuir pelo menos um cenário funcional de abstensão.

Exemplo:

```text
SCENARIO-E2E-005
Dados acadêmicos insuficientes
```

Entrada:

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

Resposta:

```json
{
  "status": "abstained",
  "recommendations": [],
  "abstained": true,
  "abstention_reason": "Dados insuficientes para realizar uma análise confiável.",
  "requires_human_validation": false
}
```

---

# 49. Abstensão não é erro

O fluxo deverá diferenciar:

```text
Abstenção
```

de:

```text
Erro técnico
```

A abstensão representa uma execução válida.

O agente analisou o contexto e decidiu não gerar uma recomendação.

---

# 50. Cenário de validação humana

O MVP deverá permitir demonstrar uma situação em que:

```text
requires_human_validation = true
```

Exemplo:

```json
{
  "status": "recommendation",
  "summary": "Foi identificada uma situação que precisa de confirmação.",
  "recommendations": [
    {
      "type": "institutional_validation",
      "message": "A informação disponível precisa ser confirmada.",
      "evidence": [
        "Os dados apresentados possuem inconsistência."
      ],
      "next_action": "Entre em contato com a coordenação.",
      "requires_human_validation": true
    }
  ]
}
```

---

# 51. Limite do agente

Mesmo quando existir alta confiança, o agente não poderá executar:

```text
Alteração de matrícula
Reprovação
Alteração de nota
Alteração de frequência
Bloqueio
Sanção
Restrição acadêmica
```

Essas operações permanecem fora do escopo do agente.

---

# 52. Funcionalidades obrigatórias do MVP

O escopo obrigatório será:

```text
Aplicativo mobile Expo
        +
Resumo acadêmico
        +
Recomendações
        +
Evidências
        +
Próxima ação
        +
Node.js API
        +
Python Agent Service
        +
Agent Engine desacoplado
        +
PostgreSQL
        +
Contratos explícitos
        +
IDs de correlação
        +
Tratamento de erros
        +
Timeout
        +
Abstenção
        +
Validação humana
        +
Dados sintéticos
        +
Teste reproduzível
```

---

# 53. Funcionalidades desejáveis, mas não bloqueantes

Se houver capacidade durante o desenvolvimento, poderão ser adicionadas:

* feedback sobre recomendação;
* histórico de recomendações;
* filtros;
* indicadores visuais adicionais;
* cache;
* refinamentos de UX;
* dashboards simples;
* notificações locais.

Essas funcionalidades não deverão comprometer a entrega do escopo obrigatório.

---

# 54. Funcionalidades fora do escopo do MVP

Estão explicitamente fora do escopo obrigatório:

```text
Agente de Monitoramento de Estudantes independente

Agente de Pendências independente

Portal completo para professores

Portal completo para coordenação

Integração com ERP acadêmico real

Integração com dados reais de universidade

Alterações automáticas de matrícula

Alterações automáticas de notas

Sanções automáticas

Reprovação automática

Sistema financeiro

Pagamentos

Chat em tempo real obrigatório

Machine Learning complexo obrigatório

LLM obrigatório

Reconhecimento de imagem

Entrada por voz

Integração com câmera

Suporte multi-instituição

Aplicação web administrativa completa
```

---

# 55. Machine Learning no MVP

O MVP não dependerá obrigatoriamente de Machine Learning.

O uso de:

```text
Pandas
NumPy
scikit-learn
```

será realizado apenas quando fornecer valor claro para os cenários definidos.

Inicialmente, o agente poderá utilizar:

```text
Regras versionadas
        +
Lógica determinística
        +
Limiares configuráveis
```

Isso permite maior:

* explicabilidade;
* previsibilidade;
* testabilidade;
* reprodutibilidade.

---

# 56. LLM no MVP

O uso de um Large Language Model não será condição obrigatória para a validação do MVP.

Caso seja utilizado futuramente, não deverá ser responsável isoladamente por decisões relevantes.

O comportamento crítico deverá permanecer:

* verificável;
* controlável;
* rastreável;
* sujeito aos limites definidos pelo projeto.

---

# 57. Configurações do agente

Configurações relevantes deverão ser externalizadas.

Estrutura:

```text
services/agent-service/app/config/
├── agent.yaml
├── thresholds.yaml
└── rules.yaml
```

Exemplo:

```yaml
agent:
  name: student_agent
  version: "1.0.0"

contracts:
  version: "1.0"

thresholds:
  minimum_confidence: 0.70

abstention:
  enabled: true
  insufficient_data: true
  sensitive_cases_require_human_validation: true
```

---

# 58. Regras e limiares

Regras que alterem o comportamento do agente não deverão ser espalhadas por diferentes arquivos sem necessidade.

Quando possível:

```text
Regra
 ↓
Configuração
 ↓
Versão
 ↓
Execução
```

Isso permite reproduzir posteriormente o comportamento observado.

---

# 59. Versionamento do agente

Toda resposta do agente deverá permitir identificar sua versão.

Exemplo:

```json
{
  "agent": "student_agent",
  "agent_version": "1.0.0"
}
```

Quando aplicável, também deverá existir:

```json
{
  "config_version": "1.0.0"
}
```

---

# 60. Segurança mínima

O MVP deverá respeitar as seguintes regras:

* autenticação deve ser validada;
* autorização deve ser aplicada;
* um estudante não deve acessar dados de outro;
* APIs internas não devem ser expostas desnecessariamente;
* erros não devem expor stack traces para o usuário;
* secrets não devem aparecer no repositório;
* logs devem evitar informações sensíveis;
* dados reais não devem ser usados em testes versionados;
* decisões administrativas permanecem humanas.

---

# 61. Secrets

Não deverão ser versionados:

```text
.env
API keys
tokens
senhas
private keys
credenciais de PostgreSQL
credenciais cloud
segredos de CI/CD
```

O repositório poderá possuir:

```text
.env.example
```

com valores fictícios.

---

# 62. Observabilidade mínima

O MVP deverá possuir logs técnicos suficientes para investigar integrações.

Um log poderá incluir:

```text
timestamp
service
request_id
correlation_id
status
duration_ms
```

Exemplo:

```text
service=api
correlation_id=corr-demo-001
request_id=req-demo-001
status=success
duration_ms=142
```

---

# 63. Dados proibidos nos logs

Não deverão ser registrados indiscriminadamente:

```text
senha
token
Authorization header
cookie de sessão
dados acadêmicos completos
dados pessoais sensíveis
```

Logs deverão priorizar identificadores técnicos.

---

# 64. Diagrama do MVP

Arquitetura comum:

```text
┌─────────────────────────────┐
│         Estudante           │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ Expo / React Native         │
│ TypeScript                  │
│                             │
│ UI                          │
│ Estado                      │
│ Services                    │
│ Types                       │
└──────────────┬──────────────┘
               │
               │ HTTP
               ▼
┌─────────────────────────────┐
│ Node.js API                 │
│ TypeScript                  │
│                             │
│ Auth                        │
│ Authorization               │
│ Application Services        │
│ PostgreSQL Integration      │
│ Agent Integration           │
└───────┬──────────────┬──────┘
        │              │
        │              ▼
        │      ┌─────────────────────┐
        │      │ PostgreSQL          │
        │      └─────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ Python / FastAPI            │
│                             │
│ Contract Validation         │
│ Application Layer           │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ Agent Engine                │
│                             │
│ Rules                       │
│ Evaluation                  │
│ Recommendations             │
│ Evidence                    │
│ Abstention                  │
└─────────────────────────────┘
```

---

# 65. Fluxo de sucesso ponta a ponta

```text
Estudante
   ↓
Mobile
   ↓
Node.js API
   ↓
Autenticação / Autorização
   ↓
Carregamento dos dados
   ↓
Criação do correlation_id
   ↓
Agent Service
   ↓
Validação do contrato
   ↓
Agent Engine
   ↓
Recomendação
   ↓
Persistência
   ↓
Node.js
   ↓
Mobile
   ↓
Recomendação + Evidências + Próxima ação
```

---

# 66. Fluxo de falha de dependência

```text
Mobile
   ↓
Node.js
   ↓
Agent Service
   ↓
Falha de dependência
   ↓
Erro identificado
   ↓
Erro propagado de maneira controlada
   ↓
Mobile
   ↓
Mensagem + tentar novamente
```

---

# 67. Fluxo de contrato incompatível

```text
Node.js
   ↓
Agent Service
   ↓
Resposta
   ↓
Validação de contrato
   ↓
Incompatibilidade encontrada
   ↓
Rejeição
   ↓
Registro técnico
   ↓
Falha controlada
```

---

# 68. Fluxo de timeout

```text
Mobile
   ↓
Node.js
   ↓
Agent Service
   ↓
Tempo limite excedido
   ↓
Timeout
   ↓
Node.js encerra tentativa
   ↓
Mobile
   ↓
Mensagem de timeout
```

---

# 69. Estrutura sugerida do repositório

```text
apps/
└── mobile/
    ├── app/
    ├── components/
    ├── hooks/
    ├── services/
    ├── types/
    └── utils/

services/
├── api/
│   ├── src/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── clients/
│   │   ├── repositories/
│   │   ├── middlewares/
│   │   ├── config/
│   │   └── types/
│   └── package.json
│
└── agent-service/
    ├── app/
    │   ├── api/
    │   ├── agent/
    │   ├── config/
    │   ├── contracts/
    │   ├── services/
    │   └── main.py
    └── tests/

database/
├── migrations/
├── seeds/
└── documentation/

contracts/
├── agent/
└── api/

docs/
├── adr/
├── architecture/
├── discovery/
├── requirements/
└── evidence/

.github/
└── workflows/
```

A estrutura real poderá ser adaptada durante o desenvolvimento.

---

# 70. Contratos compartilhados

Quando aplicável, contratos poderão ser documentados em:

```text
contracts/
```

Exemplo:

```text
contracts/
└── agent/
    ├── student-agent-request.v1.json
    └── student-agent-response.v1.json
```

Ou poderão ser gerenciados pelas próprias aplicações, desde que exista uma fonte clara e versionada.

---

# 71. Testes mínimos do MVP

O MVP deverá possuir testes relacionados a:

```text
Agent Engine
Contratos
API
Integração Node.js ↔ Python
Mobile
Cenários ponta a ponta
```

O nível de cobertura poderá evoluir posteriormente.

---

# 72. Teste unitário do agente

O Agent Engine deverá poder ser testado sem FastAPI.

Exemplo conceitual:

```python
def test_pending_item_generates_recommendation():
    result = engine.evaluate(context)

    assert result.status == "recommendation"
    assert result.abstained is False
```

---

# 73. Teste de contrato

Deverá existir um teste garantindo que respostas inválidas sejam rejeitadas.

Exemplo conceitual:

```text
Contrato esperado:
v1

Contrato recebido:
v2

Resultado:
Falha controlada
```

---

# 74. Teste de falha de dependência

O Node.js deverá ser testado quando o Agent Service não estiver disponível.

Resultado esperado:

```text
Erro de dependência tratado
        +
Resposta consistente
        +
Sem recomendação falsa
```

---

# 75. Teste de timeout

O cliente de serviços deverá possuir teste ou roteiro que simule demora acima do limite.

Resultado esperado:

```text
Timeout detectado
        ↓
Estado de loading finalizado
        ↓
Erro controlado
```

---

# 76. Teste mobile

O fluxo principal deverá validar:

```text
Loading
Success
Empty
Error
Timeout
Abstained
Human Validation
```

Os controles principais deverão possuir atributos de acessibilidade adequados.

---

# 77. Roteiro reproduzível

Outro integrante deverá conseguir executar os cenários utilizando comandos documentados.

Uma estrutura futura poderá incluir:

```bash
docker compose up -d

npm install
npm run test

pytest

npm run test:e2e
```

Os comandos definitivos deverão ser atualizados conforme a implementação real.

Não deverão ser registrados como funcionais comandos que ainda não existam no projeto.

---

# 78. Evidência ponta a ponta

A evidência oficial deverá demonstrar pelo menos:

```text
Entrada sintética
        ↓
Mobile ou chamada reproduzível
        ↓
Node.js
        ↓
FastAPI
        ↓
Agent Engine
        ↓
Resultado
        ↓
Recomendação
```

A execução deverá possuir um:

```text
correlation_id
```

identificável.

---

# 79. Exemplo de evidência

Exemplo:

```text
Scenario:
SCENARIO-E2E-001

Student:
student-demo-001

Correlation ID:
corr-demo-001

Agent Version:
1.0.0

Contract Version:
1.0

Result:
recommendation

Evidence:
1 pending activity

Next Action:
consult pending items
```

---

# 80. Estrutura sugerida para evidências

```text
docs/
└── evidence/
    └── TASK-004/
        ├── README.md
        ├── success-scenario.md
        ├── dependency-failure.md
        ├── contract-mismatch.md
        └── screenshots/
```

Os arquivos deverão ser adicionados quando as respectivas evidências existirem.

---

# 81. Documento principal

A definição da task poderá ser registrada em:

```text
docs/discovery/TASK-004-common-mvp-scope.md
```

---

# 82. Dependência da TASK-002

A TASK-002 definiu:

```text
Problema
Objetivo
Indicadores de sucesso
```

O escopo do MVP deverá ser suficiente para demonstrar os indicadores relacionados a:

* cobertura;
* consistência;
* explicabilidade;
* próxima ação;
* abstensão;
* segurança decisória;
* rastreabilidade;
* reprodutibilidade.

---

# 83. Dependência da TASK-003

A TASK-003 definiu a jornada:

```text
Estudante
   ↓
Aplicativo
   ↓
Resumo
   ↓
Recomendação
   ↓
Evidência
   ↓
Próxima ação
```

O MVP deverá implementar o conjunto mínimo necessário para tornar essa jornada funcional.

---

# 84. Escopo por prioridade

O escopo poderá ser dividido em três categorias:

```text
MUST
Obrigatório para o MVP

SHOULD
Desejável, mas não bloqueante

COULD
Opcional
```

---

# 85. MUST — Obrigatório

```text
Aplicativo Expo funcional
Node.js API
Python Agent Service
Agent Engine
PostgreSQL
Dados sintéticos
Recomendação
Evidência
Próxima ação
Abstenção
Validação humana
Contratos explícitos
Versão de contrato
Correlation ID
Tratamento de erro
Timeout
Autenticação/autorização mínima
Teste de sucesso
Teste de falha
Teste de contrato
Documentação reproduzível
```

---

# 86. SHOULD — Desejável

```text
Histórico de recomendações
Feedback do estudante
Filtros
Observabilidade ampliada
Cache
Documentação OpenAPI refinada
Mais cenários de agente
Mais testes automatizados
```

---

# 87. COULD — Opcional

```text
Notificações
Dashboards avançados
LLM
Machine Learning avançado
Personalização
Gamificação
Integrações externas
```

---

# 88. Critério para expansão de escopo

Uma funcionalidade adicional somente deverá entrar no MVP se:

```text
Escopo obrigatório está protegido
        +
Não bloqueia entrega
        +
Possui valor demonstrável
        +
Pode ser testada
```

Não deverá ser adicionada apenas por parecer tecnicamente interessante.

---

# 89. Definição de pronto do fluxo comum

O fluxo integrado será considerado funcional quando outro integrante puder:

1. iniciar os serviços;
2. utilizar dados fictícios;
3. abrir o aplicativo ou executar o fluxo correspondente;
4. solicitar uma análise;
5. acompanhar a requisição entre os módulos;
6. identificar o `correlation_id`;
7. receber resultado do agente;
8. visualizar recomendação;
9. visualizar evidências;
10. visualizar próxima ação;
11. reproduzir pelo menos uma situação de falha;
12. reproduzir incompatibilidade de contrato ou outro limite relevante.

---

# 90. Limitações do MVP

O MVP não deverá ser interpretado como:

* sistema acadêmico completo;
* produto pronto para produção;
* ferramenta capaz de substituir professores;
* ferramenta capaz de substituir coordenação;
* sistema capaz de realizar decisões administrativas;
* sistema validado para uso institucional real;
* solução comprovada para redução de evasão;
* solução comprovada para melhoria de notas.

Trata-se de uma prova integrada do conceito técnico e funcional do ASA.

---

# 91. Critérios de aceite da TASK-004

A TASK-004 será considerada concluída quando:

* [ ] O escopo obrigatório do MVP está documentado.
* [ ] O Agente para o Estudante continua sendo o único agente obrigatório.
* [ ] O usuário principal permanece sendo o estudante.
* [ ] Os módulos obrigatórios estão definidos.
* [ ] Mobile, Node.js, Python e PostgreSQL possuem responsabilidades claras.
* [ ] UI, estado e serviços estão separados conceitualmente.
* [ ] O Agent Engine permanece desacoplado do FastAPI.
* [ ] Existem contratos explícitos entre os módulos.
* [ ] Existe versão de contrato quando aplicável.
* [ ] Existem identificadores de requisição/correlação.
* [ ] A autenticação e autorização são consideradas no fluxo.
* [ ] O usuário não pode selecionar arbitrariamente dados de outro estudante.
* [ ] Erros de dependência não são mascarados como sucesso.
* [ ] Timeouts possuem comportamento definido.
* [ ] O estado vazio é diferenciado de erro.
* [ ] A abstensão é diferenciada de erro.
* [ ] Existe comportamento definido para validação humana.
* [ ] Existe pelo menos um cenário de sucesso ponta a ponta.
* [ ] Existe pelo menos um cenário de falha de dependência.
* [ ] Existe cenário de incompatibilidade de contrato ou outro limite relevante.
* [ ] Os testes utilizam dados fictícios ou sintéticos.
* [ ] O sistema não executa decisões administrativas automaticamente.
* [ ] Configurações críticas podem ser externalizadas.
* [ ] Versão do agente pode ser rastreada.
* [ ] Configuração utilizada pode ser rastreada quando aplicável.
* [ ] A entrega é reproduzível por outro integrante.
* [ ] Evidências ponta a ponta foram registradas.
* [ ] A documentação afetada foi atualizada.
* [ ] Nenhum secret foi versionado.
* [ ] Nenhum dado pessoal ou acadêmico real foi utilizado nas evidências.
* [ ] A revisão cruzada foi realizada por **BrunoSouza06**.
* [ ] A versão aprovada foi registrada no Git.

---

# 92. Evidências da TASK-004

O principal artefato documental deverá ser:

```text
docs/discovery/TASK-004-common-mvp-scope.md
```

Evidências adicionais poderão incluir:

```text
contracts/

apps/mobile/

services/api/

services/agent-service/

database/

tests/

docs/evidence/TASK-004/
```

A evidência final deverá incluir, no mínimo:

```text
Documento
+
Commit
+
Pull Request
+
Revisão cruzada
+
Cenário de sucesso
+
Cenário de falha ou limite
```

---

# 93. Evidência de sucesso

Registrar:

```text
Scenario:
SCENARIO-E2E-001

Status:
Success

Correlation ID:
<id>

Agent Version:
<version>

Contract Version:
<version>

Result:
Recommendation generated

Evidence:
<arquivo ou teste>

Commit:
<SHA>
```

---

# 94. Evidência de falha

Registrar:

```text
Scenario:
SCENARIO-E2E-002

Condition:
Agent Service unavailable

Expected:
Dependency error propagated

Actual:
<resultado>

Evidence:
<teste ou arquivo>
```

---

# 95. Evidência de incompatibilidade

Registrar:

```text
Scenario:
SCENARIO-E2E-004

Expected contract:
1.x

Received contract:
2.0

Expected result:
Controlled contract incompatibility error

Actual:
<resultado>

Evidence:
<teste>
```

---

# 96. Revisão cruzada

Conforme os metadados da TASK-004, o reviewer responsável será:

```text
BrunoSouza06
```

A revisão deverá avaliar:

* coerência com TASK-001;
* coerência com TASK-002;
* coerência com TASK-003;
* clareza do escopo;
* controle de funcionalidades fora do MVP;
* separação das responsabilidades;
* contratos de integração;
* tratamento de erros;
* timeouts;
* segurança;
* rastreabilidade;
* reprodutibilidade;
* ausência de dados reais;
* ausência de secrets.

---

# 97. Registro da revisão

Durante o Pull Request:

```text
Task: TASK-004
Reviewer: BrunoSouza06
Status: Em revisão
```

Após aprovação:

```text
Task: TASK-004
Reviewer: BrunoSouza06
Status: Aprovado
Data: YYYY-MM-DD
PR: #XX
Commit: <SHA>
```

A aprovação registrada no Pull Request poderá ser utilizada como evidência da revisão cruzada.

---

# 98. Resultado da TASK-004

Com esta task, o escopo comum do MVP do ASA fica definido como:

```text
Estudante
   ↓
Expo / React Native / TypeScript
   ↓
Node.js / TypeScript
   ↓
Python / FastAPI
   ↓
Agent Engine
   ↓
PostgreSQL
```

O produto mínimo deverá demonstrar:

```text
Dados acadêmicos sintéticos
        ↓
Análise
        ↓
Recomendação
        ↓
Evidências
        ↓
Próxima ação
```

Também deverão existir comportamentos explícitos para:

```text
Abstenção
Validação humana
Falha de dependência
Timeout
Contrato incompatível
Erro de autenticação
Erro de autorização
```

A integração deverá possuir:

```text
Contratos explícitos
        +
Versionamento
        +
Request ID
        +
Correlation ID
        +
Run ID
```

O escopo obrigatório fica resumido como:

```text
Mobile funcional
+
API Node.js
+
Serviço Python
+
Agent Engine
+
PostgreSQL
+
Contratos
+
Recomendação
+
Evidências
+
Próxima ação
+
Abstenção
+
Validação humana
+
Tratamento de falhas
+
Testes reproduzíveis
```

Funcionalidades adicionais deverão permanecer subordinadas à conclusão desse núcleo.

Dessa forma, a TASK-004 estabelece um **MVP comum, controlado, integrado e verificável**, capaz de demonstrar o valor central do ASA sem ampliar desnecessariamente o escopo do projeto.
