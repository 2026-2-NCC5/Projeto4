# Testes

`test/unit/internships.test.ts` cobre o endereço de Maria Oliveira Costa (fixture sintética), omissão controlada de logradouro/número, declaração sem número, CEP inválido e datas incoerentes. Comandos: `npm test -- internships.test.ts` na API; `npm run typecheck` nas pastas API e Frontend. Testes de integração com PostgreSQL e E2E do fluxo ainda precisam ser adicionados; os testes da suíte existente são executados separadamente e podem depender de serviços locais.
