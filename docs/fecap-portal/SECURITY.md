# Segurança e privacidade

- Navegação same-origin HTTPS e somente leitura; limite de profundidade/rotas e concorrência 1.
- Sem bypass de MFA/CAPTCHA, evasão stealth, login automatizado em domínios externos ou requisições forjadas a endpoints privados.
- Senha solicitada via terminal oculto e removida da referência ao fechar o browser; não vai ao serviço/API/IA.
- Inventários e capturas locais podem incluir conteúdo visto na sessão e devem permanecer privados no dispositivo; capturas desativadas por padrão. Não use contas reais em testes.
- Sessão persistente cifrada e opcional; token ASA fica no `.env` local e pode ser revogado. No web, o token é mantido somente em memória da página.
- Agente local escuta em `127.0.0.1`, exige bearer token, usa CORS com allowlist explícita e respostas pessoais `no-store`. A aplicação remota consulta o agente diretamente do navegador do estudante.
- O cliente remoto do coletor envia somente métricas agregadas e ID derivado; não transmite páginas, URLs, tabelas ou documentos. A API minimiza/sanitiza payloads recebidos e a migration 016 reduz inventários legados.
- Dados de leitura ficam fora do repositório por padrão, somente a última execução local é preservada e a leitura fica indisponível após 60 minutos (limpeza lazy na próxima consulta/execução).
- TLS e criptografia em repouso do banco dependem da configuração do deployment existente; storage local depende da proteção do disco do usuário.

Antes de produção, revisar autorização institucional, política de acesso/uso do portal, retenção e eliminação, gestão de chaves, limites de tráfego, conteúdo pessoal enviado pelo cliente e alertas operacionais.
