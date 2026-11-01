# Fontes de oportunidades

## Conectores disponíveis

| Conector | Endpoint utilizado | Estado inicial |
|---|---|---|
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true` | Nenhum board cadastrado/aprovado |
| Lever | `api.lever.co/v0/postings/{site}?mode=json` | Nenhum site cadastrado/aprovado |

Os conectores extraem apenas vagas publicadas nos quadros indicados. O ASA não faz busca personalizada por aluno na fonte. A normalização não inventa bolsa, cursos aceitos, semestre, habilidades ou prazo quando ausentes. O link é mantido somente para hosts oficiais de candidatura reconhecidos pelo adaptador.

## Aprovação operacional

Antes de cadastrar/habilitar uma fonte, a instituição deve confirmar permissão e registrar uma referência verificável de autorização, parceria, licença ou termos aplicáveis. A referência não é validação automática desses termos: é trilha administrativa. Fontes iniciam desativadas. O administrador é responsável por confirmar escopo, retenção, exibição, atribuição e limites de chamada. Revogue/desative quando a autorização mudar.

FECAP+ Oportunidades, CIEE, Nube, LinkedIn, Indeed, Gupy e outros portais não têm conectores implementados neste módulo. Não foram coletados por scraping. A integração FECAP+ requer endpoint, documentação e autorização institucionais; até lá, o site oficial permanece separado.

## Ciclo

Cada execução é registrada em `career_job_collection_runs`; fila, deduplicação, alertas e catálogo são persistidos no PostgreSQL. Erro temporário não é interpretado como fechamento da vaga. O catálogo filtra anúncios expirados ou não verificados há mais de sete dias. Revalidação/remoção definitiva precisa de evidência do endpoint e pode exigir política adicional para fontes sem suporte a status.
