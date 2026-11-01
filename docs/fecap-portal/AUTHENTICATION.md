# Autenticação

O usuário informa a própria conta pelo terminal local. `FECAP_USERNAME` é opcional e aceita RA, usuário institucional ou e-mail conforme a tela efetivamente apresentada. Senha em branco no ambiente aciona entrada oculta. O conector identifica inputs, envia pelo formulário normal e verifica sinais de sessão; se houver SSO, MFA, CAPTCHA, erro ou tela desconhecida, pede conclusão manual e não tenta contornar o controle.

Sessão persistente fica desligada por padrão. Quando habilitada, cookies e localStorage são cifrados localmente usando Fernet e uma chave derivada de frase secreta, gravados com permissões restritas. Evite essa opção em máquinas compartilhadas. Logout/fechamento encerra o contexto do navegador; a revogação do token ASA não revoga a conta FECAP.

Credenciais nunca são enviadas ao ASA, a IA ou aos logs. Credenciais persistidas em `.env` são responsabilidade local do usuário e devem permanecer vazias no exemplo.
