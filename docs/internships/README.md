# Gestão de Estágios

Módulo inicial integrado à API Express e ao aplicativo Expo da Entrega 2. O cadastro e os snapshots persistem no PostgreSQL. O fluxo é assistido: os modelos gerados são prévias demonstrativas, sem valor oficial, PDF assinado ou envio automático a FECAP/DocuSign.

## Começar

1. Aplicar migrations com `npm run db:migrate` em `src/Entrega_2/Backend/api`.
2. Iniciar API e app conforme seus READMEs existentes.
3. Autenticar com uma conta de estudante provisionada; a API deriva o estudante da sessão.
4. Abrir **Serviços → Gestão de Estágios**.

Veja [arquitetura](ARCHITECTURE.md), [API](API.md), [validação documental](DOCUMENT_VALIDATION.md), [segurança](SECURITY.md) e [deploy](DEPLOYMENT.md).

## Estado real

- Operacional no código: rascunhos persistidos, snapshots, validação determinística, versões com SHA-256, timeline append-only, prévia textual e abertura de contestação.
- Ainda não operacional: PDF oficial, armazenamento privado de anexos, templates institucionais aprovados, integração oficial do Portal do Aluno, OAuth/DocuSign, webhooks, e-mail/push específicos do estágio e painel de gestão institucional.
- Não afirmar que um encaminhamento ou assinatura ocorreu: a resposta da API identifica `manual_assisted` e `officialTransmission: false`.
