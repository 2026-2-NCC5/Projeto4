# Central de Atendimento WhatsApp

A equipe do ASA atende estudantes pelo WhatsApp dentro do portal, em uma tela de três painéis. O estudante acompanha o andamento no aplicativo, com atualização automática, sem precisar abrir o WhatsApp.

> **Estado atual:** funciona ponta a ponta com o provedor de **demonstração**, em que nada sai para o WhatsApp. Nenhum número real foi conectado e nenhuma mensagem real foi enviada. Ativar um provedor real depende de autorização institucional ([checklist](rollout-plan.md)).

## Onde fica cada coisa

| Quem | Onde | O quê |
|---|---|---|
| Equipe ASA | Portal > Operação ASA > **Central de Atendimento** (`/asa/atendimento`) | Caixa de entrada, conversa e contexto do aluno |
| Administração | Portal > Administração > **Canal WhatsApp** (`/admin/canais/whatsapp`) | Conexão, QR, saúde e revisão de conflitos, **sem ler conversas** (ADR-008) |
| Estudante | App > Atendimento | Status, histórico e vínculo do WhatsApp no Perfil |

## Experimentar em 5 minutos (demonstração)

Pré-requisito: `docker compose up -d db` em `src/Entrega_2/Backend`. Use um banco separado, porque os seeds fictícios não devem ir para o banco de desenvolvimento.

```bash
docker exec asa-conecta-db psql -U asa -d postgres -c "create database asa_conecta_demo owner asa"

cd src/Entrega_2/Backend/api
export DATABASE_URL=postgres://asa:asa_dev_password@localhost:5432/asa_conecta_demo
# a API só aceita dados fictícios com NODE_ENV=test
export NODE_ENV=test ASA_WHATSAPP_PROVIDER=fake DEMO_DATA_ENABLED=true DEMO_SEED_ENABLED=true ACADEMIC_DATA_PROVIDER=demo
npm run db:migrate && npm run db:seed
npm run dev

# em outro terminal
cd src/Entrega_2/Web && npm run dev
```

1. Entre em `http://localhost:5173` com `admin.plataforma@demo.asa`. Em **Canal WhatsApp**, clique em **Conectar** e depois em **Concluir conexão**.
2. No simulador, clique em **Receber mensagem**.
3. Em outra sessão, entre com `atendente.asa@demo.asa` e abra **Central de Atendimento**. Atenda a conversa.

As senhas de demonstração estão em `Backend/api/test/support/fixtures.ts`.

O app bloqueia API em modo de demonstração, de propósito. Para exercitá-lo, veja [test-evidence.md](test-evidence.md).

## Documentos

| Documento | Conteúdo |
|---|---|
| [00-audit.md](00-audit.md) | Auditoria do código existente e matriz preservar/reutilizar/implementar |
| [architecture.md](architecture.md) | Arquitetura, modelo de dados e decisões |
| [02-implementation-plan.md](02-implementation-plan.md) | Situação de cada requisito e rastreabilidade |
| [provider-risk-assessment.md](provider-risk-assessment.md) | Decisão piloto × produção e riscos |
| [provider-matrix.md](provider-matrix.md) | Comparação entre os provedores |
| [integration-wa-akg.md](integration-wa-akg.md) | Contrato auditado do WA-AKG e como subir o piloto |
| [security-lgpd.md](security-lgpd.md) | Controles de segurança e pendências de LGPD |
| [api.md](api.md) / [openapi.yaml](openapi.yaml) | Rotas, permissões e exemplos |
| [runbook.md](runbook.md) | Operação do dia a dia |
| [troubleshooting.md](troubleshooting.md) | Problemas comuns |
| [test-evidence.md](test-evidence.md) | Comandos executados e resultados |
| [rollout-plan.md](rollout-plan.md) | Ativação gradual e reversão |

O nome `01-architecture.md`, citado no prompt mestre, foi unificado em `architecture.md`, para não manter dois documentos iguais.
