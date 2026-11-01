# Integração ASA Conecta

A tela Expo aparece em Serviços > Portal Educacional FECAP. Ela cria e revoga token pessoal e exibe o último mapa realmente sincronizado. A autenticação acadêmica ocorre em outro processo local; o aplicativo não coleta senha FECAP. A API é Express/PostgreSQL existente e a migration `014_fecap_portal.sql` registra conexão, sessões, rotas e auditoria.

Não há integração com API oficial FECAP/TOTVS, e nenhuma navegação por scraper demonstra uma sincronização institucional oficial. Dados acadêmicos ainda não alimentam o dashboard, as notas, a frequência, os requerimentos ou o assistente; isso depende de mapear estruturas reais e validar permissões/uso.
