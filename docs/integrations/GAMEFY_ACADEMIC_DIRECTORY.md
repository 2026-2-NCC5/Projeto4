# Diretório acadêmico GameFY

Atualizado em 2026-11-01. Este registro diferencia a conexão local validada da configuração de produção.

## O que existe no código

- O adaptador read-only está em [`gamefyDirectory.ts`](../../src/Entrega_2/Backend/api/src/academic/gamefyDirectory.ts).
- O catálogo lê cursos, disciplinas, períodos letivos e turmas do GameFY.
- A busca de estudantes e professores retorna apenas os campos permitidos pelo adaptador. RA não é devolvido.
- A tela web fica em `/asa/diretorio-academico` e `/admin/diretorio-academico`.
- `GET /api/academic/directory` exige sessão ASA e a permissão `academic:directory:read`; as buscas são auditadas sem registrar os termos ou nomes.
- `GET /api/academic/catalog` exige sessão ASA. A lista de cursos para cadastro pode usar o catálogo GameFY quando a conexão está configurada.

## Verificação local

Com a configuração GameFY presente no ambiente local da API, uma consulta real ao catálogo respondeu com:

| Recurso | Registros retornados |
| --- | ---: |
| Cursos | 9 |
| Disciplinas | 64 |
| Períodos letivos ativos | 2 |
| Turmas | 43 |

A verificação registrou somente contagens e horário de consulta. Não pesquisou nem mostrou nomes, RAs ou outros dados pessoais de estudantes/professores. Os totais são resultado daquela consulta e não estão fixos no código.

## Produção

Na verificação de 2026-11-01, o projeto Vercel `asa-conecta-api` não possuía as variáveis `GAMEFY_SUPABASE_URL` e `GAMEFY_SUPABASE_SERVICE_ROLE_KEY`. A API de produção respondia `dataMode=demo`, `academicSource.provider=demo` e aceitava o domínio de demonstração `demo.asa`. Portanto, a busca de pessoas GameFY **não está ativa em produção**.

Não copiar a chave privilegiada para o app mobile, frontend web, Git ou conversa. O backend a lê apenas por variável de ambiente. Não ativar a chave GameFY no backend de produção enquanto contas de demonstração puderem autenticar, pois esse acesso poderia combinar uma sessão de demonstração com dados reais do diretório.

## Credenciais e autenticação

O adaptador consulta o catálogo e o diretório; ele **não autentica alunos no GameFY nem recupera senhas**. Credenciais pessoais não são dados de diretório e não devem ser copiadas, armazenadas ou consultadas pelo ASA Conecta. A autenticação real dos estudantes depende de SSO/API institucional autorizada ou de outro fluxo institucional aprovado.

Para produção, a FECAP precisa aprovar o uso do diretório, disponibilizar credencial de integração com privilégios mínimos (preferencialmente somente leitura), e a equipe deve desativar logins de demonstração e validar as permissões de funcionários antes de cadastrar os segredos no projeto Vercel. Os valores devem ser inseridos diretamente no gerenciador de segredos da Vercel, nunca enviados em chat ou adicionados a arquivos versionados.
