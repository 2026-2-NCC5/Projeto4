# Arquitetura do Frontend

## Stack principal

- React Native
- Expo
- TypeScript
- Supabase Auth
- AsyncStorage

## Estrutura de alto nivel

```text
Frontend/
├── App.tsx
├── index.ts
├── src/
│   ├── components/
│   ├── data/
│   ├── screens/
│   ├── services/
│   └── types/
├── utils/
│   └── supabase.ts
├── database/
└── docs/
```

## Papel de cada camada

### `App.tsx`

E o orquestrador principal da aplicacao. Faz:

- bootstrap da sessao;
- escuta de mudanca de autenticacao;
- decisao entre fluxo autenticado e nao autenticado;
- controle da aba ativa.

## `index.ts`

Registra o `App` como raiz via `registerRootComponent`.

## `src/screens`

Contem as telas finais exibidas ao usuario:

- `AuthScreens.tsx`
- `HomeScreen.tsx`
- `AcademicScreen.tsx`
- `AssistantScreen.tsx`
- `RecommendationsScreen.tsx`
- `ProfileScreen.tsx`

## `src/components`

Concentra blocos reutilizaveis de UI:

- `UI.tsx`: primitives visuais como `Screen`, `Card`, `Pill`, `PrimaryButton` e `ProgressBar`
- `BottomNav.tsx`: barra inferior de navegacao

## `src/services`

Responsavel pela logica de acesso e comportamento:

- `authService.ts`: login, cadastro, OAuth, logout e reset de senha
- `courseService.ts`: consulta de cursos no Supabase e fallback local
- `assistantEngine.ts`: motor local deterministico do assistente

## `src/data`

Armazena o cenario demonstrativo local:

- disciplinas;
- pendencias;
- recomendacoes;
- resumo academico.

## `src/types`

Define os contratos centrais do app:

- `TabKey`
- `Subject`
- `PendingItem`
- `Recommendation`
- `AssistantMessage`

## `utils/supabase.ts`

Cria o cliente Supabase com:

- URL e chave vindas do ambiente;
- persistencia de sessao em AsyncStorage;
- refresh automatico de token;
- controle de ciclo de vida pelo `AppState`.

## Fluxo arquitetural

```text
Usuario
  -> Tela
  -> Service ou Mock local
  -> Supabase Auth / Dados locais
  -> Estado React
  -> Interface
```

## Modelo de navegacao

Nao ha React Navigation tradicional. O app usa estado local simples em `App.tsx`:

- quando nao existe sessao: renderiza `AuthScreen`;
- quando existe sessao: renderiza uma tela por vez conforme `activeTab`.

Isso reduz complexidade no MVP, mas limita:

- historico de navegacao;
- deep linking;
- navegacao aninhada;
- padroes nativos mais avancados.

## Decisoes arquiteturais relevantes

### 1. MVP com estado simples

O projeto evita gerenciadores globais e roteadores complexos. Isso acelera a entrega e facilita demonstracao.

### 2. Separacao entre autenticacao real e dados mockados

Essa e a decisao mais importante do sistema atual. O app fica convincente para demonstracao, sem depender de carga academica real.

### 3. Assistente local deterministico

O assistente nao depende de LLM externo. Isso traz:

- previsibilidade;
- custo zero de inferencia;
- respostas controladas;
- facilidade de apresentacao.

### 4. Backend preparado para evolucao

Mesmo que o app ainda use dados locais para analise academica, os scripts SQL ja desenham um backend com rastreabilidade, RLS e estruturas para recomendacao e feedback.
