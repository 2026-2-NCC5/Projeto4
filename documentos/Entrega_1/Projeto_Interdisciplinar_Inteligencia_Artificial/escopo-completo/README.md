# Documentacao Completa do Sistema

Esta pasta concentra a documentacao funcional e tecnica do frontend `ASA Conecta`.

## Objetivo

Organizar uma visao completa do sistema para estudo, apresentacao, onboarding e manutencao.

## Conteudo

- `01-visao-geral.md`: resumo executivo do produto, proposta e escopo do MVP.
- `02-arquitetura.md`: arquitetura da aplicacao, stack, organizacao de pastas e fluxo entre camadas.
- `03-fluxos-funcionais.md`: fluxos principais de autenticacao, navegacao e uso do app.
- `04-telas-e-componentes.md`: comportamento de cada tela e dos componentes reutilizaveis.
- `05-dados-e-backend.md`: integracao com Supabase, banco de dados, RLS e contratos de dados.
- `06-assistente-e-recomendacoes.md`: funcionamento do assistente academico e do motor de recomendacoes.
- `07-operacao-limites-e-melhorias.md`: setup, riscos, limitacoes atuais e proximos passos.

## Escopo analisado

- App mobile em React Native com Expo
- Autenticacao real com Supabase Auth
- Persistencia de sessao com AsyncStorage
- Dados academicos demonstrativos locais
- Camada SQL de suporte para evolucao do backend

## Diretorios de referencia

- Codigo principal: `src/`
- Cliente Supabase: `utils/supabase.ts`
- Scripts SQL: `database/`
- Configuracoes Expo/EAS: `app.json`, `eas.json`

## Observacao

Esta documentacao descreve o comportamento implementado no projeto atualmente. Onde houver diferenca entre a arquitetura planejada no banco e o comportamento real do app, isso e apontado explicitamente nos arquivos.
