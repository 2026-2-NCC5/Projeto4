# ASA Match

Camada complementar de descoberta e recomendação de oportunidades para o ASA Conecta. Não substitui o FECAP+ Oportunidades e não presume sincronização com os sistemas da FECAP.

## Estado desta implementação

- Perfil profissional e preferências persistidos por estudante.
- Catálogo, filtros, salvar, feedback e acompanhamento manual de candidaturas.
- Motor determinístico de afinidade, com fatores, avisos e versão do algoritmo.
- Adaptadores server-side para quadros públicos Greenhouse e Lever. Fontes são cadastradas desativadas e não podem ser aprovadas sem referência de autorização.
- Coletas idempotentes em fila no PostgreSQL, processadas pelo cron existente na Vercel. Alertas in-app persistidos são entregues pelo mesmo ciclo.
- Painel administrativo para fontes, execuções e métricas agregadas.
- Interface exclusivamente clara em `/aluno/oportunidades` e fontes em `/admin/oportunidades`.

Não há fontes externas aprovadas/configuradas por padrão, dados reais de vagas sem coleta autorizada, API do FECAP+ conectada, currículo/upload, geocodificação, distância por rota, e-mail/push, candidaturas sincronizadas ou embeddings. O catálogo fica vazio até que uma fonte autorizada seja configurada. A aplicação não inventa vagas de demonstração.

## Inicialização

1. Configure PostgreSQL no ambiente da API.
2. Execute a migration `015_asa_match.sql` pelo fluxo normal de migrations da API.
3. Configure `CRON_SECRET` para que o endpoint interno possa executar via cron da Vercel.
4. Suba a API e o frontend conforme `src/Entrega_2/Backend/api/README.md` e `src/Entrega_2/Web/README.md`.
5. Conceda `settings:manage` aos administradores de fontes.
6. Cadastre apenas um quadro Greenhouse ou Lever cujo uso tenha sido autorizado. Informe a referência de autorização; aprove e habilite conscientemente.
7. O cron executa a coleta. Uma solicitação manual apenas enfileira a execução.

### Verificação local

```bash
cd src/Entrega_2/Backend/api
npm run typecheck
npm run build
npm test
npm run lint

cd ../../Web
npm run typecheck
npm run build
npm test -- --reporter=dot
```

## Referências de integração

- A página da FECAP descreve FECAP+ Oportunidades como serviço existente de empregabilidade e carreira. O ASA Match o mantém como destino oficial separado: https://www.fecap.br/asa/cesta-de-servicos/s/empregabilidade-carreira/
- Lever publica uma API de postings de quadros de emprego: https://github.com/lever/postings-api
- Greenhouse publica uma Job Board API: https://developers.greenhouse.io/job-board.html

Disponibilidade pública de API não é, por si só, uma licença de reutilização de conteúdo. A autorização, os termos, atribuição e limites devem ser conferidos para cada quadro/fonte antes de ativar coleta.

Mais detalhes: [arquitetura](ARCHITECTURE.md), [fontes](SOURCES.md), [API](API.md), [segurança](SECURITY.md), [resultado de qualidade](TEST_REPORT.md).
