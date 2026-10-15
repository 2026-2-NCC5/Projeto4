# Plataforma ASA Conecta: app + portal web

Documentos da evolução do ASA Conecta para um portal web com três áreas (aluno, equipe ASA e administração),
sobre a mesma API e o mesmo banco do app. Comece pela auditoria inicial e depois siga a ordem abaixo.

| Documento | Para quê |
|---|---|
| [../architecture/WEB_MOBILE_GAP_ANALYSIS.md](../architecture/WEB_MOBILE_GAP_ANALYSIS.md) | Fase 0: estado encontrado, lacunas, riscos e decisões |
| [ARCHITECTURE_TARGET.md](ARCHITECTURE_TARGET.md) | Arquitetura implementada, com diagramas (contêineres, sessão web, chamado entre canais, agendamento, dados) |
| [ROLE_PERMISSION_MATRIX.md](ROLE_PERMISSION_MATRIX.md) | Papéis, permissões (gerada do código) e regras de governança |
| [API_CONTRACTS.md](API_CONTRACTS.md) | Versões do contrato, envelope, motivos de erro, convenções e rotas por área |
| [DATABASE_MIGRATION_PLAN.md](DATABASE_MIGRATION_PLAN.md) | Migrations 006–011: o que fazem, como aplicar e como reverter |
| [SECURITY_AND_LGPD.md](SECURITY_AND_LGPD.md) | Sessões, CSRF, autorização, dados pessoais, auditoria, pendências |
| [DEMO_DATA_POLICY.md](DEMO_DATA_POLICY.md) | Modo demonstração: chaves, seeds, rótulos e comportamento com a demonstração desligada |
| [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) | Execução local, Compose, checklist de produção, várias instâncias, reversão |
| [WEB_MOBILE_E2E_SCENARIOS.md](WEB_MOBILE_E2E_SCENARIOS.md) | Cenários entre canais e o teste que cobre cada um |
| [TEST_REPORT.md](TEST_REPORT.md) | Resultados reais dos testes desta entrega |
| [DEMO_SCRIPT.md](DEMO_SCRIPT.md) | Roteiro de demonstração (aluno → equipe → administração) |
| [../adr/ADR-008-portal-web-sessao-e-autorizacao.md](../adr/ADR-008-portal-web-sessao-e-autorizacao.md) | Decisão: portal, sessão por cookie e autorização por permissões |
| [../adr/JEV_INTEGRATION_ADR.md](../adr/JEV_INTEGRATION_ADR.md) | Decisão: provedor de IA e integração JEV (bloqueada) |
