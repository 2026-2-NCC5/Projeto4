# ADR — Integração com o JEV (provedor de IA)

- **Status:** proposto; a implementação está **bloqueada** por falta de contrato técnico e de autorização.
- **Data:** 2026-10-15
- **Decisão vigente:** o assistente usa o provedor existente (regras determinísticas + base de conhecimento com
  citações). O JEV fica **desligado** (`JEV_ENABLED=false`, `AI_PROVIDER=existing`).

## Contexto

O pedido da Entrega 2 cita o JEV como provedor de IA futuro do assistente. O material recebido **não traz**
especificação técnica:

- endpoint;
- autenticação;
- formato de requisição e resposta;
- limites de uso;
- política de dados, retenção e localização;
- custo;
- SLA.

Também não há autorização institucional registrada para enviar mensagens de alunos a um serviço externo.

Inventar qualquer um desses itens criaria uma integração que parece funcionar e não funciona. Seria pior do que
não ter integração, porque a interface prometeria uma IA que não existe.

## Decisão

1. **Interface de provedor** (`api/src/ai/providers.ts`): `AIProviderAdapter` com quatro métodos:
   - `capabilities()`;
   - `health()`;
   - `generate(request, context)`;
   - e o identificador e rótulo.

   O `AiProviderRegistry` escolhe o provedor ativo. Se um provedor externo falhar, volta ao existente e a
   resposta informa **qual** respondeu (`provider` no contrato v1.7).
2. **`RuleBasedKnowledgeAdapter`** é o provedor ativo. Usa busca lexical no PostgreSQL (`to_tsvector` em
   português) sobre artigos **publicados**. Responde com **citações** (`sources`) quando a correspondência é
   confiável (cobertura ≥ 0,5 e pontuação ≥ 0,02). Quando o assunto é parecido mas a confiança é baixa, ele se
   **abstém** e oferece abrir um chamado com um resumo (`handoff`). Fora do tema, mantém o fluxo atual (pede
   esclarecimento).
3. **`JevAdapter`** existe só como um lugar reservado e honesto:
   - `capabilities()` devolve tudo `false`;
   - `health()` informa `disabled` (`JEV_ENABLED=false`) ou `not_configured` (`JEV_ENABLED=true` sem contrato);
   - `generate()` lança `ProviderUnavailableError` e **nunca faz chamada de rede**;
   - não há URL, chave nem formato fictício no código, no `.env.example` ou na documentação.
4. **Clientes:**
   - a administração mostra o JEV como **"Planejado"** em Integrações;
   - os indicadores do agente mostram o provedor ativo;
   - nenhuma tela usa a marca JEV como se ela respondesse.

## O que é necessário para implementar

| Item | Responsável | Observação |
|---|---|---|
| Documento técnico da API do JEV | FECAP / fornecedor | Endpoint, autenticação (preferência: credencial de serviço no backend), esquemas, erros, limites |
| Autorização e base legal para enviar texto de alunos | FECAP (encarregado de dados) | Inclui retenção, uso para treinamento (deve ser vedado), localização dos dados |
| Ambiente de homologação e credenciais de teste | Fornecedor | Credenciais **somente** no backend (nunca `EXPO_PUBLIC_*`/`VITE_*`) |
| Critérios de qualidade | Equipe ASA + grupo | Conjunto de perguntas de avaliação, taxa de abstenção aceitável, exigência de citações |

## Plano quando houver contrato

1. Implementar `JevAdapter.generate` com timeout, limite de taxa e interruptor por configuração. Prever falha
   segura: se o JEV cair, a resposta vem do provedor existente com `provider` indicando a troca.
2. Enviar só o necessário:
   - a pergunta;
   - os trechos da base de conhecimento recuperados localmente;
   - nunca notas, frequência ou identificação do aluno sem base legal definida.
3. Exigir citações das fontes enviadas. Sem citação, aplicar a mesma regra de abstenção.
4. Testes:
   - contrato com servidor simulado no CI;
   - homologação manual;
   - métricas de abstenção e de "útil / não útil" nos indicadores do agente.
5. Só então permitir `AI_PROVIDER=jev` em produção, com registro na auditoria das mudanças de configuração.

## Consequências

- O assistente funciona hoje, sem depender de terceiros, com respostas verificáveis (citações) e abstenção
  explícita.
- Trocar de provedor é uma mudança localizada (`ai/providers.ts`) e não afeta app, portal nem contrato.
- Testes: `api/test/unit/aiProviders.test.ts` cobre:
  - JEV desligado e não configurado;
  - fallback com `provider`;
  - abstenção com `handoff`;
  - citações só de artigos publicados.
