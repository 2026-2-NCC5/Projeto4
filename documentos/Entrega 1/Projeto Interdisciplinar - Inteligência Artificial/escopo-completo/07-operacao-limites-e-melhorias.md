# Operacao, Limites e Melhorias

## Como executar o projeto

Requisitos principais:

- Node.js LTS
- npm
- Expo Go

Comandos principais:

```bash
npm install
npm start
```

Scripts disponiveis:

- `npm start`
- `npm run android`
- `npm run ios`
- `npm run web`
- `npm run typecheck`
- `npm run doctor`

## Configuracoes relevantes

### `app.json`

Define:

- nome do app;
- slug;
- versao `1.0.0`;
- orientacao portrait;
- `bundleIdentifier` iOS;
- package Android;
- `projectId` do EAS.

### `eas.json`

Mantem a configuracao de build para o ecossistema Expo Application Services.

## Pontos fortes atuais

- estrutura enxuta e facil de entender;
- autenticacao real funcionando;
- boa separacao entre UI, services e dados;
- discurso de produto coerente com a interface;
- preocupacao explicita com seguranca e validacao humana.

## Limitacoes atuais do sistema

### 1. Navegacao simplificada

O app usa estado local em vez de uma biblioteca de navegacao completa.

### 2. Dados academicos mockados

As informacoes mais importantes para a inteligencia do produto ainda nao vem do banco.

### 3. Ausencia de testes automatizados visiveis

Nao ha estrutura de testes implementada neste escopo do frontend.

### 4. Motor do assistente baseado em regras

Ele e previsivel e seguro, mas ainda limitado para conversas mais abertas.

### 5. Dependencia de configuracao externa

OAuth Microsoft, confirmacao de e-mail e politicas reais do Supabase dependem de configuracao correta no ambiente.

## Riscos de produto

- O usuario pode confundir dado demonstrativo com dado oficial se a comunicacao visual nao for sempre clara.
- O diferencial de IA ainda depende de evolucao do backend para sair do modo estatico.
- A ausencia de historico persistido do assistente reduz rastreabilidade no app atual.

## Melhorias recomendadas

### Curto prazo

- integrar disciplinas e pendencias reais ao Supabase;
- substituir datas fixas da interface por datas dinamicas;
- melhorar padronizacao de formularios;
- adicionar tratamento mais rico para erro de rede.

### Medio prazo

- adotar biblioteca de navegacao;
- criar camada de repositorio para dados;
- persistir historico do assistente;
- conectar feedback do estudante ao banco.

### Longo prazo

- calculo real de recomendacoes baseado em eventos academicos;
- painel institucional para acompanhamento;
- trilha de auditoria completa das decisoes do agente;
- integracao com servicos de notificacao.

## Conclusao

O projeto atual entrega um MVP bem definido: autenticacao real, experiencia mobile consistente e um conceito forte de apoio academico explicavel. O maior passo restante para maturidade de produto e trocar o cenario demonstrativo por dados academicos reais sem perder os guardrails que ja foram bem desenhados.
