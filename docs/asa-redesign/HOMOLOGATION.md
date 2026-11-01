# Homologação — ASA Light Mode

## Implementado

- Navegação pública com início, Conheça o ASA, Cesta de Serviços, Carreira, Empresas, Equipe e Atendimento.
- Campo de busca com normalização de caixa e acentos para registros oficiais destacados.
- Filtros por nome de categoria, busca, ordenação e estado vazio; categoria e termo ficam na URL.
- Navegação mobile com fechamento por Escape e ao selecionar um destino.
- Área autenticada e administrativa permanecem na aplicação existente e usam tokens claros globais. A faixa administrativa usa verde de ação.
- `color-scheme: light` no HTML/CSS global e nos controles nativos; não há seletor de tema nem regras `dark:` ou `prefers-color-scheme` na aplicação web.
- Links oficiais de carreira, empresas, atendimento, privacidade, acessibilidade e validação documental.

## Verificações executadas

- `npm run build`: aprovado.
- `npm run lint`: aprovado.
- `npm test`: 44 arquivos e 262 testes aprovados.

## Pendências para homologação institucional

- Validar institucionalmente o conteúdo e o inventário de serviços antes da publicação.
- Para espelhar o catálogo completo, definir fonte autorizada (API/CMS ou exportação institucional) e importar os registros com seus campos oficiais. Até essa integração, a Cesta da FECAP continua sendo a fonte dos detalhes completos.
- Teste visual manual com emulação de sistema operacional em dark mode e tamanhos móveis; não executado neste ambiente.
- Playwright E2E, auditoria WCAG automatizada, auditoria de links, Lighthouse/Core Web Vitals e teste de leitores de tela ainda não executados. Uma tentativa de conferir o Light Mode em navegador com `colorScheme: dark` foi bloqueada porque o Chromium do Playwright não está instalado no ambiente.
- Definir domínio/canonical, sitemap, robots, redirects e URLs finais junto à equipe institucional antes do deploy. Nenhuma publicação foi realizada.
- Confirmar a manutenção das fotografias e cargos da equipe na data de homologação.
