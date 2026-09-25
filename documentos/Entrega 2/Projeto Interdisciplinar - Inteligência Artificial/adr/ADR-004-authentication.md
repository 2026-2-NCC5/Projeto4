# ADR-004 — Autenticação completa: cadastro, recuperação, "manter conectado" e biometria

- **Status:** Aceito
- **Data:** 2026-09-17
- **Relacionado:** [ADR-002](ADR-002-stack-contracts-and-error-policy.md), [arquitetura de autenticação](../architecture/authentication.md)

## Contexto

O app só tinha login, refresh e logout. Faltavam cadastro, recuperação de senha, sessão prolongada
opcional e acesso por biometria, além de proteções contra força bruta e enumeração de contas. O mobile
persistia access e refresh token sempre, inclusive no `localStorage` do navegador.

## Decisões

1. **A API Node.js continua sendo a autoridade.** Nenhuma regra de senha, domínio ou RA é definida
   só no app: `GET /api/auth/policy` publica a política e o backend valida tudo de novo.
2. **Cadastro usa o modelo real:** nome, e-mail, RA (`students.registration_number`, obrigatório e
   único) e curso opcional (catálogo `programs`, migration 003). Após o cadastro o estudante já entra
   no app (fluxo *Cadastrar → Aplicativo*), pois não existe confirmação de e-mail no sistema.
3. **"Manter conectado" é regra de servidor:** `rememberMe` define a validade do refresh token
   (30 dias ou 12 horas, `REFRESH_TOKEN_TTL_DAYS`/`SESSION_TTL_HOURS`) e é preservado na rotação.
   O app só persiste o refresh token no armazenamento seguro quando `rememberMe = true`; o access
   token fica apenas em memória. No navegador nenhum token é persistido.
4. **Recuperação por código numérico enviado por e-mail** (SMTP via `nodemailer`). Código de 6
   dígitos, 10 minutos, 5 tentativas, reenvio com cooldown de 60 s e até 5 envios; guardado só como
   HMAC com segredo do servidor. Código correto gera token de redefinição de uso único (15 min,
   SHA-256). A redefinição, em uma transação, troca a senha e revoga todas as sessões e credenciais
   biométricas.
5. **Sem enumeração de contas:** esqueci/reenviar respondem sempre igual; tentativas de código para
   e-mails inexistentes simulam o mesmo contador; a expiração do código só é revelada a quem acertou o
   código; login usa hash fictício quando o e-mail não existe; "conta desativada" só aparece para quem
   informou a senha correta; bloqueio por tentativas vale também para e-mails inexistentes.
6. **Biometria não guarda senha:** ao ativar, a API emite uma **credencial de dispositivo** aleatória
   (hash SHA-256 no banco, 30 dias com janela deslizante, até 5 ativas por usuário, revogável). O app
   a guarda no `expo-secure-store` com `requireAuthentication`, então o sistema operacional exige a
   biometria para liberá-la. Troca de biometria no aparelho invalida a chave; o app limpa e pede senha.
7. **Rate limiting em memória por IP** nas rotas públicas sensíveis e **bloqueio por conta** após 5
   senhas erradas em 15 minutos (`429 RATE_LIMITED` + `Retry-After`). `TRUST_PROXY` controla se o IP
   vem de `X-Forwarded-For` (desligado por padrão, para não permitir burla do limite).
8. **E-mail local com Mailpit** no Docker Compose. Sem SMTP configurado (`MAIL_TRANSPORT=disabled`) a
   recuperação responde `503 recovery_unavailable` e a política informa `passwordRecoveryAvailable:
   false` — nunca há simulação silenciosa.

## Alternativas consideradas

| Alternativa | Motivo para não adotar |
| --- | --- |
| Link mágico por e-mail em vez de código | Exige deep link configurado e domínio público; o código funciona no Expo Go. |
| Guardar a senha ou o refresh token da sessão para a biometria | Senha nunca pode ser armazenada; o refresh token rotaciona a cada uso e deixaria a credencial biométrica inválida. |
| `express-rate-limit`/Redis | Dependência extra sem ganho para uma instância; o limitador próprio é pequeno e testado. Com várias réplicas, trocar por armazenamento compartilhado. |
| Confirmação obrigatória de e-mail no cadastro | Não havia fluxo nem requisito definido; pode ser adicionada reaproveitando o envio de código. |

## Consequências

- Novas rotas: `GET /auth/policy`, `GET /auth/programs`, `POST /auth/register`,
  `/auth/forgot-password`, `/auth/resend-reset-code`, `/auth/verify-reset-code`,
  `/auth/reset-password`, `/auth/biometric/{enroll,login,revoke}`.
- `AuthSession` ganhou `refreshExpiresIn` e `rememberMe` (contrato mobile atualizado nos dois lados).
- Os limites em memória reiniciam com o processo e não são compartilhados entre réplicas.
- Testes de integração e E2E passam a exigir `TEST_DATABASE_URL` apontando para um banco descartável.
