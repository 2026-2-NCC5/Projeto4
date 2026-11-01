# ASA Conecta mobile — auditoria de distribuição

Data da verificação: 2026-11-01.

## Resultado

O app está preparado para desenvolvimento e avaliação pelo Expo Go SDK 58. **A distribuição institucional com
dados reais permanece bloqueada** até a API e os serviços FECAP serem homologados. Não publicar usando a API
remota atual nem contas ou registros de demonstração.

## Aplicação

- Expo SDK 58, React Native 0.88 e React 19.3 alinhados; `expo-doctor` e `expo install --check` aprovados.
- `npm start` e `npm run start:go` abrem explicitamente no Expo Go. `npm run start:dev-client` é reservado ao
  development build.
- O app interrompe a inicialização se a API anunciar modo ou fonte acadêmica demo. Em builds de distribuição,
  exige fonte institucional disponível.
- Expo Go oferece o fluxo de texto e as funcionalidades compatíveis com módulos incluídos no cliente. Entrada
  de voz/“Hey Asa” usa módulo nativo e precisa de development build. Push remoto não é garantido no Expo Go.
- Foram criados perfis EAS `development`, `preview` (APK Android interno) e `production`. Ainda falta associar
  o app ao projeto/conta EAS institucional e configurar credenciais e variáveis nos ambientes EAS.

## API, GameFY e dados

Na API pública consultada nesta auditoria:

- `/health` respondeu saudável para API, banco e agente.
- `/api/platform/info` declarou modo `demo` e fonte acadêmica de demonstração/indisponível.
- `/api/auth/policy` ainda aceita `demo.asa`, não tem recuperação de senha por e-mail e não publica URLs de
  termos e privacidade.
- `/api/auth/programs` respondeu com itens, mas isso não comprova origem institucional nem autoriza seu uso
  como catálogo oficial.

No código do backend, `GamefyDirectory` é um adaptador read-only de diretório e catálogo (cursos, disciplinas,
períodos, turmas e busca administrativa de usuários). Os dados pessoais acadêmicos de notas, frequência,
pendências e vínculos que alimentam as telas do estudante ainda são consultados pelo `StudentService` nos
repositórios do ASA. Não encontrei um fluxo implementado que sincronize esses dados individuais do GameFY para
esses repositórios. Não foi feita consulta a registros pessoais reais nesta auditoria.

Para habilitar produção, a equipe institucional precisa implementar e homologar o conector autorizado para os
dados individuais necessários, confirmar o mapeamento/consentimentos e políticas, configurar no backend
`GAMEFY_SUPABASE_URL`, `GAMEFY_SUPABASE_SERVICE_ROLE_KEY` e `GAMEFY_INSTITUTION_SLUG`, e fazer a plataforma
reportar `dataMode: institutional` e `academicSource: institutional/available` somente após validação real.
As chaves privilegiadas permanecem exclusivamente no servidor. Também precisam ser configurados e verificados
`DEMO_DATA_ENABLED=0`, domínios `edu.fecap.br`/`fecap.br`, recuperação de senha e URLs oficiais de termos e
privacidade.

## Verificação antes de distribuir

Defina `EXPO_PUBLIC_API_URL` com a API institucional homologada e execute `npm run check:release`. O comando
consulta endpoints públicos e falha fechado quando identifica modo demo, fonte acadêmica indisponível,
domínios de demonstração ou requisitos de conta/documentação ausentes. Ele não acessa registros de estudantes.

Depois da aprovação institucional: `eas login`, `eas init`, configurar ambiente/credenciais da organização e
executar o perfil `preview` para homologação antes de `production`. A presença de um perfil EAS no repositório
não equivale a um build assinado nem a uma publicação nas lojas.

## Validações executadas

- `npm run typecheck`: aprovado.
- `npm run lint`: sem erros; 10 avisos preexistentes em `types/api.ts`.
- `npm test -- --runInBand --silent`: 43 suítes, 564 testes aprovados.
- `npm run doctor`: 20/20 verificações aprovadas.
- `npx expo install --check`: dependências alinhadas.
- `npm audit --omit=dev --audit-level=high`: sem vulnerabilidades altas/críticas; 12 moderadas transitivas no
  toolchain Expo/Metro permanecem.
- `npm run check:release` contra a API pública atual: **bloqueado** pelos itens acima.
