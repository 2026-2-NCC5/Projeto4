# ADR-008 — Portal web, sessão por cookie e autorização por permissões

- **Status:** aceito (2026-10-15)
- **Substitui em parte:** a consequência do ADR-001 de que "perfis `institutional_staff` e `technical_admin`
  não possuem funcionalidades no MVP". O ADR-006 já havia criado a fila da equipe; este ADR consolida a
  decisão para os três perfis.

## Contexto

O ASA Conecta nasceu como app Expo para o aluno. A Entrega 2 pede:

- um **portal web** com três áreas: aluno (`/aluno`), equipe ASA (`/asa`) e administração (`/admin`);
- a **mesma** API Express e o **mesmo** PostgreSQL, sem duplicar regras nem dados;
- que o app continue funcionando.

A API só aceitava Bearer. Num navegador, isso empurraria o token para `localStorage`, que fica exposto a XSS.
O papel vinha só do JWT, por até 15 minutos. A administração conseguia ler o conteúdo completo dos chamados.

## Decisões

1. **Portal web** em `src/Entrega_2/Web` (React 19, Vite 8, TypeScript, Tailwind 4, React Router 7, TanStack
   Query). Usa a API **na mesma origem**: o proxy do Vite em desenvolvimento e o nginx no Compose ou em produção.
   Por isso não há CORS para cookies.
2. **Sessão web por cookie:**
   - `asa_at` (acesso) e `asa_rt` (renovação) são HttpOnly, `SameSite=Strict` e `Secure` em produção;
   - os caminhos são restritos (`/api` e `/api/web/auth`);
   - **CSRF** por duplo envio (`asa_csrf` + `X-CSRF-Token`) com verificação de origem (`WEB_ORIGINS`).

   O app mantém Bearer + SecureStore, sem mudança de contrato.
3. **Sessão verificada a cada requisição:**
   - o token aponta para uma sessão no banco;
   - sair, encerrar sessões, trocar papel ou desativar a conta derruba o acesso na requisição seguinte;
   - as sessões são agrupadas por família e canal: o portal lista "seus aparelhos e navegadores".
4. **Autorização por permissões** `ação:recurso[:escopo]` (`auth/permissions.ts`), aplicadas no servidor rota a
   rota, mais a verificação de titularidade. Negações são auditadas.
5. **Separação de funções:**
   - a equipe ASA atende (conteúdo dos chamados, agenda, contexto do aluno);
   - a administração governa (contas, permissões, SLA, automações, integrações, saúde, parâmetros, auditoria)
     e vê **apenas metadados** dos chamados;
   - o aluno vê só o que é dele.
6. **Contas da equipe e da administração por convite** (sem cadastro aberto). Regras:
   - ninguém muda o próprio papel;
   - conta de aluno não vira equipe;
   - sempre resta uma administração ativa, com garantia transacional.
7. **Trilha de auditoria** só de inserção (gatilho no banco), com IP e e-mail pseudonimizados.
8. **Contrato v1.5–v1.8 aditivo**, com uma terceira cópia em `Web/src/types/api.ts`, conferida pelo mesmo script
   de CI que já protege o app.

## Alternativas consideradas

- **Token no `localStorage` do portal:** rejeitada (exposição a XSS e contrária ao pedido do projeto).
- **BFF separado para o portal:** rejeitada. Duplicaria regras e criaria uma segunda fonte de verdade. O
  proxy de mesma origem resolve os cookies.
- **Segundo banco ou Prisma:** rejeitada. O PostgreSQL atual, com migrations aditivas, atende.
- **RBAC só pelo papel (`if role === …`):** rejeitada. A matriz de permissões permite um perfil novo sem
  espalhar condicionais, e o teste "equipe só leitura" prova que cada escrita exige a própria permissão.

## Consequências

- O mesmo aluno usa o app e o portal com a mesma conta. Um chamado aberto num canal aparece no outro. A equipe
  responde pelo portal e o aluno lê no app (E2E e integração).
- O portal exige proxy de mesma origem em qualquer implantação (documentado no runbook).
- Atrás de proxy, `TRUST_PROXY` precisa ser configurado com cuidado: limite de login por IP.
- Detalhes:
  - [ARCHITECTURE_TARGET.md](../plataforma/ARCHITECTURE_TARGET.md)
  - [ROLE_PERMISSION_MATRIX.md](../plataforma/ROLE_PERMISSION_MATRIX.md)
  - [SECURITY_AND_LGPD.md](../plataforma/SECURITY_AND_LGPD.md)
