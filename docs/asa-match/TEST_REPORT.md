# Relatório de qualidade ASA Match

Validação local desta implementação (2026-10-31):

- API: `npm run typecheck` aprovado; `npm run build` aprovado; `npm run lint` aprovado; `npm test`: 22 arquivos e 345 testes aprovados.
- Web: `npm run typecheck` aprovado; `npm run build` aprovado; `npm run lint` aprovado; `npm test -- --reporter=dot`: 47 arquivos e 268 testes aprovados.
- `git diff --check` aprovado.
- Testes do banco contra PostgreSQL e aplicação de migration não executados neste ambiente.
- Nenhuma varredura externa real foi executada: não há fonte aprovada cadastrada nem dados reais coletados.

Cobertura automatizada adicionada: testes unitários do motor de compatibilidade para equivalência de curso/skills/localização, requisitos acadêmicos verificados e não verificados, confiança/campos ausentes e vaga remota.

Os resultados acima cobrem typecheck, lint, build e suites de unidade disponíveis, não homologam integrações externas nem deployment.
