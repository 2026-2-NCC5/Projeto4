# TASK-002 — Definição do Problema, Objetivo e Indicadores de Sucesso

## 1. Definição da TASK-002

A **TASK-002** tem como objetivo definir formalmente:

* o problema que o projeto **ASA — Agentes Inteligentes para o Sucesso do Estudante** pretende resolver;
* o objetivo geral do produto;
* os objetivos específicos do MVP;
* o público-alvo principal;
* a proposta de valor do sistema;
* os resultados esperados;
* os indicadores utilizados para avaliar o sucesso da PoC/MVP;
* os limites de interpretação desses indicadores.

Esta definição servirá como referência para as próximas atividades de:

* levantamento de requisitos;
* definição de personas e jornadas;
* arquitetura;
* desenvolvimento;
* criação dos cenários de teste;
* implementação do agente;
* validação da PoC;
* avaliação da qualidade das recomendações;
* apresentação final do projeto.

---

# 2. Problema identificado

Estudantes de instituições de ensino precisam acompanhar diferentes informações acadêmicas durante sua trajetória, como:

* disciplinas;
* avaliações;
* notas;
* frequência;
* atividades;
* pendências;
* prazos;
* progresso acadêmico;
* situações que podem exigir atenção ou acompanhamento.

Apesar de essas informações poderem estar disponíveis em sistemas acadêmicos, sua existência isolada não garante que o estudante compreenda claramente sua situação.

O estudante pode encontrar dificuldades para:

* interpretar diferentes informações acadêmicas em conjunto;
* identificar antecipadamente situações que merecem atenção;
* entender quais fatores contribuíram para determinado alerta;
* priorizar pendências acadêmicas;
* determinar qual próxima ação deve ser tomada;
* perceber quando os dados disponíveis são insuficientes;
* saber quando deve procurar um professor, coordenação ou outro responsável institucional.

Dessa forma, o problema principal abordado pelo ASA será:

> **A dificuldade do estudante em transformar informações acadêmicas disponíveis em uma compreensão clara de sua situação e em próximas ações úteis, contextualizadas e explicáveis.**

---

# 3. Formulação do problema

O problema pode ser resumido pelo seguinte fluxo:

```text
Dados acadêmicos disponíveis
        ↓
Informações distribuídas ou isoladas
        ↓
Dificuldade de interpretação pelo estudante
        ↓
Baixa percepção de situações que merecem atenção
        ↓
Dificuldade para definir a próxima ação
```

O ASA pretende atuar entre a disponibilidade dos dados e a decisão do estudante:

```text
Dados acadêmicos disponíveis
        ↓
ASA
        ↓
Análise contextualizada
        ↓
Situação identificada
        ↓
Evidências
        ↓
Recomendação
        ↓
Próxima ação sugerida
```

O sistema não tem como objetivo substituir os sistemas acadêmicos utilizados pela instituição.

Seu papel será complementar essas informações por meio de análise, contextualização e geração de recomendações.

---

# 4. Causas consideradas

Entre os fatores que contribuem para o problema estão:

* informações acadêmicas disponíveis em diferentes contextos;
* necessidade de interpretação manual dos dados;
* dificuldade para relacionar notas, frequência, atividades e pendências;
* ausência de priorização das situações identificadas;
* dificuldade para transformar dados em ações práticas;
* possibilidade de o estudante perceber uma situação crítica apenas tardiamente;
* falta de explicação sobre os fatores que originaram determinados alertas;
* dificuldade para distinguir uma simples recomendação de uma situação que exige intervenção institucional.

O projeto não assume que todos esses fatores estejam presentes em todos os ambientes acadêmicos.

Eles representam situações que justificam a criação e avaliação da PoC proposta.

---

# 5. Usuário principal

Conforme definido na TASK-001, o usuário principal do ASA será o:

```text
Estudante
```

O estudante deverá interagir com o sistema principalmente por meio do aplicativo mobile.

O ASA utilizará as informações acadêmicas disponibilizadas ao sistema para gerar recomendações destinadas ao próprio estudante.

---

# 6. Necessidade do usuário

A principal necessidade considerada pelo projeto pode ser expressa como:

> **Como estudante, quero compreender minha situação acadêmica e receber orientações baseadas nas informações disponíveis para conseguir identificar o que merece atenção e qual próxima ação posso realizar.**

Essa necessidade será utilizada como referência durante a definição dos requisitos do MVP.

---

# 7. Proposta de valor

A proposta de valor do ASA será:

> **Transformar informações acadêmicas estruturadas em alertas, evidências e recomendações explicáveis que ajudem o estudante a compreender sua situação acadêmica e identificar próximos passos.**

O valor entregue não será apenas a apresentação dos dados existentes.

O ASA deverá acrescentar uma camada de:

* análise;
* interpretação;
* contextualização;
* priorização;
* explicabilidade;
* recomendação.

Fluxo esperado:

```text
Informação
    ↓
Contextualização
    ↓
Análise
    ↓
Identificação da situação
    ↓
Evidências
    ↓
Recomendação
    ↓
Próxima ação
```

---

# 8. Objetivo geral do ASA

O objetivo geral do projeto será:

> **Desenvolver uma aplicação com um agente inteligente capaz de analisar informações acadêmicas disponibilizadas ao sistema e fornecer ao estudante recomendações explicáveis, alertas, evidências e próximos passos que apoiem a compreensão de sua situação acadêmica e a tomada de decisão.**

O sistema deverá manter o estudante como responsável pela decisão final sobre ações pessoais e preservar a necessidade de validação humana em situações que envolvam decisões institucionais relevantes.

---

# 9. Objetivos específicos

Para atingir o objetivo geral, o MVP deverá ser capaz de:

1. receber informações acadêmicas estruturadas;

2. validar se existem dados suficientes para realizar uma análise;

3. analisar informações relevantes do estudante;

4. identificar situações acadêmicas previamente contempladas pelas regras ou modelos do sistema;

5. gerar recomendações relacionadas às situações identificadas;

6. apresentar evidências que justifiquem cada recomendação;

7. indicar uma próxima ação possível ao estudante;

8. fornecer uma métrica ou classificação de confiança quando aplicável;

9. abster-se de produzir recomendações quando os dados ou a confiança forem insuficientes;

10. indicar situações que precisam de validação humana;

11. registrar informações necessárias para permitir rastreabilidade das execuções;

12. permitir que os resultados sejam reproduzidos em cenários controlados da PoC;

13. operar nos ambientes de desenvolvimento e demonstração utilizando apenas dados fictícios, sintéticos ou anonimizados.

---

# 10. Resultado esperado para o estudante

O resultado esperado não será apenas uma resposta genérica produzida pelo agente.

Uma interação bem-sucedida deverá permitir que o estudante responda às seguintes perguntas:

```text
O que foi identificado?
        ↓
Por que isso foi identificado?
        ↓
Quais dados contribuíram para essa conclusão?
        ↓
O que posso fazer agora?
        ↓
Preciso procurar alguém da instituição?
```

Exemplo conceitual:

```json
{
  "status": "recommendation",
  "summary": "Existem atividades acadêmicas que merecem sua atenção.",
  "recommendations": [
    {
      "type": "pending_activity",
      "message": "Considere revisar as atividades pendentes da disciplina.",
      "evidence": [
        "Foram identificadas atividades sem registro de conclusão."
      ],
      "next_action": "Consultar as atividades da disciplina no aplicativo."
    }
  ],
  "requires_human_validation": false
}
```

---

# 11. Papel do ASA na tomada de decisão

O ASA será uma ferramenta de:

```text
Apoio à decisão
```

e não um sistema autônomo de decisão administrativa.

O agente poderá:

* informar;
* alertar;
* recomendar;
* explicar;
* indicar evidências;
* sugerir uma próxima ação;
* solicitar validação humana;
* abster-se.

O agente não poderá:

* reprovar estudantes;
* alterar notas;
* modificar frequência;
* efetuar matrícula;
* cancelar matrícula;
* bloquear acesso;
* aplicar penalidades;
* restringir direitos acadêmicos;
* alterar registros acadêmicos oficiais;
* executar decisões administrativas relevantes automaticamente.

---

# 12. Hipótese do produto

A hipótese principal do projeto será:

> **Se informações acadêmicas relevantes forem analisadas e apresentadas ao estudante por meio de recomendações acompanhadas de evidências e próximos passos, então o estudante poderá compreender melhor sua situação acadêmica e identificar ações adequadas com maior clareza.**

Essa hipótese deverá ser validada por meio dos cenários e indicadores definidos para a PoC.

---

# 13. Hipóteses secundárias

Além da hipótese principal, o projeto considera as seguintes hipóteses:

### H1 — Explicabilidade

Recomendações acompanhadas por evidências são mais úteis para a PoC do que recomendações apresentadas sem justificativa.

---

### H2 — Próxima ação

Uma recomendação acompanhada por uma próxima ação clara torna a resposta do agente mais acionável para o estudante.

---

### H3 — Abstensão

Um agente capaz de reconhecer insuficiência de dados ou baixa confiança é mais adequado ao contexto acadêmico do que um agente que sempre produz uma recomendação.

---

### H4 — Validação humana

Situações de maior impacto podem ser tratadas de forma mais segura quando o agente apenas recomenda o encaminhamento para uma pessoa responsável, sem executar automaticamente decisões institucionais.

---

### H5 — Rastreabilidade

Registrar versão do agente, configurações, evidências e resultado permite avaliar e reproduzir o comportamento apresentado durante a PoC.

---

# 14. Escopo de validação da PoC

A PoC deverá validar principalmente o seguinte fluxo:

```text
Dados acadêmicos sintéticos
        ↓
Validação dos dados
        ↓
Processamento
        ↓
Agente para o Estudante
        ↓
Identificação de uma situação
        ↓
Geração de recomendação
        ↓
Evidências
        ↓
Próxima ação
        ↓
Confiança / Abstensão
        ↓
Validação humana quando necessária
```

Não será necessário que a PoC reproduza todas as funcionalidades de um sistema acadêmico real.

A validação deverá demonstrar que a arquitetura e o agente conseguem executar de forma reproduzível os principais cenários definidos pelo projeto.

---

# 15. Indicadores de sucesso

O sucesso da PoC será avaliado por meio de indicadores objetivos.

Os indicadores iniciais serão:

```text
1. Cobertura dos cenários obrigatórios
2. Consistência das recomendações
3. Explicabilidade das recomendações
4. Disponibilidade de próxima ação
5. Comportamento de abstensão
6. Segurança decisória
7. Rastreabilidade
8. Reprodutibilidade
9. Proteção de dados e secrets
```

---

# 16. Indicador 1 — Cobertura dos cenários obrigatórios

Este indicador mede quantos dos cenários definidos para a demonstração do MVP podem ser executados corretamente de ponta a ponta.

Fórmula:

```text
Cenários executados com sucesso
──────────────────────────────── × 100
Total de cenários obrigatórios
```

Meta inicial:

```text
100%
```

Um cenário será considerado executado quando:

* possuir entrada válida;
* passar pelo fluxo definido da aplicação;
* chegar ao agente;
* produzir resultado estruturado;
* possuir evidência de execução.

---

# 17. Indicador 2 — Consistência das recomendações

Este indicador avaliará se o resultado produzido pelo agente é compatível com o comportamento esperado definido previamente para os cenários de teste.

Fórmula:

```text
Resultados compatíveis com o esperado
────────────────────────────────────── × 100
Total de cenários avaliados
```

Meta inicial da PoC:

```text
>= 90%
```

O resultado esperado de cada cenário deverá ser definido previamente para evitar avaliação baseada apenas no resultado produzido pelo próprio sistema.

Exemplo:

```text
Entrada:
Estudante possui atividades pendentes.

Resultado esperado:
Gerar recomendação relacionada à verificação das atividades.

Resultado não esperado:
Gerar recomendação sobre frequência sem evidência correspondente.
```

---

# 18. Indicador 3 — Explicabilidade

Toda recomendação produzida pelo agente deverá apresentar pelo menos uma evidência associada quando houver dados que justifiquem a recomendação.

Fórmula:

```text
Recomendações com evidências
──────────────────────────── × 100
Total de recomendações
```

Meta:

```text
100%
```

Exemplo:

```json
{
  "message": "Considere verificar sua frequência na disciplina.",
  "evidence": [
    "A frequência registrada está abaixo do limiar de atenção configurado."
  ]
}
```

Uma recomendação sem qualquer justificativa não deverá ser considerada uma resposta completa da PoC.

---

# 19. Indicador 4 — Disponibilidade de próxima ação

Além de explicar a situação identificada, o agente deverá informar ao estudante o que ele pode fazer em seguida.

Fórmula:

```text
Recomendações com próxima ação
────────────────────────────── × 100
Total de recomendações
```

Meta:

```text
100%
```

Exemplo:

```json
{
  "message": "Existem atividades pendentes.",
  "next_action": "Consultar a disciplina e verificar as atividades sem registro de conclusão."
}
```

---

# 20. Indicador 5 — Comportamento de abstensão

O agente deverá demonstrar capacidade de não emitir uma recomendação conclusiva quando não existir informação suficiente.

Os cenários de teste deverão incluir pelo menos situações como:

* dados incompletos;
* dados inconsistentes;
* confiança abaixo do limiar;
* cenário não contemplado;
* situação que necessita avaliação humana.

Meta:

```text
100% dos cenários explicitamente definidos como casos de abstensão
devem produzir uma resposta de abstensão ou encaminhamento seguro.
```

Exemplo:

```json
{
  "status": "abstained",
  "recommendations": [],
  "confidence": 0.32,
  "requires_human_validation": true,
  "abstained": true,
  "abstention_reason": "Dados insuficientes para produzir uma recomendação confiável."
}
```

---

# 21. Indicador 6 — Segurança decisória

Este indicador avaliará se o agente respeita seu papel de apoio à decisão.

O número permitido de ações administrativas executadas autonomamente será:

```text
0
```

Durante os testes, o agente não poderá:

* alterar matrícula;
* alterar notas;
* alterar frequência;
* bloquear estudantes;
* aplicar sanções;
* determinar reprovação;
* executar outras ações administrativas de impacto relevante.

Quando identificar uma situação que possa exigir esse tipo de ação, deverá produzir algo como:

```json
{
  "requires_human_validation": true,
  "next_action": "Procure a coordenação para avaliação da situação."
}
```

---

# 22. Indicador 7 — Rastreabilidade

Cada execução oficial utilizada como evidência da PoC deverá permitir identificar, quando aplicável:

* identificador da execução;
* versão do agente;
* versão das configurações;
* entrada utilizada;
* regras ou modelo aplicável;
* resultado;
* evidências;
* confiança;
* ocorrência de abstensão;
* necessidade de validação humana;
* data da execução.

Meta:

```text
100% dos cenários oficiais utilizados como evidência da PoC
devem possuir informações suficientes para rastreabilidade.
```

Exemplo conceitual:

```json
{
  "run_id": "run-demo-001",
  "agent_version": "1.0.0",
  "config_version": "1.0.0",
  "scenario": "pending-items",
  "status": "recommendation",
  "confidence": 0.84
}
```

---

# 23. Indicador 8 — Reprodutibilidade

Outro integrante da equipe deverá conseguir executar os cenários oficiais da PoC utilizando:

* código versionado;
* configurações versionadas;
* dados sintéticos versionados;
* instruções documentadas;
* comandos documentados.

A meta será:

```text
100% dos cenários oficiais da PoC devem possuir procedimento
documentado de reprodução.
```

Uma evidência futura poderá seguir o formato:

```bash
docker compose up -d

npm test

pytest

python scripts/run_scenario.py --scenario pending-items
```

Os comandos definitivos deverão refletir a implementação real disponível no momento da validação.

Não deverão ser documentados comandos fictícios como se já fossem parte funcional do projeto.

---

# 24. Indicador 9 — Proteção de dados e secrets

Nenhuma evidência oficial da PoC poderá expor:

```text
.env
tokens
passwords
API keys
credenciais reais
dados pessoais reais
dados acadêmicos reais identificáveis
dados financeiros reais
```

Meta:

```text
0 ocorrências
```

Os cenários utilizados no desenvolvimento deverão utilizar:

* dados fictícios;
* dados sintéticos;
* dados anonimizados, quando aplicável.

Exemplo válido:

```json
{
  "student_id": "student-demo-001",
  "name": "Estudante Exemplo"
}
```

Não devem ser utilizados dados reais de integrantes, estudantes ou terceiros como massa de teste versionada.

---

# 25. Resumo dos indicadores

| Indicador                                          | Meta inicial |
| -------------------------------------------------- | -----------: |
| Cobertura dos cenários obrigatórios                |         100% |
| Consistência das recomendações                     |       >= 90% |
| Recomendações com evidências                       |         100% |
| Recomendações com próxima ação                     |         100% |
| Casos esperados de abstensão tratados corretamente |         100% |
| Ações administrativas autônomas                    |            0 |
| Cenários oficiais rastreáveis                      |         100% |
| Cenários oficiais reproduzíveis                    |         100% |
| Secrets ou dados pessoais reais nas evidências     |            0 |

Essas metas representam critérios iniciais para a PoC.

Caso algum valor precise ser alterado durante o desenvolvimento, a mudança deverá ser:

* justificada;
* documentada;
* revisada;
* versionada.

---

# 26. Cenários iniciais de referência

Os indicadores deverão ser avaliados utilizando cenários controlados.

Uma primeira classificação poderá incluir:

```text
SCENARIO-001
Situação acadêmica sem alertas relevantes

SCENARIO-002
Atividades pendentes

SCENARIO-003
Frequência que merece atenção

SCENARIO-004
Desempenho acadêmico que merece atenção

SCENARIO-005
Múltiplos fatores acadêmicos simultâneos

SCENARIO-006
Dados insuficientes

SCENARIO-007
Dados inconsistentes

SCENARIO-008
Situação que exige validação humana
```

A definição detalhada desses cenários poderá ocorrer nas tasks específicas de requisitos, dados, agente e testes.

---

# 27. Exemplo de cenário mensurável

Um cenário relacionado a pendências poderá ser definido futuramente como:

```json
{
  "scenario_id": "SCENARIO-002",
  "student_id": "student-demo-001",
  "academic_context": {
    "pending_items": [
      {
        "subject": "Estruturas de Dados",
        "type": "assignment",
        "status": "pending"
      }
    ]
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
  "abstained": false
}
```

Esse tipo de cenário permitirá testar de maneira objetiva a correspondência entre:

```text
Entrada
   ↓
Situação identificada
   ↓
Evidência
   ↓
Recomendação
   ↓
Próxima ação
```

---

# 28. Estrutura futura das evidências

As evidências relacionadas aos indicadores poderão ser mantidas em uma estrutura semelhante a:

```text
docs/
├── discovery/
│   └── TASK-002-problem-objectives-success-metrics.md
│
└── evidence/
    └── TASK-002/
        ├── README.md
        ├── scenarios.md
        └── results.md

tests/
├── fixtures/
│   └── academic/
└── scenarios/
```

A estrutura definitiva deverá acompanhar a evolução real do repositório.

Links relativos somente deverão ser adicionados quando os arquivos correspondentes existirem.

---

# 29. Relação com a arquitetura definida na TASK-001

A TASK-002 deverá permanecer compatível com a arquitetura definida anteriormente.

O fluxo geral continuará sendo:

```text
Estudante
   ↓
Expo / React Native
   ↓
Node.js API
   ↓
Python Agent Service
   ↓
Agent Engine
   ↓
Análise acadêmica
   ↓
Recomendação + Evidências + Próxima ação
   ↓
Node.js API
   ↓
Aplicativo mobile
```

Os indicadores definidos nesta task deverão ser utilizados posteriormente para avaliar principalmente o comportamento do:

```text
Agente para o Estudante
```

---

# 30. Relação entre problema e solução

A relação entre o problema identificado e a proposta do ASA pode ser representada da seguinte maneira:

```text
PROBLEMA
Dificuldade para interpretar informações acadêmicas
        ↓
CAPACIDADE DO ASA
Analisar informações estruturadas
        ↓
RESULTADO
Identificação de situações relevantes
        ↓
EXPLICABILIDADE
Apresentação das evidências
        ↓
AÇÃO
Recomendação de próximo passo
        ↓
SEGURANÇA
Abstenção ou validação humana quando necessário
```

---

# 31. O que não será considerado sucesso

O projeto não deverá considerar a PoC bem-sucedida apenas porque:

* o aplicativo abre;
* existe uma tela de chat;
* existe integração com uma API de IA;
* uma mensagem é produzida pelo agente;
* o backend retorna HTTP `200`;
* um modelo gera texto em linguagem natural.

O sucesso do agente dependerá de demonstrar comportamento verificável.

Uma resposta útil para a PoC deverá possuir, quando aplicável:

```text
Situação identificada
+
Recomendação
+
Evidências
+
Próxima ação
+
Confiança
+
Abstensão / validação humana
```

---

# 32. Limitações dos indicadores

Os indicadores definidos nesta task têm como objetivo avaliar a **PoC acadêmica do ASA**.

Eles não representam comprovação suficiente de:

* eficácia educacional em larga escala;
* melhoria real de notas;
* redução real de evasão;
* melhoria estatisticamente significativa de desempenho acadêmico;
* segurança suficiente para implantação institucional em produção;
* conformidade completa com todos os requisitos jurídicos de uma instituição real.

Esses resultados exigiriam estudos e validações adicionais que estão fora do escopo atual do projeto.

---

# 33. Métricas que não serão prometidas pelo MVP

Nesta etapa, o projeto não deverá assumir metas como:

```text
Reduzir evasão em 30%
Aumentar notas em 20%
Reduzir reprovação em 40%
Melhorar frequência em 25%
```

O projeto não possui ainda dados experimentais ou implantação real que permitam sustentar essas afirmações.

Caso métricas de impacto acadêmico sejam utilizadas futuramente, elas deverão ser baseadas em dados e metodologia apropriada.

---

# 34. Critérios de aceite da TASK-002

A TASK-002 será considerada concluída quando os seguintes critérios estiverem atendidos:

* [ ] O problema principal do ASA está documentado.
* [ ] O usuário principal está definido como estudante.
* [ ] A necessidade principal do estudante está documentada.
* [ ] A proposta de valor do ASA está documentada.
* [ ] O objetivo geral do projeto está definido.
* [ ] Os objetivos específicos estão documentados.
* [ ] A hipótese principal do produto está registrada.
* [ ] O papel do ASA como ferramenta de apoio à decisão está explícito.
* [ ] Os limites de atuação do agente estão documentados.
* [ ] Existe pelo menos um conjunto inicial de indicadores mensuráveis.
* [ ] Os indicadores possuem metas iniciais.
* [ ] Existe indicador relacionado à explicabilidade.
* [ ] Existe indicador relacionado à próxima ação.
* [ ] Existe indicador relacionado à abstensão.
* [ ] Existe indicador relacionado à validação humana.
* [ ] Existe indicador relacionado à rastreabilidade.
* [ ] Existe indicador relacionado à reprodutibilidade.
* [ ] Existe indicador relacionado à proteção de dados e secrets.
* [ ] Nenhuma ação administrativa autônoma é considerada comportamento válido.
* [ ] As limitações das métricas da PoC estão documentadas.
* [ ] Não são prometidos impactos acadêmicos sem evidência experimental.
* [ ] O conteúdo está consistente com a TASK-001.
* [ ] O documento está versionado no repositório.
* [ ] Nenhum secret está presente no documento.
* [ ] Nenhum dado pessoal ou acadêmico real está presente no documento.
* [ ] A revisão cruzada foi realizada por **Yamaschita**.
* [ ] A versão aprovada foi registrada no Git.

---

# 35. Evidências da TASK-002

O principal artefato desta task deverá ser versionado em:

```text
docs/discovery/TASK-002-problem-objectives-success-metrics.md
```

As evidências mínimas deverão incluir:

```text
Documento versionado
+
Commit
+
Pull Request
+
Revisão cruzada
```

Quando existirem implementações relacionadas, poderão ser adicionadas evidências adicionais, como:

```text
cenários de teste
dados sintéticos
saídas reproduzíveis
testes automatizados
capturas de tela
resultados da PoC
```

Não deverão ser adicionados links fictícios para arquivos que ainda não existem.

---

# 36. Revisão cruzada

Conforme os metadados da task, o reviewer responsável será:

```text
Yamaschita
```

A revisão deverá verificar principalmente:

* consistência do problema;
* coerência com a TASK-001;
* clareza dos objetivos;
* mensurabilidade dos indicadores;
* coerência das metas da PoC;
* limites de atuação do agente;
* ausência de dados pessoais reais;
* ausência de secrets;
* ausência de promessas não sustentadas.

O próprio responsável pela execução da task não deverá ser o único responsável por aprová-la.

---

# 37. Registro da revisão

Após a criação do Pull Request, poderá ser registrado:

```text
Task: TASK-002
Reviewer: Yamaschita
Status: Em revisão
```

Depois da aprovação:

```text
Task: TASK-002
Reviewer: Yamaschita
Status: Aprovado
Data: YYYY-MM-DD
PR: #XX
Commit: <SHA>
```

O Pull Request aprovado também servirá como evidência da revisão cruzada.

---

# 38. Resultado da TASK-002

Com esta definição, o ASA passa a possuir uma referência clara para o problema que pretende solucionar:

```text
Problema
Dificuldade do estudante para transformar informações acadêmicas
em compreensão e próximas ações úteis.
```

O objetivo do sistema fica definido como:

```text
Objetivo
Analisar informações acadêmicas e fornecer ao estudante
recomendações explicáveis, evidências e próximos passos.
```

E o sucesso inicial da PoC será avaliado por:

```text
Cobertura
Consistência
Explicabilidade
Próxima ação
Abstenção
Segurança decisória
Rastreabilidade
Reprodutibilidade
Proteção de dados
```

A relação principal estabelecida é:

```text
Dados acadêmicos
        ↓
Agente para o Estudante
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
        ↓
Abstenção ou validação humana quando necessário
```