# Administração — interface e fluxos

## Estrutura

A área `/admin` mantém as páginas e endpoints existentes da plataforma. O shell organiza a navegação em Administração, Gestão, Inteligência e Governança; links são filtrados pela permissão da sessão, enquanto o servidor continua sendo a autoridade final em cada operação.

- Visão geral, saúde, metadados de chamados.
- Usuários e equipe: busca, filtros persistidos na URL, convite, detalhe, papel, ativação, sessões e auditoria.
- Papéis e perfis: visão dos papéis e totais retornados pela API.
- Permissões: matriz de consulta retornada pela API.
- SLA, automações, base de conhecimento, agente, integrações, métricas, auditoria e configurações.

## Papéis e permissões

A tela **Papéis e perfis** é de consulta, pois não existe endpoint autorizado para criar ou editar perfis. Papéis de equipe são atribuídos no detalhe de uma conta por operação autenticada da API. Contas de aluno permanecem associadas ao vínculo de aluno. A matriz de permissões é somente leitura e vem de `GET /api/admin/permissions`.

## Componentes e estados

- `Dialog` e `ConfirmDialog` usam Radix Dialog, com foco controlado, Escape e overlay. Gavetas são modais por padrão; uma tela pode declarar comportamento não modal quando precisa manter a navegação de fundo disponível.
- `ToastProvider` usa Radix Toast: sucesso/informação expiram; erros permanecem até serem fechados.
- Menus de conta usam Radix Dropdown Menu; notificações usam Radix Popover; tooltips ajudam quando a barra lateral está recolhida.
- Ações destrutivas e mudanças de papel pedem confirmação, mostram estado de envio e mantêm o erro da API no diálogo.
- Falhas de renderização são capturadas por `AppErrorBoundary`, que oferece recarga e apresenta aviso.
- Movimento respeita `prefers-reduced-motion`; o tema continua exclusivamente claro.

## Verificação local

- `npm run build`: aprovado.
- `npm run lint`: aprovado após corrigir sincronização de formulários que usavam `setState` em efeitos.
- `npm test -- --reporter=dot`: 268 testes aprovados em 47 arquivos.
- `npm audit --omit=dev --audit-level=moderate`: nenhuma vulnerabilidade em dependências de produção. O conjunto de desenvolvimento ainda reporta alertas no audit completo; não foi aplicado `npm audit fix` para evitar atualização ampla e não revisada da toolchain.
- Perfis e permissões continuam de consulta porque a API não oferece endpoints de edição de matriz ou criação de papéis.

## Limite de autorização

O menu e as telas ocultam operações sem a permissão da sessão para orientar a navegação. Eles não substituem autorização no backend. Não adicione edição local de matrizes, permissões ou perfis sem contrato, endpoint, política de auditoria e revisão de segurança no servidor.
