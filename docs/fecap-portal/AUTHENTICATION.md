# Autenticação

O usuário informa a própria conta pelo terminal local. `FECAP_USERNAME` é opcional e aceita RA, usuário institucional ou e-mail conforme a tela efetivamente apresentada. A senha nunca é lida de variável de ambiente, `.env`, arquivo ou argumento de linha de comando; o conector a solicita com entrada oculta no terminal. O conector identifica inputs, envia pelo formulário normal e verifica sinais de sessão; se houver SSO, MFA, CAPTCHA, erro ou tela desconhecida, pede conclusão manual e não tenta contornar o controle.

Sessão persistente fica desligada por padrão. Quando habilitada, cookies e localStorage são cifrados localmente usando Fernet e uma chave derivada de frase secreta, gravados com permissões restritas. Evite essa opção em máquinas compartilhadas. Logout/fechamento encerra o contexto do navegador; a revogação do token ASA não revoga a conta FECAP.

Credenciais nunca são enviadas ao ASA, à IA ou aos logs. Se `FECAP_PASSWORD` estiver definido em ambientes existentes, o conector o ignora.
