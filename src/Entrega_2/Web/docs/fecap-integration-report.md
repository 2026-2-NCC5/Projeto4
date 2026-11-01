# Relatório de integração institucional FECAP

## Já conectado

- O domínio público do Projeto4 agora abre a experiência institucional FECAP.
- A antiga página pública ASA foi preservada em `/asa-conecta` e os links de marca internos apontam para ela.
- O shell institucional tem cabeçalho desktop/mobile, navegação por grupos, links para Portal do Aluno, rodapé institucional, barra inferior e atalho de retorno ao topo.
- O catálogo de Graduação apresenta os dez cursos de graduação listados no menu oficial e permite pesquisar.
- O curso abre template local e mantém link para a fonte oficial dos dados atualizados.
- As rotas de equipe `/asa`, aluno `/aluno` e administração `/admin` continuam protegidas; o caminho público ASA é `/institucional/asa/`.
- A aplicação permanece em light mode e as páginas do clone têm diretiva `noindex, nofollow`.

## Não integrado / pendente

- Não há CMS ou API pública de conteúdo FECAP configurada no projeto. A REST API pública testada respondeu HTTP 401. Notícias, cursos não graduação, eventos, banners e páginas longas ainda não foram sincronizados.
- As rotas que não foram transcritas usam um template explicativo com link para a página oficial; isso não é uma reprodução integral.
- Formulários institucionais ficam nos canais oficiais; nenhum envio é simulado.
- As imagens do portal são carregadas de URLs públicas da FECAP e precisam de validação de direitos antes de empacotamento ou produção.
- Não há cobertura visual completa ou crawler HTTP de todas as URLs. O inventário lista sitemap entries, inclui apenas uma amostra de status verificados e pode conter conteúdo CMS não navegável.
- Não foram alterados banco, backend, serviços Python, integrações acadêmicas ou contratos do ASA-Conecta nesta tarefa.

## Homologação

Executar `npm run fecap:audit` para atualizar a lista a partir de robots.txt e sitemap index; `npm run fecap:check -- --max-pages 100` para retomar verificação de status em pequenos lotes; `npm run fecap:screenshots` para capturas de referência; e `npm run fecap:e2e` para os três testes Playwright da navegação pública.
