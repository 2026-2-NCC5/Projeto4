# Deploy

O navegador é executado no computador do estudante ou worker confiável sob controle dele; não implantar login/cookies em Vercel. Frontend e API Express permanecem no modelo de deploy existente. Aplicar `014_fecap_portal.sql` pelo processo de migrations antes de habilitar rotas no backend.

Em produção, proteger a API ASA com HTTPS, TLS e criptografia do PostgreSQL já configurados pelo ambiente. Definir limites coerentes para payload e quotas, monitorar armazenamento de inventários e aplicar retenção aprovada. O token pessoal jamais deve ser colocado em `EXPO_PUBLIC_*`, variável pública do frontend ou log. O fluxo de primeiro uso entrega o segredo ao usuário uma única vez, que o configura em arquivo local ignorado pelo Git.

Não configurar cron para autenticar contas. `FECAP_SYNC_INTERVAL_MINUTES` é reservado para evolução; sincronização agendada ainda não está ligada.
