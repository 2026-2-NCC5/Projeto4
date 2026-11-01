# Arquitetura

```mermaid
flowchart LR
  Expo[App Expo / Web] -->|Bearer autenticado| API[Express API]
  API --> Auth[Auth + estudante da sessão]
  API --> Service[Domínio de estágios]
  Service --> PG[(PostgreSQL)]
  Service --> Validator[Validação e snapshot]
  Validator --> Docs[Versões demonstrativas + hash]
  Service --> Events[Eventos append-only]
  Service -. integração futura autorizada .-> DS[DocuSign]
  Service -. fluxo assistido .-> Portal[Canal institucional]
```

O módulo reaproveita autenticação e PostgreSQL da Entrega 2; não cria serviço separado nem duplicação de usuários. As rotas são montadas na API quando a runtime entrega o pool. Web e mobile usam o mesmo aplicativo Expo com React Native Web.
