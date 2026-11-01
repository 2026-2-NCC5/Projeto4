# Instalação

Requisitos: Python 3.11–3.14, Chromium suportado pelo Scrapling, e API ASA Conecta com a migration `014_fecap_portal.sql` aplicada.

```bash
cd src/Entrega_2/Backend/fecap-collector
python -m venv .venv
# Linux/macOS: .venv/bin/python -m pip install -e '.[test]'
# Windows: .venv\Scripts\python -m pip install -e .[test]
scrapling install
cp .env.example .env
fecap-portal healthcheck
```

`fecap-portal scan --read-only --resume` tenta continuar um checkpoint incompleto; sem `--resume`, inicia nova descoberta.

O diretório `.private` e arquivos `.env` são ignorados pelo Git. Para instalação offline, prepare previamente os wheels/dependências em ambiente aprovado. A versão foi fixada em `scrapling[fetchers]==0.4.15` porque disponibiliza `DynamicSession`; o módulo não ativa fetchers stealth.

## Ambiente

Consulte `src/Entrega_2/Backend/fecap-collector/.env.example`. `ASA_INTERNAL_SYNC_TOKEN` é o token pessoal emitido pela tela ASA e não deve ser compartilhado. `FECAP_SYNC_ENABLED` permanece `false` até consentimento explícito. Para usar senha em memória, deixe `FECAP_PASSWORD` vazia e rode `fecap-portal login` ou `scan`; a entrada usa `getpass`.
