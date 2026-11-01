# Solução de problemas

- `healthcheck` sem browser: execute `scrapling install` no ambiente virtual.
- Login não confirmado: use janela visível e complete SSO/MFA manualmente; verifique se a sessão voltou ao host FECAP. Não repita continuamente após bloqueio.
- Token inválido: crie outro no app e atualize `ASA_INTERNAL_SYNC_TOKEN` no `.env` local.
- HTTP 413/400: inventário excedeu contrato/tamanho; reduza escopo ou corrija limites com revisão de privacidade.
- Nenhuma seção encontrada: layout pode ter mudado ou sessão não autenticada; verifique janela e relatório local sanitizado antes de editar parser.
- API indisponível: scan local continua independente; sincronização pode ser repetida com o mesmo session ID.
