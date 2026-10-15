# Segurança e proteção de dados (LGPD)

Escopo: API Express, portal web, app Expo e banco PostgreSQL do ASA Conecta. Este documento descreve o que
**está implementado e testado**. O que falta aparece em [Pendências](#pendências-conhecidas), sem
maquiagem. O ASA Conecta é um projeto acadêmico: base legal, prazos de retenção e o canal do titular
precisam ser definidos pela FECAP (encarregado de dados) antes de qualquer uso com dados reais.

## 1. Sessões e autenticação

| Canal | Credencial | Onde fica | Validade |
|---|---|---|---|
| App (Expo) | JWT de acesso (Bearer) + refresh rotativo | `expo-secure-store` (Keychain/Keystore) | acesso 15 min; refresh 12 h ou 30 dias com "Manter conectado" |
| Portal web | Cookie `asa_at` (acesso) + `asa_rt` (refresh) | Cookies **HttpOnly**, `SameSite=Strict`, `Secure` em produção | iguais aos do app |

- O portal **nunca** guarda token em `localStorage`/`sessionStorage`. O teste E2E de login confere que não há
  JWT no `localStorage` e que `asa_at` é HttpOnly.
- `asa_at` só é enviado para `/api`. `asa_rt` só é enviado para `/api/web/auth`, ou seja, só a rota de renovação
  recebe o refresh.
- **CSRF**: toda alteração autenticada por cookie exige o cabeçalho `X-CSRF-Token` igual ao cookie `asa_csrf`
  (duplo envio) **e** uma origem listada em `WEB_ORIGINS`. Requisições com Bearer (o app) não usam cookie e
  não passam por essa checagem.
- **Revogação imediata**: toda requisição confere a sessão no banco. Sair, "encerrar outras sessões",
  "sair de todos os aparelhos", encerramento pela administração, troca de papel e desativação fazem o token
  antigo falhar na próxima requisição (`401 session_revoked`).
- **Refresh rotativo por família e por canal**: cada renovação troca o refresh. Um refresh do portal não
  renova uma sessão do app, e vice-versa.
- **Limites por IP** (janela fixa): login 20/10 min, cadastro 10/h, renovação 60/10 min, recuperação de senha
  10/15 min, verificação de código 20/15 min. Contas de demonstração ficam bloqueadas quando
  `DEMO_DATA_ENABLED=false` (`403 demo_account_disabled`).
- **Senhas** com bcrypt. A recuperação usa código numérico de uso único, com expiração, limite de tentativas e
  intervalo entre reenvios. Convites de equipe criam a conta com senha aleatória **inutilizável**; a pessoa
  define a própria senha pelo código enviado por e-mail. Sem e-mail configurado, o convite informa que nada
  foi enviado.

## 2. Autorização

Papéis, permissões e regras de governança estão em [ROLE_PERMISSION_MATRIX.md](ROLE_PERMISSION_MATRIX.md). Em resumo:

- A matriz `ação:recurso[:escopo]` é aplicada **no servidor** em cada rota. Os menus dos clientes só escondem
  opções.
- O aluno é sempre identificado pela sessão (`studentId` nunca vem do cliente). Recursos de outro aluno
  retornam `403`.
- A administração **não lê** conteúdo de chamados. Para ela existem só metadados: protocolo, categoria,
  situação, prazo.
- Negações (`403`) são auditadas (`authz.denied`), com a rota e a permissão negada.

## 3. Dados pessoais tratados

| Dado | Onde | Quem acessa | Observações |
|---|---|---|---|
| Nome, e-mail institucional, papel, senha (hash) | `users` | Própria pessoa; administração (lista de contas) | E-mail só de domínios permitidos (`SIGNUP_ALLOWED_EMAIL_DOMAINS`) |
| RA, curso | `students` | Própria pessoa; equipe ASA **só** de alunos com histórico de atendimento | Cada consulta ao contexto do aluno é auditada (`student_context.viewed`) |
| Disciplinas, notas, frequência, pendências | tabelas acadêmicas | Só o próprio aluno | Hoje **fictícias** (seed); a fonte institucional não está integrada (ver §6) |
| Chamados: assunto, descrição, mensagens, anexos | `support_*` | Aluno dono; equipe ASA | Notas internas nunca chegam ao aluno; anexos com tipo e tamanho limitados e link de download assinado e temporário |
| Agendamentos: horário, modalidade, observações | `appointments*` | Aluno dono; equipe ASA | Anotação interna da equipe nunca chega ao aluno |
| Avisos | `user_notifications`, `support_notifications` | Própria pessoa | — |
| Token de push do aparelho | tabela de aparelhos | Só o backend | Só com permissão do aparelho; push não carrega conteúdo sensível |
| Trilha de auditoria | `audit_events` | Administração (completa); cada pessoa (a própria) | **Somente inserção** (gatilho bloqueia alteração e exclusão); IP e e-mail viram pseudônimos HMAC |

### Minimização e pseudonimização

- **Auditoria**: grava quem (id e papel), o quê (ação, recurso), resultado, canal e correlação. IP e e-mail viram
  pseudônimos estáveis (HMAC com chave derivada do segredo do servidor), o que permite correlacionar
  tentativas sem guardar o dado. Os metadados passam por filtro: chaves com `pass`, `token`, `secret`, `cookie`,
  `authorization`, `email`, `phone`, `cpf`, `content`, `message`, `body`, `text` ou `ip` são descartadas, textos
  são cortados em 200 caracteres e há no máximo 20 chaves.
- **Relatórios**: o CSV da equipe (`/api/asa/reports/tickets.csv`) não tem nome, e-mail nem RA. Células que
  começam com `= + - @` são neutralizadas (injeção de fórmula). Cada exportação é auditada.
- **Indicadores**: métricas e visões da administração são agregadas e não identificam alunos.
- **Chaves derivadas**: links de anexo, pseudônimos da auditoria e outros usos têm chaves próprias, derivadas do
  segredo do servidor por HMAC com rótulos distintos. O segredo do JWT nunca é usado diretamente para outra
  finalidade.

## 4. Separação entre demonstração e dados reais

Ver [DEMO_DATA_POLICY.md](DEMO_DATA_POLICY.md). Contas `@demo.asa` são marcadas no banco (`users.is_demo`). Os
clientes mostram "DEMONSTRAÇÃO — Dados fictícios" em todas as telas. Com `DEMO_DATA_ENABLED=false`:

- nenhuma conta fictícia entra;
- consultas da equipe e da administração ignoram dados fictícios;
- a fonte acadêmica fictícia responde `503 academic_source_unavailable`.

Não existe fallback silencioso para dados simulados.

## 5. Infraestrutura e cabeçalhos

- API: `helmet` e `Cache-Control: no-store` em `/api/*`. O cabeçalho `X-ASA-Data-Mode` informa o modo de dados.
- Portal (nginx do Compose):
  - CSP restrita à própria origem (sem scripts ou fontes de terceiros), `frame-ancestors 'none'`,
    `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (câmera, microfone e localização
    desligados) e `Cross-Origin-Opener-Policy`.
  - O portal usa a API **pela mesma origem** (proxy `/api`), por isso os cookies não dependem de CORS.
- Compose: banco, Mailpit e Agent Service ficam publicados só em `127.0.0.1`. A API fica na rede local para o
  app no celular.
- `TRUST_PROXY` só deve ser ligado atrás de um proxy conhecido. Caso contrário, o limite por IP seria burlável
  via `X-Forwarded-For` (ver [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md)).
- Segredos nunca vão para `VITE_*` ou `EXPO_PUBLIC_*`, que só levam URLs públicas. `.env` não é versionado e os
  `.env.example` só têm valores de desenvolvimento ou espaços reservados.
- Seeds fictícios nunca rodam em produção. Em banco remoto, só rodam com `DEMO_SEED_ALLOW_REMOTE=true`. O
  projeto não usa `db:reset`, `DROP SCHEMA` nem `db push` em ambientes compartilhados.

## 6. Integrações externas (postura)

| Integração | Situação | Garantias |
|---|---|---|
| Portal do Aluno / TOTVS | **Não integrada** | Nada é automatizado com a senha do aluno. Sem autorização e sem API oficial, a fonte acadêmica real responde 503 com aviso honesto. |
| Fila presencial (presencial.fecap.br) | Simulador por padrão | O painel público só é consultado com `ASA_QUEUE_PROVIDER=fecap`. Sem `ASA_QUEUE_SOURCE_AUTHORIZED=true`, os clientes mostram "fonte sem autorização institucional registrada". Nenhum dado pessoal é enviado à fonte. |
| JEV (IA) | **Planejada e desligada** | Sem contrato técnico. O adaptador não faz chamadas (ver [JEV_INTEGRATION_ADR.md](../adr/JEV_INTEGRATION_ADR.md)). |
| Expo Push | Opcional | Exige build EAS. O texto do push é curto e sem conteúdo do chamado. |
| E-mail (SMTP) | Recuperação de senha e convites | Mensagens sem dados além do necessário (nome e código). |
| SSO da FECAP | Planejado | Depende de credenciais e autorização da instituição. |

## Pendências conhecidas

1. **Retenção**: não há expurgo automático. Antes de dados reais, faltam regras para:
   - chamados encerrados;
   - anexos;
   - auditoria;
   - avisos;
   - sessões expiradas.
2. **Direitos do titular**: o aluno vê e gerencia a própria conta e as próprias sessões, mas não há exportação
   nem exclusão self-service. Hoje esses pedidos dependem de atendimento manual da instituição.
3. **Base legal e aviso de privacidade**: `TERMS_URL` e `PRIVACY_URL` existem como configuração, mas os textos
   oficiais precisam vir da FECAP.
4. **Limite por IP atrás de proxy**: no Compose local, o portal passa pelo nginx e todos os usuários do portal
   compartilham o mesmo IP de origem. Em produção, o proxy reverso deve ser o único ponto de entrada (ver
   runbook).
5. **Push**: não chega a nenhum aparelho sem build EAS (`projectId`). O canal garantido é a central de avisos.
6. **Reuso de refresh token**: um refresh já rotacionado deixa de valer (`401 session_expired`). Mas não há
   detecção de reuso que encerre a família inteira, como recomenda o OAuth Security BCP para o caso de alguém
   usar um token roubado primeiro. Implementar isso exige uma janela de tolerância para abas que renovam ao
   mesmo tempo.
7. **Limites de taxa por processo**: os limites ficam em memória. Com várias instâncias da API, o limite
   efetivo multiplica (ver runbook §5).
