# Evidência E2E da autenticação — ASA Conecta

Gerado automaticamente por `npm run test:e2e` (services/api) em 2026-09-17T04:20:39.006Z.
API 1.0.0 · Agent Service: n/a

Todos os dados são sintéticos (student-demo-*). Nenhum dado pessoal real.

| Cenário | Estudante | HTTP | Resultado | Esperado | correlation_id | run_id | OK |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E2E-AUTH-001 — Cadastro, recuperação por e-mail real e redefinição | conta criada no teste | 200 | register 201 · forgot 202 · verify 200 · reset 200 · refresh antigo 401 · senha antiga 401 | sessões antigas revogadas e nova senha válida | `corr-24aa76aa-e9cb-465c-a4a1-f4cf8c21d133` | — | ✅ |
| E2E-AUTH-002 — Login biométrico com credencial de dispositivo | conta criada no teste | 200 | enroll 201 · login 200 · após revogar 401 (biometric_credential_invalid) | 201 · 200 · 401 | `corr-cb888a85-9c0c-489d-92c7-e377ac32bad5` | — | ✅ |
| E2E-AUTH-003 — Limites de tentativas (código e login) | conta criada no teste | 429 | verify: code_invalid, code_invalid, code_invalid, code_invalid, code_locked · código correto após bloqueio: code_locked · login: 429 too_many_attempts | code_locked · 429 too_many_attempts | `corr-6129cc3f-3242-4c63-8277-5f899deedfdb` | — | ✅ |

## Detalhes

### E2E-AUTH-001 — Cadastro, recuperação por e-mail real e redefinição

```json
{
  "codeLength": 6,
  "rememberMe": true,
  "oldRefreshReason": "session_expired",
  "oldAccessReason": "session_revoked"
}
```

### E2E-AUTH-002 — Login biométrico com credencial de dispositivo

```json
{}
```

### E2E-AUTH-003 — Limites de tentativas (código e login)

```json
{
  "retryAfterSeconds": 900
}
```
