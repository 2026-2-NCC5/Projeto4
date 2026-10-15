# TASK-003 — Mapeamento de Usuários, Perfis e Jornada Principal

## 1. Definição da TASK-003

A **TASK-003** tem como objetivo mapear formalmente:

* os usuários envolvidos no ecossistema do **ASA — Agentes Inteligentes para o Sucesso do Estudante**;
* os perfis considerados no MVP;
* o usuário principal do sistema;
* as necessidades de cada perfil;
* os limites de acesso e responsabilidade;
* a jornada principal do estudante;
* os principais estados da interface;
* os pontos de interação com o Agente para o Estudante;
* os momentos em que deve existir validação humana;
* os requisitos iniciais de navegação, acessibilidade e tratamento de falhas.

A definição deverá permanecer consistente com:

```text
TASK-001
Seleção do Agente e Definição da Arquitetura Inicial

TASK-002
Definição do Problema, Objetivo e Indicadores de Sucesso
```

A TASK-003 também estabelecerá o fluxo funcional inicial que deverá orientar a implementação do aplicativo mobile em:

```text
Expo
+
React Native
+
TypeScript
```

---

# 2. Objetivo do mapeamento de usuários

O ASA deverá ser construído a partir das necessidades do estudante.

O mapeamento dos usuários permitirá definir:

* quem utiliza diretamente o aplicativo;
* quem poderá participar indiretamente de determinados fluxos;
* quais informações cada perfil poderá consultar;
* quais ações cada perfil poderá realizar;
* quais ações não poderão ser executadas automaticamente;
* quais jornadas deverão ser priorizadas no MVP.

O objetivo não será criar múltiplos sistemas administrativos.

O foco continuará sendo:

```text
Estudante
    ↓
Aplicativo ASA
    ↓
Compreensão da situação acadêmica
    ↓
Recomendação
    ↓
Próxima ação
```

---

# 3. Usuário principal do ASA

Conforme definido nas tasks anteriores, o principal usuário do sistema será o:

```text
Estudante
```

O estudante utilizará o aplicativo mobile para:

* visualizar informações acadêmicas;
* consultar sua situação atual;
* visualizar pendências;
* receber alertas;
* solicitar ou visualizar análises do agente;
* compreender evidências associadas às recomendações;
* identificar próximos passos;
* reconhecer situações em que deverá procurar apoio humano.

O **Agente para o Estudante** será projetado prioritariamente para atender esse perfil.

---

# 4. Perfis considerados

Para organizar o produto, serão considerados os seguintes perfis conceituais:

```text
Perfil 1
Estudante
└── Usuário principal do MVP

Perfil 2
Responsável Institucional
└── Participação humana quando houver necessidade de validação

Perfil 3
Administrador Técnico
└── Responsável técnico pelo ambiente e operação do sistema
```

Nem todos os perfis precisarão possuir uma interface completa no MVP.

O único perfil obrigatório de interação direta com o aplicativo mobile será:

```text
Estudante
```

---

# 5. Perfil 1 — Estudante

## Status

```text
Perfil principal do MVP
```

O estudante representa o usuário diretamente atendido pelo ASA.

---

## 5.1. Objetivos do estudante

O estudante deverá utilizar o sistema para:

* acompanhar sua situação acadêmica;
* compreender informações relevantes;
* identificar situações que merecem atenção;
* consultar recomendações;
* entender as evidências utilizadas pelo agente;
* visualizar uma próxima ação possível;
* identificar quando deve procurar apoio institucional;
* acompanhar pendências e informações acadêmicas relevantes.

---

## 5.2. Necessidades do estudante

As principais necessidades consideradas serão:

```text
Compreender
O que está acontecendo?

Interpretar
Por que essa situação foi identificada?

Priorizar
O que merece minha atenção primeiro?

Agir
O que posso fazer agora?

Confiar
Quais dados justificam essa recomendação?

Escalar
Preciso procurar alguém da instituição?
```

---

## 5.3. Principais dificuldades consideradas

O estudante poderá encontrar dificuldades para:

* interpretar dados acadêmicos isoladamente;
* relacionar diferentes indicadores;
* perceber antecipadamente uma situação de atenção;
* identificar pendências relevantes;
* determinar o que deve fazer primeiro;
* entender o motivo de um alerta;
* diferenciar uma recomendação automática de uma decisão institucional.

O ASA deverá reduzir essas dificuldades por meio de uma interface simples e explicável.

---

## 5.4. Ações permitidas

O estudante poderá, dentro do escopo previsto:

* autenticar-se;
* visualizar seus próprios dados;
* consultar disciplinas;
* consultar avaliações;
* consultar frequência;
* consultar pendências;
* solicitar análise;
* visualizar recomendações;
* visualizar evidências;
* visualizar próxima ação;
* visualizar necessidade de validação humana;
* fornecer feedback sobre recomendações, quando essa funcionalidade for implementada.

---

## 5.5. Ações não permitidas

O perfil estudante não deverá obter, por meio do ASA, autorização para:

* alterar notas;
* alterar frequência;
* modificar matrícula diretamente por recomendação do agente;
* aprovar decisões acadêmicas oficiais;
* alterar registros institucionais;
* acessar informações de outros estudantes.

---

# 6. Perfil 2 — Responsável Institucional

## Status

```text
Perfil conceitual de apoio
Não obrigatório como interface completa no MVP
```

Esse perfil representa possíveis responsáveis humanos envolvidos quando uma situação exigir avaliação institucional.

Dependendo do cenário, poderá representar:

* professor;
* coordenador;
* secretaria acadêmica;
* orientador;
* outro responsável autorizado.

---

## 6.1. Papel no ASA

O responsável institucional não será substituído pelo agente.

Seu papel será relevante em situações nas quais:

* os dados estiverem inconsistentes;
* houver necessidade de confirmação;
* existir risco de impacto relevante;
* uma decisão depender de autoridade institucional;
* o agente se abstiver;
* houver necessidade de intervenção humana.

Fluxo:

```text
Agente identifica situação
        ↓
Agente não executa decisão administrativa
        ↓
Estudante recebe explicação
        ↓
ASA recomenda contato institucional
        ↓
Responsável humano realiza avaliação
```

---

## 6.2. Exemplos de encaminhamento

O sistema poderá apresentar mensagens como:

```text
Procure o professor responsável pela disciplina para confirmar
as informações apresentadas.
```

ou:

```text
Esta situação pode exigir avaliação institucional.
Entre em contato com a coordenação.
```

O agente não deverá afirmar que uma decisão institucional já foi tomada quando essa validação ainda não ocorreu.

---

# 7. Perfil 3 — Administrador Técnico

## Status

```text
Perfil técnico
Fora da jornada principal do estudante
```

O administrador técnico representa membros responsáveis pela manutenção do sistema.

Poderá ser responsável por:

* configuração do ambiente;
* deploy;
* monitoramento;
* atualização do sistema;
* configuração de variáveis;
* manutenção de serviços;
* acompanhamento de logs técnicos;
* versionamento das regras;
* gestão dos ambientes de desenvolvimento e demonstração.

Esse perfil não deverá utilizar dados acadêmicos reais indiscriminadamente.

---

# 8. Perfis fora do escopo obrigatório do MVP

Os seguintes perfis não serão considerados interfaces completas obrigatórias nesta etapa:

```text
Professor
Coordenação
Secretaria
Responsável financeiro
Responsável legal
Gestor institucional
Administrador acadêmico
```

Esses usuários poderão aparecer como:

* destinos de encaminhamento;
* responsáveis por validação humana;
* possibilidades de evolução futura.

Isso evita que o projeto transforme o MVP em uma plataforma administrativa completa.

---

# 9. Persona principal

Para orientar o desenvolvimento da interface, será utilizada uma persona fictícia.

```text
Nome:
Estudante Exemplo

Perfil:
Aluno de graduação

Objetivo:
Acompanhar sua situação acadêmica e entender o que merece atenção.

Necessidade:
Receber informações claras e uma próxima ação prática.

Dificuldade:
Interpretar diferentes informações acadêmicas em conjunto.

Comportamento esperado:
Utilizar o aplicativo para consultar sua situação,
ler alertas e verificar recomendações.
```

A persona é inteiramente fictícia.

Nenhuma informação pessoal real de integrantes da equipe ou estudantes deverá ser utilizada na documentação.

---

# 10. User Story principal

A necessidade central do usuário será representada pela seguinte história:

> **Como estudante, quero visualizar minha situação acadêmica e receber recomendações explicáveis para entender o que merece minha atenção e qual próxima ação posso tomar.**

Essa história representa o principal fluxo funcional do MVP.

---

# 11. Histórias de usuário complementares

## US-001 — Visualizar situação acadêmica

> Como estudante, quero visualizar um resumo da minha situação acadêmica para compreender rapidamente se existe algo que merece atenção.

---

## US-002 — Consultar pendências

> Como estudante, quero visualizar minhas pendências para saber quais atividades precisam ser verificadas.

---

## US-003 — Receber recomendação

> Como estudante, quero receber recomendações relacionadas à minha situação acadêmica para entender quais ações posso considerar.

---

## US-004 — Visualizar evidências

> Como estudante, quero saber quais informações originaram uma recomendação para compreender por que ela foi apresentada.

---

## US-005 — Visualizar próxima ação

> Como estudante, quero visualizar uma próxima ação sugerida para saber o que posso fazer após receber um alerta.

---

## US-006 — Identificar necessidade de ajuda humana

> Como estudante, quero saber quando uma situação necessita avaliação humana para procurar o responsável adequado.

---

## US-007 — Receber resposta segura quando faltarem dados

> Como estudante, quero ser informado quando o sistema não possuir informações suficientes para realizar uma análise confiável, em vez de receber uma recomendação incorreta.

---

# 12. Jornada principal do estudante

A jornada principal do MVP será:

```text
1. Abrir o ASA
        ↓
2. Autenticar-se
        ↓
3. Acessar visão inicial
        ↓
4. Visualizar resumo acadêmico
        ↓
5. Visualizar situações que merecem atenção
        ↓
6. Abrir recomendação
        ↓
7. Visualizar evidências
        ↓
8. Visualizar próxima ação
        ↓
9. Seguir ação sugerida
        ↓
10. Procurar validação humana quando necessário
```

Essa será a principal jornada utilizada como referência para a implementação da interface.

---

# 13. Jornada detalhada

## Etapa 1 — Abertura do aplicativo

O estudante abre o aplicativo ASA.

Resultado esperado:

```text
Aplicativo inicializa
        ↓
Configurações necessárias são carregadas
        ↓
Estado da sessão é verificado
```

Durante essa etapa deverão existir tratamentos para:

* carregamento;
* erro de inicialização;
* indisponibilidade de serviços;
* sessão inexistente ou inválida.

---

# 14. Etapa 2 — Autenticação

Quando não existir sessão válida, o estudante deverá ser direcionado ao fluxo de autenticação.

Fluxo:

```text
Aplicativo
   ↓
Verificação de sessão
   ↓
Sessão válida?
   ├── Sim → Home
   └── Não → Login
```

A autenticação definitiva será detalhada nas tasks específicas.

A interface não deverá armazenar tokens sensíveis diretamente em componentes visuais.

---

# 15. Etapa 3 — Tela inicial

Após autenticação, o estudante deverá visualizar uma página inicial contendo um resumo de sua situação.

Exemplo conceitual:

```text
Olá, Estudante

Resumo acadêmico

Disciplinas
5

Pendências
2

Situações que merecem atenção
1

Última análise
Hoje

[ Ver recomendações ]
```

A tela inicial deverá priorizar informação relevante sem apresentar excesso de dados.

---

# 16. Etapa 4 — Consulta da situação acadêmica

O estudante poderá visualizar informações relacionadas a:

```text
Disciplinas
Avaliações
Frequência
Pendências
Recomendações
```

A interface deverá diferenciar:

```text
Dados acadêmicos
```

de:

```text
Interpretações produzidas pelo agente
```

Isso evita que uma recomendação seja confundida com um registro acadêmico oficial.

---

# 17. Etapa 5 — Solicitação ou recuperação da análise

Dependendo da implementação definida posteriormente, a análise poderá:

* ser solicitada pelo estudante;
* estar previamente disponível;
* ser atualizada quando necessário.

Fluxo conceitual:

```text
Estudante
   ↓
Solicita análise
   ↓
Node.js API
   ↓
Python Agent Service
   ↓
Agent Engine
   ↓
Resultado
```

Durante essa etapa, a interface deverá possuir um estado de carregamento.

Exemplo:

```text
Analisando suas informações acadêmicas...
```

---

# 18. Etapa 6 — Exibição da recomendação

Quando existir resultado válido, o estudante deverá receber informações como:

```text
Situação
Há atividades que merecem sua atenção.

Evidência
Foram identificadas atividades sem registro de conclusão.

Próxima ação
Verifique a lista de atividades da disciplina.

Confiança
Resultado compatível com os dados disponíveis.
```

Quando necessário:

```text
Validação humana necessária

Procure o responsável indicado para confirmar esta situação.
```

---

# 19. Etapa 7 — Visualização das evidências

As recomendações deverão possuir evidências associadas.

Exemplo:

```text
Recomendação
Considere verificar as atividades pendentes.

Por que estou vendo isso?

• Existem duas atividades com status pendente.
• A informação foi obtida dos dados acadêmicos disponíveis.
```

A interface não deverá esconder completamente os motivos utilizados pelo agente.

---

# 20. Etapa 8 — Próxima ação

Cada recomendação deverá apresentar, quando aplicável, uma ação sugerida.

Exemplo:

```text
Próxima ação

Verifique os detalhes da disciplina e identifique
quais atividades ainda precisam ser concluídas.

[ Ver pendências ]
```

Outro exemplo:

```text
Próxima ação

Procure o professor responsável para confirmar
a informação de frequência.

[ Entendi ]
```

---

# 21. Jornada de abstensão

Quando os dados não forem suficientes, a jornada será diferente.

```text
Estudante solicita análise
        ↓
Agente recebe dados
        ↓
Dados insuficientes
        ↓
Agente se abstém
        ↓
Aplicativo apresenta explicação
        ↓
Próxima ação segura
```

Exemplo:

```text
Não foi possível gerar uma recomendação confiável.

Motivo:
Não existem informações suficientes para analisar esta situação.

Próxima ação:
Verifique novamente mais tarde ou procure o responsável
pela disciplina caso precise confirmar alguma informação.
```

O sistema não deverá apresentar esse estado como erro técnico.

Abstenção é um comportamento funcional esperado do agente.

---

# 22. Jornada de validação humana

Quando existir necessidade de avaliação institucional:

```text
Situação identificada
        ↓
Agente detecta necessidade de validação
        ↓
requires_human_validation = true
        ↓
Aplicativo apresenta aviso
        ↓
Estudante recebe orientação
        ↓
Decisão permanece com responsável humano
```

Exemplo:

```text
Esta situação precisa de validação humana.

Os dados disponíveis indicam uma possível inconsistência.

Próxima ação:
Entre em contato com a coordenação para confirmação.
```

---

# 23. Estados obrigatórios da interface

Cada tela que dependa de dados externos deverá considerar pelo menos os seguintes estados:

```text
Loading
Success
Empty
Error
Timeout
```

Quando aplicável:

```text
Unauthorized
Forbidden
Offline
Abstained
Human Validation Required
```

A interface não deverá assumir que toda requisição retornará dados válidos imediatamente.

---

# 24. Estado de loading

Durante carregamento:

```text
Carregando suas informações...
```

ou:

```text
Analisando sua situação acadêmica...
```

O aplicativo deverá:

* informar que existe uma operação em andamento;
* evitar múltiplos envios da mesma ação;
* manter feedback visual;
* utilizar indicadores acessíveis.

Não deverá existir apenas uma animação sem significado para tecnologias assistivas.

---

# 25. Estado vazio

Quando não existirem dados relevantes, o estudante deverá receber uma mensagem explicativa.

Exemplo:

```text
Nenhuma pendência encontrada.

Quando novas pendências forem identificadas,
elas serão apresentadas aqui.
```

Para recomendações:

```text
Nenhuma recomendação disponível no momento.
```

O estado vazio não deverá ser apresentado como erro.

---

# 26. Estado de erro

Quando ocorrer uma falha técnica:

```text
Não foi possível carregar as informações.

Tente novamente.
```

A interface poderá apresentar:

```text
[ Tentar novamente ]
```

Não deverão ser exibidos diretamente ao estudante:

* stack traces;
* exceções internas;
* SQL;
* tokens;
* URLs internas sensíveis;
* detalhes técnicos desnecessários.

---

# 27. Estado de timeout

Quando uma operação ultrapassar o tempo definido pelo cliente:

```text
A análise está demorando mais que o esperado.

Verifique sua conexão e tente novamente.
```

A interface deverá permitir uma nova tentativa de maneira controlada.

O timeout utilizado deverá ser configurado na camada de serviços e não diretamente em componentes de apresentação.

---

# 28. Estado offline

Quando aplicável, o aplicativo poderá informar:

```text
Sem conexão com a internet.

Verifique sua conexão e tente novamente.
```

Funcionalidades que dependam do backend não deverão aparentar sucesso quando nenhuma comunicação ocorreu.

---

# 29. Navegação principal

A navegação inicial do MVP poderá seguir a estrutura:

```text
App
│
├── Login
│
└── Authenticated
    │
    ├── Home
    │
    ├── Acadêmico
    │   ├── Disciplinas
    │   ├── Avaliações
    │   ├── Frequência
    │   └── Pendências
    │
    ├── Recomendações
    │   └── RecommendationDetail
    │
    └── Perfil
```

A implementação definitiva deverá acompanhar o escopo real do MVP.

---

# 30. Fluxo principal de navegação

```text
Login
 ↓
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

Também deverá ser possível retornar de forma previsível:

```text
Detalhe
   ↓
Recomendações
   ↓
Home
```

---

# 31. Separação entre UI, estado e serviços

Conforme definido na task, a aplicação React Native deverá manter separação entre:

```text
UI
Estado
Serviços
Tipos / Contratos
```

Exemplo:

```text
apps/mobile/
├── app/
│   ├── index.tsx
│   ├── recommendations/
│   │   ├── index.tsx
│   │   └── [id].tsx
│   └── academic/
│
├── components/
│   ├── RecommendationCard.tsx
│   ├── EvidenceList.tsx
│   ├── LoadingState.tsx
│   ├── EmptyState.tsx
│   └── ErrorState.tsx
│
├── hooks/
│   ├── useRecommendations.ts
│   └── useStudentSummary.ts
│
├── services/
│   ├── apiClient.ts
│   ├── agentService.ts
│   └── studentService.ts
│
└── types/
    ├── agent.ts
    └── student.ts
```

A UI não deverá realizar diretamente chamadas HTTP complexas.

---

# 32. Camada de UI

A camada de apresentação será responsável por:

* renderizar informações;
* receber interação do estudante;
* apresentar loading;
* apresentar estado vazio;
* apresentar erros;
* apresentar recomendações;
* apresentar evidências;
* fornecer navegação;
* aplicar requisitos de acessibilidade.

Exemplo:

```tsx
<RecommendationCard recommendation={recommendation} />
```

O componente não deverá ser responsável por construir manualmente requisições HTTP.

---

# 33. Camada de estado

Hooks ou outra estratégia de gerenciamento definida pelo projeto deverão controlar:

* carregamento;
* resultado;
* erros;
* refetch;
* timeout;
* transições relacionadas ao fluxo.

Exemplo conceitual:

```ts
type RequestState<T> = {
  data: T | null;
  isLoading: boolean;
  error: string | null;
};
```

A implementação poderá evoluir para bibliotecas específicas caso o projeto necessite.

---

# 34. Cliente de serviços

As requisições ao backend deverão ficar concentradas em uma camada específica.

Exemplo:

```ts
export async function getRecommendations(): Promise<AgentRecommendation[]> {
  return apiClient.get("/api/agent/recommendations");
}
```

O objetivo é evitar código como:

```tsx
fetch(...)
```

espalhado diretamente entre diferentes componentes de interface.

---

# 35. Contrato inicial da recomendação

A interface deverá consumir um tipo definido.

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

O contrato deverá permanecer consistente com a API utilizada pelo sistema.

---

# 36. Contrato da execução do agente

Uma resposta conceitual poderá seguir:

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

Os tipos deverão acompanhar o contrato real implementado no backend.

---

# 37. Acessibilidade mobile

As telas da jornada principal deverão considerar acessibilidade desde a implementação inicial.

Os principais controles deverão possuir:

* labels;
* roles;
* descrição adequada;
* área de toque suficiente;
* foco previsível;
* conteúdo compreensível sem depender somente de cor.

---

# 38. Labels acessíveis

Exemplo:

```tsx
<Pressable
  accessibilityRole="button"
  accessibilityLabel="Ver detalhes da recomendação"
  onPress={handleOpenRecommendation}
>
  <Text>Ver detalhes</Text>
</Pressable>
```

Controles importantes não deverão possuir apenas ícones sem descrição acessível.

---

# 39. Informação não dependente apenas de cor

Estados como:

```text
Atenção
Sucesso
Erro
Validação humana
```

não deverão ser representados exclusivamente por cores.

Exemplo inadequado:

```text
● vermelho
```

Exemplo adequado:

```text
⚠ Atenção

Sua frequência merece verificação.
```

A informação textual deverá permanecer disponível mesmo sem percepção da diferença de cores.

---

# 40. Área de toque

Botões e controles interativos deverão possuir uma área de interação adequada para dispositivos móveis.

Exemplos de controles:

* voltar;
* abrir recomendação;
* tentar novamente;
* abrir pendências;
* confirmar leitura;
* iniciar análise.

Elementos muito pequenos ou difíceis de selecionar deverão ser evitados.

---

# 41. Foco e leitura

Quando uma tela apresentar:

```text
erro
resultado da análise
abstenção
validação humana
```

o conteúdo principal deverá possuir uma estrutura que permita leitura previsível por tecnologias assistivas.

A ordem visual e a ordem semântica deverão permanecer coerentes.

---

# 42. Permissões

A jornada principal do ASA não deverá solicitar permissões de dispositivo sem necessidade.

Não deverão ser solicitados por padrão:

```text
Localização
Câmera
Microfone
Contatos
Galeria
```

Caso alguma funcionalidade futura necessite uma permissão, ela deverá:

* possuir justificativa funcional;
* ser solicitada somente no momento necessário;
* tratar recusa;
* permitir continuidade do aplicativo quando possível.

---

# 43. Cenário principal de teste

A jornada principal deverá possuir pelo menos um roteiro reproduzível.

Exemplo:

```text
SCENARIO-UI-001
Estudante visualiza recomendação acadêmica
```

Pré-condição:

```text
Existe um estudante fictício autenticado.
Existe uma recomendação sintética disponível.
```

Passos:

```text
1. Abrir o aplicativo.
2. Acessar a Home.
3. Aguardar carregamento.
4. Selecionar Recomendações.
5. Abrir uma recomendação.
6. Visualizar mensagem.
7. Visualizar evidências.
8. Visualizar próxima ação.
```

Resultado esperado:

```text
A tela abre sem crash.
A recomendação utiliza o contrato definido.
As evidências são apresentadas.
A próxima ação é apresentada.
Os controles principais possuem identificação acessível.
```

---

# 44. Cenário de loading

```text
SCENARIO-UI-002
Carregamento de recomendações
```

Condição:

```text
A requisição ainda não foi concluída.
```

Resultado esperado:

```text
O aplicativo apresenta indicador de carregamento.
A interface não apresenta dados inválidos.
O botão de ação não dispara requisições duplicadas indevidamente.
```

---

# 45. Cenário de estado vazio

```text
SCENARIO-UI-003
Nenhuma recomendação disponível
```

Resposta:

```json
{
  "recommendations": []
}
```

Resultado esperado:

```text
Nenhuma recomendação disponível no momento.
```

A tela não deverá apresentar crash ou espaço vazio sem explicação.

---

# 46. Cenário de erro

```text
SCENARIO-UI-004
Falha na obtenção das recomendações
```

Condição:

```text
Backend retorna erro ou comunicação falha.
```

Resultado esperado:

```text
Mensagem compreensível
+
Botão "Tentar novamente"
```

Não deverão ser exibidos detalhes internos sensíveis.

---

# 47. Cenário de timeout

```text
SCENARIO-UI-005
Timeout ao carregar análise
```

Resultado esperado:

```text
Mensagem de timeout
+
Opção de tentar novamente
```

O aplicativo não deverá permanecer indefinidamente em loading.

---

# 48. Cenário de abstensão

```text
SCENARIO-UI-006
Agente não possui dados suficientes
```

Resposta conceitual:

```json
{
  "status": "abstained",
  "recommendations": [],
  "abstained": true,
  "abstentionReason": "Dados insuficientes.",
  "requiresHumanValidation": false
}
```

Resultado esperado:

```text
Interface informa que não foi possível realizar
uma recomendação confiável.

O estado não é apresentado como erro técnico.
```

---

# 49. Cenário de validação humana

```text
SCENARIO-UI-007
Recomendação exige validação humana
```

Resposta:

```json
{
  "requiresHumanValidation": true
}
```

Resultado esperado:

```text
A interface apresenta claramente que a situação
deve ser validada por uma pessoa responsável.

Nenhuma ação administrativa é executada pelo aplicativo.
```

---

# 50. Estrutura sugerida para testes

Os testes da aplicação poderão ser organizados posteriormente como:

```text
apps/mobile/
└── __tests__/
    ├── recommendations/
    │   ├── RecommendationList.test.tsx
    │   ├── RecommendationDetail.test.tsx
    │   ├── RecommendationEmpty.test.tsx
    │   ├── RecommendationError.test.tsx
    │   └── RecommendationAbstained.test.tsx
    │
    └── accessibility/
        └── RecommendationAccessibility.test.tsx
```

Os nomes definitivos deverão refletir a implementação real do projeto.

---

# 51. Evidências esperadas da implementação

A TASK-003 poderá utilizar como evidência:

```text
Código da interface
+
Tipos utilizados pela interface
+
Cliente de serviço
+
Estados de loading/erro/vazio/timeout
+
Teste reproduzível
+
Capturas de tela
+
Commit
+
Pull Request
+
Revisão cruzada
```

Nenhuma captura deverá conter:

* dados acadêmicos reais;
* nomes reais desnecessários;
* tokens;
* credenciais;
* URLs contendo secrets.

---

# 52. Estrutura sugerida de documentação

O mapeamento desta task poderá ser registrado em:

```text
docs/
├── discovery/
│   ├── TASK-002-problem-objectives-success-metrics.md
│   └── TASK-003-users-personas-main-journey.md
│
└── evidence/
    └── TASK-003/
        ├── README.md
        ├── main-flow.md
        └── screenshots/
```

A estrutura deverá acompanhar os diretórios existentes no repositório.

Não deverão ser criados links para arquivos inexistentes apenas para atender formalmente a task.

---

# 53. Fluxo integrado com a arquitetura

A jornada principal deverá respeitar a arquitetura definida na TASK-001.

```text
Estudante
   ↓
Expo / React Native
   ↓
UI
   ↓
Estado / Hooks
   ↓
Service Client
   ↓
Node.js API
   ↓
Python Agent Service
   ↓
Agent Engine
   ↓
Resultado estruturado
   ↓
Node.js API
   ↓
Service Client
   ↓
Estado
   ↓
UI
   ↓
Estudante
```

Essa separação deverá permitir substituir ou testar as camadas individualmente.

---

# 54. Jornada completa do MVP

A jornada principal do estudante pode ser representada da seguinte maneira:

```text
Abrir aplicativo
      ↓
Verificar sessão
      ↓
Autenticar
      ↓
Home
      ↓
Resumo acadêmico
      ↓
Situação merece atenção?
   ┌───────┴───────┐
  Não             Sim
   ↓               ↓
Estado normal   Recomendação
                   ↓
               Evidências
                   ↓
              Próxima ação
                   ↓
       Validação humana necessária?
              ┌────┴────┐
             Não       Sim
              ↓         ↓
          Estudante   Encaminhamento
          prossegue      humano
```

---

# 55. Jornada em caso de falha

O sistema também deverá possuir um caminho previsível quando ocorrer uma falha técnica:

```text
Tela
 ↓
Solicitação
 ↓
Loading
 ↓
Falha
 ↓
Erro / Timeout
 ↓
Mensagem compreensível
 ↓
Tentar novamente
```

Uma falha técnica não deverá produzir uma recomendação fictícia como fallback.

---

# 56. Jornada em caso de ausência de dados

```text
Tela
 ↓
Solicitação
 ↓
Resposta válida
 ↓
Lista vazia
 ↓
Estado vazio
```

Exemplo:

```text
Nenhuma recomendação disponível no momento.
```

Essa situação deverá ser diferenciada de:

```text
Erro de comunicação
```

e de:

```text
Abstenção do agente
```

---

# 57. Diferença entre estados

A aplicação deverá tratar os seguintes estados de maneira semanticamente diferente:

```text
EMPTY

A requisição funcionou, porém não existem itens.

Exemplo:
Nenhuma recomendação disponível.
```

```text
ERROR

A requisição não pôde ser concluída corretamente.

Exemplo:
Não foi possível carregar suas recomendações.
```

```text
TIMEOUT

A operação ultrapassou o tempo máximo permitido.

Exemplo:
A análise está demorando mais que o esperado.
```

```text
ABSTAINED

O agente foi executado, mas decidiu não emitir recomendação.

Exemplo:
Não existem informações suficientes para uma recomendação confiável.
```

```text
HUMAN_VALIDATION

O agente produziu uma orientação, porém uma decisão final
deve permanecer com uma pessoa autorizada.
```

---

# 58. Regras de segurança da jornada

Durante toda a jornada:

* o estudante deverá visualizar somente seus próprios dados;
* dados acadêmicos exibidos deverão vir de fonte autorizada;
* o agente não poderá executar alterações administrativas;
* recomendações deverão ser identificáveis como recomendações;
* erros não poderão expor informações internas sensíveis;
* tokens não deverão aparecer em logs ou telas;
* dados pessoais reais não deverão ser utilizados como fixtures versionadas;
* decisões relevantes deverão permanecer sujeitas à validação humana.

---

# 59. Relação com a TASK-002

A TASK-002 definiu como problema principal:

```text
Dificuldade do estudante para transformar informações acadêmicas
em compreensão e próximas ações úteis.
```

A jornada da TASK-003 implementa conceitualmente esse fluxo como:

```text
Estudante
   ↓
Visualiza informações
   ↓
Recebe contextualização
   ↓
Visualiza recomendação
   ↓
Consulta evidências
   ↓
Identifica próxima ação
```

Dessa forma, a experiência proposta responde diretamente ao problema documentado anteriormente.

---

# 60. Relação com os indicadores de sucesso

A jornada deverá permitir futuramente avaliar os indicadores definidos na TASK-002.

```text
Cobertura
└── Jornada principal executável

Consistência
└── Recomendação compatível com o cenário

Explicabilidade
└── Evidências visíveis

Próxima ação
└── Ação apresentada ao estudante

Abstenção
└── Estado específico na interface

Segurança decisória
└── Ausência de decisões administrativas automáticas

Rastreabilidade
└── Execução associada a resultado identificável

Reprodutibilidade
└── Cenários e testes documentados
```

---

# 61. Critérios de aceite da TASK-003

A TASK-003 será considerada concluída quando os seguintes critérios estiverem atendidos:

* [ ] O usuário principal está definido como estudante.
* [ ] Os demais perfis relevantes estão documentados.
* [ ] Os perfis fora do escopo obrigatório estão identificados.
* [ ] Existe uma persona fictícia para orientar o MVP.
* [ ] Existe uma User Story principal.
* [ ] As histórias complementares estão documentadas.
* [ ] A jornada principal do estudante está documentada.
* [ ] A jornada inclui acesso à recomendação.
* [ ] A jornada inclui evidências.
* [ ] A jornada inclui próxima ação.
* [ ] A jornada prevê abstensão.
* [ ] A jornada prevê validação humana.
* [ ] Nenhuma decisão administrativa é executada automaticamente.
* [ ] O fluxo mobile está compatível com Expo/React Native/TypeScript.
* [ ] UI, estado e cliente de serviços possuem responsabilidades separadas.
* [ ] Os contratos TypeScript consumidos pela interface estão definidos.
* [ ] A tela/fluxo principal abre sem crash.
* [ ] O estado de loading é tratado.
* [ ] O estado vazio é tratado.
* [ ] O estado de erro é tratado.
* [ ] O estado de timeout é tratado.
* [ ] Abstensão é diferenciada de erro técnico.
* [ ] Situações de validação humana são apresentadas ao estudante.
* [ ] Os controles principais possuem labels acessíveis.
* [ ] Os controles principais possuem roles acessíveis quando aplicável.
* [ ] Informações importantes não dependem exclusivamente de cor.
* [ ] A área de interação dos controles é adequada ao contexto mobile.
* [ ] Permissões desnecessárias não são solicitadas.
* [ ] Existe pelo menos um roteiro ou teste reproduzível da jornada principal.
* [ ] Evidências da implementação estão versionadas.
* [ ] Nenhum secret está presente nos artefatos.
* [ ] Nenhum dado pessoal ou acadêmico real está presente nas evidências.
* [ ] A revisão cruzada foi realizada por **Yamaschita**.
* [ ] A versão aprovada foi registrada no Git.

---

# 62. Evidências da TASK-003

O documento principal poderá ser registrado em:

```text
docs/discovery/TASK-003-users-personas-main-journey.md
```

Quando a implementação mobile correspondente estiver disponível, deverão ser adicionados links relativos para os arquivos reais utilizados.

Exemplo conceitual:

```text
Documento
docs/discovery/TASK-003-users-personas-main-journey.md

Interface
apps/mobile/app/

Componentes
apps/mobile/components/

Serviços
apps/mobile/services/

Tipos
apps/mobile/types/

Testes
apps/mobile/__tests__/

Evidências
docs/evidence/TASK-003/
```

Somente caminhos que realmente existirem no projeto deverão ser registrados como evidência final.

---

# 63. Revisão cruzada

Conforme os metadados da task, o reviewer responsável será:

```text
Yamaschita
```

A revisão deverá verificar:

* consistência com TASK-001 e TASK-002;
* clareza dos perfis;
* coerência da jornada principal;
* aderência ao escopo do MVP;
* separação entre UI, estado e serviços;
* tratamento dos estados obrigatórios;
* acessibilidade;
* comportamento de abstensão;
* encaminhamento para validação humana;
* ausência de decisões administrativas automáticas;
* ausência de dados pessoais reais;
* ausência de secrets.

---

# 64. Registro da revisão

Durante o Pull Request:

```text
Task: TASK-003
Reviewer: Yamaschita
Status: Em revisão
```

Após aprovação:

```text
Task: TASK-003
Reviewer: Yamaschita
Status: Aprovado
Data: YYYY-MM-DD
PR: #XX
Commit: <SHA>
```

O Pull Request aprovado poderá servir como evidência formal da revisão cruzada.

---

# 65. Resultado da TASK-003

Com esta definição, os usuários do ASA ficam organizados da seguinte maneira:

```text
Estudante
└── Usuário principal do MVP
    ├── Visualiza dados
    ├── Consulta situação
    ├── Recebe recomendações
    ├── Visualiza evidências
    ├── Visualiza próxima ação
    └── Procura validação humana quando necessário

Responsável Institucional
└── Apoio humano quando necessário
    └── Não substituído pelo agente

Administrador Técnico
└── Operação técnica
    └── Fora da jornada principal
```

A jornada principal fica estabelecida como:

```text
Estudante
   ↓
Aplicativo ASA
   ↓
Resumo acadêmico
   ↓
Recomendação
   ↓
Evidências
   ↓
Próxima ação
   ↓
Validação humana quando necessária
```

E a implementação mobile deverá tratar explicitamente:

```text
Loading
Empty
Error
Timeout
Abstention
Human Validation
Accessibility
```

Dessa forma, a TASK-003 transforma o problema e os objetivos definidos nas tasks anteriores em uma **jornada concreta de usuário**, estabelecendo a base funcional e de experiência necessária para a evolução do aplicativo mobile do ASA.
