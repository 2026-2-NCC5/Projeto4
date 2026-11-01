# Conector local do Portal Educacional FECAP

Este módulo contém um coletor Python local experimental baseado em Scrapling e uma tela de status no ASA Conecta. Não existe SSO/API institucional confirmados ou integrados. O navegador do coletor pode usar a sessão da própria pessoa em modo somente leitura, sem contornar MFA, CAPTCHA nem controles de acesso, mas seu uso conectado depende de autorização da FECAP. Nenhum login real foi executado nesta implementação; o inventário real permanece vazio até execução autorizada pelo estudante.

## Componentes

- `src/Entrega_2/Backend/fecap-collector`: CLI, navegador dinâmico Scrapling, parser, armazenamento local privado e cliente de sincronização.
- `src/Entrega_2/Backend/api/src/portal`: conexão por token pessoal revogável, endpoints e persistência PostgreSQL.
- `src/Entrega_2/Frontend/screens/PortalIntegrationScreen.tsx`: conexão, revogação e visualização do último inventário.

## Início rápido

1. Leia [INSTALLATION.md](INSTALLATION.md) e instale as dependências do Python.
2. Copie o `.env.example` para `.env` dentro de `fecap-collector`; nunca preencha credenciais no app ou no ASA.
3. Execute `fecap-portal healthcheck` e `fecap-portal login`. O usuário é solicitado no terminal e a senha usa prompt oculto. MFA/CAPTCHA é concluído manualmente.
4. A tela Portal Educacional do ASA Conecta pode emitir um token pessoal para sincronização local. Isso não autentica no Portal FECAP e não equivale a integração institucional. O token é exibido uma única vez e revogável.
5. Só execute o coletor conectado após autorização institucional. A API descarta conteúdo de páginas e guarda apenas metadados mínimos do mapa.

O primeiro modo é coleta local. A sincronização remota é desabilitada por padrão. A senha não é persistida pelo conector; sessão persistente é opcional, cifrada e protegida por frase secreta local.

## Limites verificados

- A API TOTVS/FECAP não foi presumida nem acessada por endpoints privados.
- O escopo atual fica em `portal.fecap.br`; links para outros domínios só aparecem no inventário.
- O crawler visita até 300 estados e profundidade 8, respeitando pausa configurada; só expande navegação e abas ARIA consultivas.
- O parser pode ler texto/tabelas na sessão local, que ficam em `.private` com permissões restritas. A sincronização envia o inventário à API autenticada do ASA; o servidor descarta conteúdo de páginas, tabelas, URLs, formulários, documentos e mensagens, persistindo metadados mínimos.
- Nenhuma assinatura, requerimento, matrícula, alteração ou pagamento é submetido.
- A cobertura real depende de observar a interface autenticada e adaptar extratores quando o layout mudar.

## Documentação

Veja os guias nesta pasta para instalação, autenticação, formato, API, sincronização, segurança e limitações.

Diagramas: [arquitetura](ARCHITECTURE.md) e [fluxo](WORKFLOWS.md). Contrato: [OpenAPI](openapi.yaml). Deploy: [orientações](DEPLOYMENT.md).
