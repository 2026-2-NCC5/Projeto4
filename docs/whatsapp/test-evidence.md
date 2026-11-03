# Evidências de teste

Execução final em 02/11/2026, branch `feat/migracao-vercel`, com a migration 017 aplicada a banco recriado. PostgreSQL 16 real, provedor `fake`. **Nada foi enviado ao WhatsApp.**

## Resultados

| Pacote | Comando | Resultado | Antes da entrega |
|---|---|---|---|
| Contratos | `Backend/scripts/check-contracts-sync.sh` | 3 cópias sincronizadas | igual |
| API | `npm run typecheck`, `npm run lint` | 0 erros | igual |
| API | `npm run test:unit` | **396 passaram** (23 arquivos) | 354 |
| API | `npm run test:integration` | **113 passaram** (11 arquivos) | 53 |
| Portal | `npm run typecheck`, `npm run lint` | 0 erros | igual |
| Portal | `npx vitest run` | **312 passaram** (55 arquivos) | 283 |
| App | `npm run typecheck` | 0 erros | igual |
| App | `npm run lint` | 0 erros, 10 avisos (já existentes) | igual |
| App | `npm test -- --silent` | **666 passaram** (49 suítes) | 564 |

Depois disso só mudou a tipagem de dois campos do contrato, com `tsc` e sincronia reconferidos nos três pacotes.

## E2E no navegador

Portal em Chromium, contra API e banco reais (`Web/e2e/whatsapp-central.spec.ts`): **6 passaram** (3 logins + 3 cenários).

```bash
# API com ASA_WHATSAPP_PROVIDER=fake, seeds de demonstração; Vite apontando para ela
E2E_BASE_URL=http://localhost:5197 npx playwright test whatsapp-central --project=setup --project=portal
```

Cobre o cenário-alvo do prompt mestre (§28), com estes pontos verificados na tela: fila de não identificados, estado real do canal, marca de demonstração, deduplicação, prévia de PDF com o chat ativo, resposta "Enviada" e depois "Entregue" só com confirmação, vínculo verificado, status chegando por long polling, nota interna fora do alcance do aluno, aluno B bloqueado e queda do canal.

**Limitação:** este E2E usa um servidor Vite de desenvolvimento. Ver "Bloqueio do CI" abaixo.

## App real (Expo Web)

O app rodou no navegador, ligado à API real, com o código final. Foi uma execução com script, não está no CI.

| Verificação | Resultado |
|---|---|
| Status mudado pela equipe aparece sem recarregar | **1,3 s** |
| Nota interna e resposta só no WhatsApp aparecem no app | Não |
| Menor intervalo entre chamadas do feed | 998 ms (o mínimo configurado é 1 s, medido pelo início de cada chamada) |
| Erros de página | Nenhum |

Como o app recusa API em modo de demonstração, a execução usou duas instâncias sobre o mesmo banco descartável: uma institucional para o app (com um estudante de teste fora do modo demo) e outra para a equipe. Isso também exercitou o evento atravessando instâncias, como acontece em funções serverless.

**Não testado em aparelho físico.** Push, teclado, gestos e segundo plano real ficam para esse teste.

## Revisão adversarial

Uma revisão independente do backend, sem acesso às minhas conclusões, reproduziu **22 defeitos**, com testes contra banco real. Todos foram corrigidos, e cada grupo ganhou testes de regressão:

| Gravidade | Defeito | Correção |
|---|---|---|
| Alta | Número que muda de dono: mensagem de B no chamado de A, resposta de A para o número de B | Identidade pelo dono do chamado; revogar solta os chamados; fila confere antes de enviar |
| Alta | Número revogado continuava reabrindo o chamado | Idem |
| Alta | `ECONNRESET` reenviava sozinho, podendo duplicar | Passa a `unknown` |
| Alta | Trava de lote: outra drenagem marcava `unknown`, e a primeira enviava mesmo assim | Reserva item a item |
| Alta | Mensagem antiga atrasada desfazia o pedido para parar | Vale a data da mensagem |
| Média | Fila regredia `delivered` para `unknown` | Fila nunca desfaz confirmação |
| Média | `CONNECTED` velho do gateway era aceito | Exige `hasInstance` |
| Média | Leitura religava canal desconectado pela administração | `desired_connected` |
| Média | Confirmar duas vezes virava falso conflito | Trava no pedido |
| Média | Revisão demorada impedia a confirmação | Prazo novo, na mesma transação |
| Média | Falha depois de gravar a mensagem perdia opt-out e mídia | Passos seguintes são idempotentes e sempre rodam |
| Média | Nova tentativa não era atômica e guardava o id antigo | Uma transação; esquece o id anterior |
| Média | Conflito ao trazer chamado anterior deixava vínculo feito e chamado de fora | Repete; falha não desfaz o vínculo |
| Média | Linha ilegível travava toda a reprocessação | Isolada por linha |
| Média | Reprocessamento sem espera esgotava as tentativas em 40 s | Espera crescente, reprocesso manual, retenção |
| Média | Mídia inteira em memória antes de conferir o tamanho | Leitura em partes |
| Média | Reabrir com outro chamado aberto dava erro 500 | Responde 409 |
| Média | Resposta pelo WhatsApp não contava como primeira resposta | Conta; métrica corrigida |
| Baixa | Painel ignorava mensagens de contato; CSV rotulava WhatsApp como App | Corrigidos |
| Baixa | Cursor anterior à retenção não pedia recarga | Marca d'água da retenção |
| Baixa | Sequência podia inverter no feed | Trava antes; limitação restante documentada |
| Baixa | Cursor fora do intervalo dava 500 | Responde 400 |

Depois das correções, rodei os testes do próprio revisor, que passavam com o defeito presente: 22 de 32 passaram a falhar, como esperado. Os outros 10: 5 são verificações positivas ou apenas registram em log (isolamento, permissões, rollback, configuração, cursor), 4 forçam o estado à mão ou rodam comandos fora do código (cobertos pelas regressões ou pela limitação documentada), e 1 (T7) só confere o total de envios, que continua correto.

Também verificado pela revisão, sem achados: isolamento de alunos, limites da administração, assinaturas de webhook, SSRF, retirada de telefone e texto dos logs, índices parciais e rollback.

## O que não foi testado

- **Nenhuma conexão real:** gateway WA-AKG não foi construído nem executado; Cloud API só com respostas simuladas.
- **Aparelho físico:** app só em Expo Web e jest.
- **Supabase e Vercel:** nada foi publicado, e nenhuma migration foi aplicada fora do Docker local. O long polling de 25 s não foi medido na Vercel, nem os privilégios do papel `asa_api` nas tabelas novas.
- **Carga:** sem teste de carga.
- **Restauração de backup:** não exercitada.

## Bloqueio do CI

Alteração **anterior a esta entrega**, ainda não commitada: `Web/src/features/auth/guards.tsx` (`RequireInstitutionalData`) bloqueia login em build de produção quando a API está em modo de demonstração. O E2E do CI roda exatamente assim (`vite preview` contra API demo). Conferido: com a guarda, a tela de login não aparece. **Se essa alteração entrar, toda a suíte E2E do portal no CI falha**, não só a desta entrega, até o job ser ajustado.

## Capturas

Em [evidence/](evidence/), só com dados fictícios:

| Arquivo | Mostra |
|---|---|
| `01-central-tres-paineis.png` | Os três painéis |
| `02-previa-pdf-com-chat-aberto.png` | Prévia de PDF com a conversa ativa |
| `03-resposta-entregue.png` | Estado de entrega confirmado |
| `04-canal-desconectado.png` | Queda do canal |
| `05-admin-canal-demonstracao.png` | Administração do canal |
| `06-celular-conversa.png` | Portal em tela pequena (captura durante a animação de entrada) |
| `07` a `10-app-vinculo-*.png` | App: consentimento, código, confirmação, vinculado |
| `11-app-chamado-antes.png`, `12-app-chamado-atualizado-ao-vivo.png` | App antes e depois da mudança da equipe |
