# Telas e Componentes

## Telas principais

## `AuthScreen`

E a tela mais robusta do projeto. Reune tres modos:

- login;
- cadastro;
- recuperacao de senha.

### Responsabilidades

- validar dominio institucional;
- validar RA;
- validar senha;
- carregar lista de cursos;
- acionar login tradicional;
- acionar login Microsoft;
- acionar cadastro;
- acionar reset de senha.

### Comportamentos relevantes

- Detecta se o e-mail e de estudante ou institucional.
- Usa fallback local de cursos se a consulta remota falhar.
- Traduz alguns erros tecnicos em mensagens amigaveis.

## `HomeScreen`

Tela de visao executiva do estudante.

### Objetivo

Entregar, em poucos segundos, uma leitura do estado academico atual.

### Blocos exibidos

- cabecalho personalizado;
- card hero com chamada para o assistente;
- indicadores numericos;
- prioridade do dia;
- proximos prazos;
- progresso do semestre.

## `AcademicScreen`

Tela de consulta academica demonstrativa.

### Objetivo

Permitir leitura detalhada de disciplinas e pendencias.

### Estados internos

- filtro `disciplinas`;
- filtro `pendencias`.

## `AssistantScreen`

Tela conversacional do agente academico.

### Elementos centrais

- cabecalho do assistente;
- lista de mensagens;
- prompts rapidos;
- caixa de composicao;
- indicador de digitacao simulada.

### Caracteristicas

- resposta com pequeno delay para simular analise;
- evidencia e proxima acao exibidas no proprio bubble;
- marcacao explicita quando ha necessidade de validacao humana.

## `RecommendationsScreen`

Tela de recomendacoes explicaveis.

### Objetivo

Apresentar orientacoes estruturadas e auditaveis.

### Estrutura de cada recomendacao

- categoria visual;
- percentual de confianca;
- mensagem principal;
- evidencias;
- proxima acao.

## `ProfileScreen`

Tela de identificacao e seguranca da conta.

### Mostra

- nome;
- e-mail;
- matricula;
- curso;
- informacoes sobre sessao e privacidade;
- acao de logout.

## Componentes reutilizaveis

## `Screen`

Wrapper base de pagina com `SafeAreaView` e suporte opcional a scroll.

## `Card`

Container padronizado usado em quase todas as telas.

## `SectionTitle`

Cabecalho de secao com titulo e acao opcional.

## `Pill`

Selo visual para estados como:

- sucesso;
- atencao;
- informacao;
- perigo.

## `PrimaryButton`

Botao principal com variantes:

- `primary`
- `secondary`
- `danger`

## `ProgressBar`

Barra de progresso para representar andamento ou risco visual.

## `BottomNav`

Barra fixa inferior com cinco abas.

### Destaque de UX

A aba `Assistente` recebe tratamento visual mais proeminente, reforcando o papel central do agente no produto.

## Sistema visual

O projeto usa uma paleta central em `UI.tsx` com predominancia de:

- azul marinho;
- verde acqua;
- tons claros de apoio;
- cores de status para alerta e sucesso.

## Observacao tecnica

Os componentes de UI estao suficientemente organizados para um MVP, mas ainda nao formam um design system completo. Ainda faltam:

- tokens tipograficos centralizados;
- escalas espaciais formais;
- componentes de formulario mais reutilizaveis;
- padronizacao mais forte de feedback visual.
