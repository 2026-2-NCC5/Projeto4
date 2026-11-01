# Segurança e privacidade

- Navegação same-origin HTTPS e somente leitura; limite de profundidade/rotas e concorrência 1.
- Sem bypass de MFA/CAPTCHA, evasão stealth, login automatizado em domínios externos ou requisições forjadas a endpoints privados.
- Senha solicitada via terminal oculto e removida da referência ao fechar o browser; não vai ao serviço/API/IA.
- Inventários e capturas são privados localmente; capturas desativadas por padrão. Não use contas reais em testes.
- Sessão persistente cifrada e opcional; token ASA armazenado somente no `.env` local e revogável.
- API aplica autenticação e resolução de estudante existente, limite de payload e armazenamento ligado à conexão proprietária.
- TLS e criptografia em repouso do banco dependem da configuração do deployment existente; storage local depende da proteção do disco do usuário.

Antes de produção, revisar autorização institucional, política de acesso/uso do portal, retenção e eliminação, gestão de chaves, limites de tráfego, conteúdo pessoal enviado pelo cliente e alertas operacionais.
