# Segurança e privacidade

- Dados do perfil, salvos, preferências e candidaturas são escopados pelo usuário autenticado no servidor.
- Endpoints administrativos usam `settings:manage`.
- Conteúdo recebido de fontes é dado não confiável: HTML é removido antes da exibição, URL é validada, hosts de candidatura são permitidos por lista, e a coleta não recebe URLs livres.
- Não há credenciais de fontes armazenadas pelo ASA Match nem tokens no frontend.
- Não há currículo ou endereço residencial no módulo. Localização é cidade/UF informada voluntariamente; não é usado GPS nem calculada distância real.
- Alertas nesta versão são somente in-app; canais de email/push estão desativados/não implementados.
- O histórico de candidaturas é manual. Abrir link externo não muda o status.
- A migration contém perfil, catálogo, resultados e logs. Execute exclusão/retention conforme política institucional e revise requisitos LGPD com o controlador antes de produção.
- Configure HTTPS, segredos de API e `CRON_SECRET` na infraestrutura. Nunca registre tokens/sessões. Fontes aprovadas devem ter escopo e autorização revisados.

Esta documentação descreve controles implementados, não constitui homologação jurídica, avaliação de impacto ou certificação de segurança.
