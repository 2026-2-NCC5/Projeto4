# Conector local do Portal Educacional FECAP

Serviço Python local para login do próprio estudante, descoberta de navegação e extração somente leitura com Scrapling. O portal nunca recebe ações de escrita pelo crawler. O navegador é visível por padrão; MFA/CAPTCHA interrompe o fluxo para confirmação humana.

## Instalação

```bash
cd src/Entrega_2/Backend/fecap-collector
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
python -m pip install -e '.[test]'
scrapling install
cp .env.example .env       # Windows: copy .env.example .env
```

O `.env` fica ignorado pelo Git. Deixe `FECAP_PASSWORD` vazio para que a senha seja solicitada com entrada oculta. É preferível digitar a senha em vez de gravá-la no arquivo. Para sessão persistente, defina `FECAP_SESSION_PERSIST=true`; a frase de cifragem é solicitada pelo terminal e o estado é salvo cifrado em `.private/`.

## Comandos

```bash
python -m fecap_collector login
python -m fecap_collector discover
python -m fecap_collector scan --read-only
python -m fecap_collector export-map
python -m fecap_collector sync
python -m fecap_collector healthcheck
```

`discover`/`scan` abrem o navegador, aguardam login e MFA manual se necessário, seguem apenas navegação HTTPS no host `portal.fecap.br`, esperam o intervalo configurado e gravam dados locais em arquivos com modo `0600` sob diretório `0700`. Nenhuma varredura real é considerada validada até que o estudante a execute com sua sessão.

## Limites declarados

- Não usa `StealthySession`, fingerprint spoofing, proxy, CAPTCHA solver ou endpoints descobertos fora da interface.
- Menus/links/rotas e tabs semânticas são descobertos dinamicamente; elementos com comportamento ambíguo são inventariados, não acionados.
- Arquivos de documentos podem ser catalogados, mas não baixados automaticamente nesta versão.
- Exportação para ASA Conecta requer token pessoal revogável emitido no app e `ASA_API_BASE_URL`; sem token, `sync` continua local e não simula sincronização remota.
- O parser é genérico. Nenhum campo acadêmico é validado contra a interface real nesta entrega sem uma execução autenticada autorizada.

Consulte `docs/fecap-portal/` para segurança, esquema, endpoints e troubleshooting.
