# Autenticação do ASA Conecta

Implementação: `src/Entrega 2/Backend/api/src/services/{authService,passwordResetService,biometricService}.ts`,
`src/Entrega 2/Backend/api/src/auth/`, `src/Entrega 2/Backend/api/src/mail/`; contrato em `src/Entrega 2/Backend/contracts/api/mobile-api.v1.ts`
(seção *auth*); app em `src/Entrega 2/Frontend` (ver README do app). Decisão: [ADR-004](../adr/ADR-004-authentication.md).

## Fluxos

```text
Login
  e-mail + senha (+ Manter conectado) ──► POST /auth/login ──► AuthSession
                                                   ├─ 401 invalid_credentials
                                                   ├─ 403 account_disabled (só com senha correta)
                                                   └─ 429 too_many_attempts / rate_limited (+ Retry-After)
Cadastro
  nome + e-mail institucional + RA + curso? + senha ──► POST /auth/register ──► 201 AuthSession
                                                   ├─ 400 email_domain_not_allowed | invalid_registration_number | weak_password | unknown_program
                                                   └─ 409 account_exists (mensagem genérica)
Recuperação
  e-mail ──► POST /auth/forgot-password ──► 202 (sempre igual) ──► e-mail com código
  código ──► POST /auth/verify-reset-code ──► resetToken (uso único, 15 min)
                                                   └─ 400 code_invalid (+attemptsRemaining) | code_expired | code_locked
  nova senha ──► POST /auth/reset-password ──► senha trocada + sessões e biometria revogadas
Biometria
  (logado) POST /auth/biometric/enroll ──► credencial de dispositivo ──► SecureStore(requireAuthentication)
  SO libera a credencial com a biometria ──► POST /auth/biometric/login ──► AuthSession (rememberMe)
Sessão
  boot: refresh token persistido? ──► POST /auth/refresh ──► autenticado | 401 → login | rede → tentar novamente
```

## Controles de segurança

| Ameaça | Controle | Onde |
| --- | --- | --- |
| Senha em texto puro | bcrypt custo 10; nada de senha em logs, storage ou e-mail | `authService.ts`, `passwordResetService.ts` |
| Força bruta de senha | 5 falhas/15 min por e-mail (também inexistente) → 429; 20 logins/10 min por IP | `authService.ts`, `routes/index.ts` |
| Enumeração de contas | respostas idênticas na recuperação; hash fictício no login; contador fantasma de código; expiração só com código certo | `authService.ts`, `passwordResetService.ts` |
| Força bruta do código | 5 tentativas por código, 20 verificações/15 min por IP, código com HMAC | `passwordResetService.ts` |
| Spam de e-mail | cooldown de 60 s, 5 envios por solicitação, 10 pedidos/15 min por IP | `passwordResetService.ts`, `routes/index.ts` |
| Reuso de token de redefinição | SHA-256, uso único transacional, 15 min | `pgRepositories.ts` (`completeReset`) |
| Sessão roubada após troca de senha | redefinição revoga refresh sessions e credenciais biométricas | `completeReset` |
| Refresh token vazado | rotação a cada uso, revogação no logout, validade por `rememberMe` | `authService.ts` |
| Credencial biométrica | token aleatório de 48 bytes, hash no banco, validade deslizante de 30 dias, máx. 5, revogável, liberado pelo SO | `biometricService.ts`, app |
| Falsificação de IP para burlar limite | `TRUST_PROXY=false` por padrão | `app.ts` |
| Escalada de privilégio no cadastro | corpo estrito (campos extras → 400); papel sempre `student` | `authController.ts`, `pgRepositories.ts` |
| Mensagens técnicas ao usuário | erros com `code` + `reason` estáveis; texto final decidido no app | `errorHandler.ts`, `src/Entrega 2/Frontend/services/authErrors.ts` |
| Conteúdo remoto no e-mail | `disableFileAccess`/`disableUrlAccess` no nodemailer 10 (sem vulnerabilidades conhecidas) | `mail/mailer.ts` |

## Armazenamento no app

| Dado | Nativo | Web |
| --- | --- | --- |
| Senha | nunca | nunca |
| Access token | memória | memória |
| Refresh token | SecureStore somente com "Manter conectado" | memória (não persiste) |
| Perfil (nome, e-mail) | SecureStore junto da sessão | memória |
| Credencial biométrica | SecureStore com `requireAuthentication` | não disponível |
| Recusa da oferta de biometria | AsyncStorage (flag por usuário, não sensível) | — |

## Configuração

Variáveis em `src/Entrega 2/Backend/api/.env.example`: `REFRESH_TOKEN_TTL_DAYS`, `SESSION_TTL_HOURS`,
`RATE_LIMIT_ENABLED`, `TRUST_PROXY`, `SIGNUP_ALLOWED_EMAIL_DOMAINS`, `REGISTRATION_NUMBER_PATTERN`,
`REGISTRATION_NUMBER_EXAMPLE`, `TERMS_URL`, `PRIVACY_URL`, `RESET_CODE_*`, `RESET_TOKEN_TTL_MINUTES`,
`MAIL_TRANSPORT`, `SMTP_*`, `MAIL_FROM`, `BIOMETRIC_LOGIN_ENABLED`, `BIOMETRIC_CREDENTIAL_TTL_DAYS`.

Termos de uso e política de privacidade não existem no projeto; por isso `TERMS_URL` e `PRIVACY_URL`
ficam vazios e o app não exibe links.

## E-mail em desenvolvimento

`docker compose up -d mailpit` sobe um SMTP local (porta 1025) com caixa de entrada em
<http://localhost:8025>. A API do Compose já envia para ele. Rodando a API fora do Docker, use
`SMTP_HOST=localhost` e `SMTP_PORT=1025` (padrão do `.env.example`).

## Evidências

- Unitários: `src/Entrega 2/Backend/api/test/unit/authFlows.test.ts` (política, rememberMe, bloqueio, cadastro,
  recuperação, enumeração, biometria).
- Integração PostgreSQL: `src/Entrega 2/Backend/api/test/integration/auth.integration.test.ts`.
- E2E com SMTP real (Mailpit): `src/Entrega 2/Backend/api/test/e2e/auth.e2e.test.ts` → [`evidence/e2e/auth-last-run.md`](../evidence/e2e/auth-last-run.md).

## Limitações

- Limites de requisição em memória (por processo). Em produção com réplicas, usar Redis ou gateway.
- Atrás do Docker em desenvolvimento, todas as requisições vêm do IP do gateway da rede Docker e
  compartilham o limite por IP.
- Não há confirmação de e-mail no cadastro nem bloqueio administrativo de contas pela interface.
