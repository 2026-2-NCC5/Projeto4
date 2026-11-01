# Referência visual FECAP — baseline implementada

Referência consultada em `https://www.fecap.br/` em 31/10/2026. Uma captura automatizada do topo da homepage identificou: barra superior verde escura com links sociais e Portal do Aluno; cabeçalho branco com wordmark FECAP; navegação horizontal em dez áreas; hero de mídia em largura total; atalhos sobrepostos para níveis de ensino; seção de notícias; e uma barra fixa inferior com WhatsApp, ASA e Tour Virtual.

## Tokens usados no shell local

- Verde profundo: `#003d2f`.
- Verde de destaque: `#00a875` / `#00c889`.
- Fundo branco e superfícies cinza-esverdeadas claras.
- Texto verde escuro: `#063d30`.
- Borda clara: `#e2e9e5`.
- Logotipo FECAP existente em `public/brand/fecap-logo.svg`.

As cores são aproximações visuais observadas no browser, não tokens oficiais fornecidos pela FECAP. O layout local mantém light mode. O menu desktop abre por clique/hover e Escape; o menu mobile expande categorias em accordions. As preferências `prefers-reduced-motion` globais do projeto continuam valendo.

As imagens de campanha atuais são carregadas do domínio oficial da FECAP. A distribuição de uma cópia local depende de autorização institucional dos ativos. Notícias, formulários e dados acadêmicos não são inventados quando a fonte não foi integrada.
