# Deploy

O código usa a API Node/Express e PostgreSQL da Entrega 2; a função Vercel já usa o pool do runtime. Incluir a migration 013 no deploy e aplicá-la como etapa controlada antes de liberar o app. O app Expo chama a URL da API configurada pelo cliente atual. Nenhum worker, bucket ou endpoint de webhook é necessário para o modo assistido. Não habilitar DocuSign/instituição em produção sem credenciais e autorização. O rollback da aplicação deve preservar as tabelas e dados; não reverter a migration apagando dados.
