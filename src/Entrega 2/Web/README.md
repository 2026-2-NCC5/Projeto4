# ASA Conecta — portal web

Portal com três áreas sobre a **mesma API** do app:
- `/aluno`: estudante;
- `/asa`: equipe da Área do Sucesso Alvarista;
- `/admin`: administração.

React 19, Vite 8, TypeScript, Tailwind CSS 4, React Router 7, TanStack Query 5 e lucide-react. Sem bibliotecas de
componentes: diálogos nativos (`<dialog>`), gráficos SVG próprios.

## Rodar

```bash
npm install
npm run dev          # http://localhost:5173 — o Vite repassa /api e /health para a API (VITE_API_PROXY_TARGET, padrão :3000)
npm run build        # tsc -b + vite build → dist/
npm run preview      # serve dist/ com o mesmo proxy
```

A API precisa estar no ar (ver o runbook em
`documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/plataforma/DEPLOYMENT_RUNBOOK.md`). No
Compose, o serviço `web` (este `Dockerfile`, nginx) publica o portal em http://localhost:8080.

## Verificações

```bash
npm run typecheck && npm run lint && npm test     # Vitest + Testing Library (jsdom)
npx playwright test                               # E2E contra a pilha local (API :3000 + Vite :5173)
```

O E2E (`e2e/`) entra uma vez por perfil (projeto `setup`) e reaproveita a sessão. Ele lê a senha das contas
fictícias das fixtures da API (ou de `E2E_DEMO_PASSWORD`). O cenário "demonstração desligada" roda quando
`E2E_DEMO_OFF_URL` aponta para um portal ligado a uma API com `DEMO_DATA_ENABLED=false`, como faz o CI.

## Organização

| Pasta | Conteúdo |
|---|---|
| `src/app/` | Roteador e rotas por área (`routes/{student,asa,admin,appointments,insights}.tsx`, carregamento sob demanda) |
| `src/layouts/` | `AppShell` (menu por área, faixa de demonstração), `nav.ts` (menu com permissão e recurso de cada item) |
| `src/features/` | Domínios: `auth` (sessão e guardas), `platform`, `support`, `appointments`, `knowledge`, `insights`, `admin`, `academic`, `assistant`, `notifications` |
| `src/pages/` | Páginas por área (`student/`, `asa/`, `admin/`, `insights/`, `shared/`, `public/`, `auth/`) |
| `src/components/` | Componentes compartilhados (`ui/`, `feedback/`, `data/`, `content/`) |
| `src/services/api/` | Cliente HTTP: cookies e CSRF, uma renovação de sessão por vez, sem repetição automática de alterações |
| `src/types/api.ts` | **Cópia** do contrato canônico (`Backend/contracts/api/mobile-api.v1.ts`). Não edite aqui: o CI confere a igualdade. |
| `e2e/` | Playwright (perfis, chamado entre canais, agendamentos, demonstração desligada) |
| `deploy/` | Template do nginx e cabeçalhos de segurança da imagem |

## Regras

- **Sessão só por cookie HttpOnly.** Nada de token em `localStorage`/`sessionStorage`. Alterações levam
  `X-CSRF-Token`.
- **A API decide permissões.** Menus e guardas só evitam telas inúteis. Toda tela trata 401, 403, 404, 409 e 503
  (`database_required`, `feature_disabled`).
- **Dados honestos.** Mostre o `source` e o modo de dados que a API devolve. Nunca invente números e nunca caia
  em dados simulados.
- **Visual:**
  - tema claro;
  - sem gradientes nem brilho;
  - verde `#0D6D53` só para ações, links e foco;
  - uma `Surface` com lista em vez de um cartão por item;
  - ícones de 20 px, cantos de até 16 px;
  - sem rolagem horizontal da página em 390 px;
  - contraste AA.
- **Variáveis `VITE_*`** são públicas e vão para o navegador. Nunca coloque segredos nelas.
