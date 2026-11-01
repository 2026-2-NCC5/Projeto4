# API ASA Match

Prefixo `/api/v1`. Todas as rotas exigem a sessão padrão do ASA. Rotas de estudante também exigem `requireStudent`; o proprietário vem da sessão. Rotas administrativas exigem `settings:manage`.

| Método | Rota | Uso |
|---|---|---|
| GET/PATCH | `/career/profile` | Ler/atualizar perfil do aluno |
| GET | `/career/jobs` | Catálogo paginado e filtros por texto, tipo, modo, cidade e UF |
| GET | `/career/jobs/:id` | Detalhe de vaga |
| GET | `/career/recommendations` | Match e justificativas |
| GET/POST/DELETE | `/career/saved` | Vagas salvas |
| POST | `/career/feedback` | Interesse/desinteresse explícito |
| GET/POST | `/career/applications` | Acompanhamento manual informado pelo aluno |
| GET/PATCH | `/career/alerts` | Preferência de alertas in-app |
| GET/PATCH | `/career/notifications` | Notificações e marcação como lida |
| GET/POST/PATCH | `/admin/career/sources` | Gestão autorizada de fontes |
| POST | `/admin/career/collect` | Enfileirar coletas habilitadas |
| GET | `/admin/career/collection-runs` | Histórico de coleta |
| GET | `/admin/career/report` | Indicadores agregados do catálogo |

O contrato usa as respostas padronizadas da API atual. Payloads são validados por Zod. Não existe endpoint para candidatura externa, integração FECAP+ ou publicação de vaga nesta entrega.
