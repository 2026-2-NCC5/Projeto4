# Conector local do Portal Educacional FECAP

Este módulo integra o ASA Conecta a um coletor Python local baseado em Scrapling. O navegador usa a sessão da própria pessoa, trabalha em modo somente leitura e não contorna MFA, CAPTCHA nem controles de acesso. Nenhum login real foi executado nesta implementação porque não foram fornecidas credenciais; o inventário real permanece vazio até execução pelo estudante.

## Componentes

- `src/Entrega_2/Backend/fecap-collector`: CLI, navegador dinâmico Scrapling, parser, armazenamento local privado e cliente de sincronização.
- `src/Entrega_2/Backend/api/src/portal`: conexão por token pessoal revogável, endpoints e persistência PostgreSQL.
- `src/Entrega_2/Frontend/screens/PortalIntegrationScreen.tsx`: conexão, revogação e visualização do último inventário.

## Início rápido

1. Leia [INSTALLATION.md](INSTALLATION.md) e instale as dependências do Python.
2. Copie o `.env.example` para `.env` dentro de `fecap-collector`; nunca preencha credenciais no app ou no ASA.
3. Execute `fecap-portal healthcheck` e `fecap-portal login`. O usuário é solicitado no terminal e a senha usa prompt oculto. MFA/CAPTCHA é concluído manualmente.
4. Crie a conexão na tela Portal Educacional do ASA Conecta. O token é exibido uma única vez, é pessoal e revogável; configure-o localmente no `.env`.
5. Execute `fecap-portal scan --read-only`; revise o mapa local e então habilite sincronização se quiser enviar o inventário ao ASA.

O primeiro modo é coleta local. A sincronização remota é desabilitada por padrão. A senha não é persistida pelo conector; sessão persistente é opcional, cifrada e protegida por frase secreta local.

## Limites verificados

- A API TOTVS/FECAP não foi presumida nem acessada por endpoints privados.
- O escopo atual fica em `portal.fecap.br`; links para outros domínios só aparecem no inventário.
- O crawler visita até 300 estados e profundidade 8, respeitando pausa configurada; só expande navegação e abas ARIA consultivas.
- O parser coleta texto e tabelas que podem incluir dados pessoais. Arquivos locais ficam em `.private` com permissões restritas; a sincronização transmite inventário à API autenticada do ASA.
- Nenhuma assinatura, requerimento, matrícula, alteração ou pagamento é submetido.
- A cobertura real depende de observar a interface autenticada e adaptar extratores quando o layout mudar.

## Documentação

Veja os guias nesta pasta para instalação, autenticação, formato, API, sincronização, segurança e limitações.

Diagramas: [arquitetura](ARCHITECTURE.md) e [fluxo](WORKFLOWS.md). Contrato: [OpenAPI](openapi.yaml). Deploy: [orientações](DEPLOYMENT.md).
