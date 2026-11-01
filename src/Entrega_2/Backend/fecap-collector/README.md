# Conector local do Portal Educacional FECAP

Serviço Python local para login do próprio estudante, descoberta de navegação e extração somente leitura com Scrapling. O portal nunca recebe ações de escrita pelo crawler. O navegador é visível por padrão; MFA/CAPTCHA interrompe o fluxo para confirmação humana. A tela autenticada do ASA Conecta pode iniciar a leitura e consultar os textos/tabelas capturados no próprio navegador, através do agente local em `127.0.0.1:8765`.

## Instalação

```bash
cd src/Entrega_2/Backend/fecap-collector
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
python -m pip install -e '.[test]'
scrapling install
cp .env.example .env       # Windows: copy .env.example .env
```

O `.env` fica ignorado pelo Git. A senha é solicitada com entrada oculta no terminal; o conector ignora `FECAP_PASSWORD` mesmo que a variável exista em ambientes antigos. Por padrão, os dados ficam fora do projeto em `~/.asa-conecta/fecap-data`, com retenção de 60 minutos e uma única execução; é possível ajustar `FECAP_DATA_RETENTION_MINUTES`. Para sessão persistente, defina `FECAP_SESSION_PERSIST=true`; a frase de cifragem é solicitada pelo terminal e o estado é salvo cifrado localmente.

## Comandos

```bash
python -m fecap_collector login
python -m fecap_collector discover
python -m fecap_collector scan --read-only
python -m fecap_collector export-map
python -m fecap_collector sync
python -m fecap_collector healthcheck
fecap-portal serve
```

Para mostrar a extração no ASA Conecta Web, configure `ASA_INTERNAL_SYNC_TOKEN` com o token emitido na tela Portal FECAP, mantenha `FECAP_SYNC_ENABLED=false` e inicie `fecap-portal serve` em um terminal interativo. O botão de leitura abre o navegador local; conclua o login somente no site oficial. A origem da aplicação precisa constar exatamente em `ASA_LOCAL_ALLOWED_ORIGINS`. Em publicação HTTPS, navegadores Chromium podem pedir permissão de rede local; permita o acesso de loopback para o ASA Conecta. O agente não transmite os dados extraídos à API ASA; a leitura do navegador é local, autenticada pelo token e marcada `Cache-Control: no-store`.

`discover`/`scan` abrem o navegador, aguardam login e MFA manual se necessário, seguem apenas navegação HTTPS no host `portal.fecap.br`, esperam o intervalo configurado e gravam dados locais em arquivos com modo `0600` sob diretório `0700`. Nenhuma varredura real é considerada validada até que o estudante a execute com sua sessão. A sincronização envia o inventário à API ASA, que descarta o conteúdo e persiste somente metadados mínimos do mapa. Não habilite envio conectado sem autorização institucional.

## Limites declarados

- Não usa `StealthySession`, fingerprint spoofing, proxy, CAPTCHA solver ou endpoints descobertos fora da interface.
- Menus/links/rotas e tabs semânticas são descobertos dinamicamente; elementos com comportamento ambíguo são inventariados, não acionados.
- Arquivos de documentos podem ser catalogados, mas não baixados automaticamente nesta versão.
- A tela web consulta o agente local autenticado e exibe somente a extração daquela sessão do estudante; isso não equivale a SSO/API institucional. Exportação remota para ASA continua desabilitada por padrão. Se habilitada, envia somente métricas de execução e um identificador derivado; não envia páginas, URLs, títulos, notas, documentos ou tabelas.
- O parser é genérico. Nenhum campo acadêmico é validado contra a interface real nesta entrega sem uma execução autenticada autorizada.

Consulte `docs/fecap-portal/` para segurança, esquema, endpoints e troubleshooting.
