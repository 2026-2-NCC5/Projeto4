# Avaliação de risco do provedor de WhatsApp

**Decisão:** o ASA Conecta fica preparado para dois provedores reais e não ativa nenhum sem autorização formal.

| Ambiente | Provedor | Situação |
|---|---|---|
| Testes automatizados e demonstração | `fake` | Em uso. Nada sai para o WhatsApp. |
| Piloto restrito | `wa-akg` | Implementado e testado só contra respostas simuladas. **Bloqueado** (ver abaixo). |
| Produção institucional | `meta-cloud-api` | Implementado e testado só contra respostas simuladas. **Bloqueado** por credenciamento. |

Quem decide: a FECAP/ASA. Este documento não é parecer jurídico. A revisão de base legal, termos e autorização do número é pré-requisito, não etapa posterior.

## Por que o WA-AKG não serve para operação institucional

O gateway usa o Baileys, cliente não oficial do WhatsApp.

- As [Messaging Guidelines](https://www.whatsapp.com/legal/messaging-guidelines) proíbem "use unofficial clients, bulk messaging, auto-messaging, auto-dialing, or automation to harm WhatsApp or our users" e preveem suspensão temporária ou permanente da conta.
- Os [Termos de Serviço](https://www.whatsapp.com/legal/terms-of-service) proíbem criar software ou APIs que funcionem substancialmente como os serviços deles.
- Nenhuma dessas fontes cita o Baileys pelo nome. Aplicar as cláusulas a ele é **interpretação nossa**; a consequência prática é o risco de perder o número institucional.

Além da política, a auditoria da revisão fixada (`04d6c0f`, v1.7.0) encontrou:

- **3 alertas críticos e 51 altos** no `npm audit`, incluindo `next@16.1.1` e `next-auth@5.0.0-beta.30`. Não publique com o lockfile como está.
- Armazenamento do histórico completo do número sem retenção (`syncFullHistory: true` fixo no código), um problema direto de LGPD.
- Telemetria ligada por padrão para um servidor externo.

Detalhes e mitigações: [integration-wa-akg.md](integration-wa-akg.md).

## Por que a Cloud API é a recomendação para produção

É o caminho oficial. Exige negócio verificado, número dedicado e, fora da janela de 24 horas, modelos aprovados.

Regras levantadas nas fontes primárias em 02/11/2026 (reconfirme na ativação):

| Tema | O que dizem | Efeito no ASA Conecta |
|---|---|---|
| [Opt-in](https://whatsappbusiness.com/policy/) | Só contatar quem deu o número e autorização | O MVP só **responde**: nunca inicia conversa |
| Iniciar conversa | Só com modelo aprovado | Fora da janela, o servidor bloqueia com `template_required`; envio de modelo não foi implementado |
| Opt-out | Respeitar qualquer pedido, dentro ou fora do WhatsApp | "SAIR" ou "PARAR" bloqueiam respostas até a pessoa voltar a escrever |
| Escalonamento | Automação na janela exige caminho claro para pessoa | Não há automação: todas as respostas são humanas |
| Janela | 24 h desde a última mensagem da pessoa | Calculada por `last_inbound_at`; o erro 131047 também é tratado |
| Preço | Por mensagem desde 01/07/2025; desde 01/10/2026, mensagens de serviço acima de 1.000 entregues por mês e número são cobradas | **A instituição precisa prever esse custo** |

### IA no canal

A seção 4.7 dos [termos da plataforma](https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform) proíbe provedores de IA quando a IA é a função principal, e proíbe usar dados do WhatsApp para treinar modelos (com exceção limitada).

- Um atendimento humano com IA auxiliar parece uso permitido, mas **isso é inferência nossa**, e quem decide é a Meta.
- A data de vigência e a situação específica do Brasil **não foram confirmadas em fonte primária**: a imprensa fala em 15/01/2026 e em exceção após ação do CADE, e há fonte contraditória.
- Por isso nenhuma conversa do WhatsApp vai para modelos de IA nesta entrega.

## O que não foi confirmado

- Se a Meta considera o uso do ASA como "IA incidental" caso rascunhos por IA sejam ativados no futuro.
- A situação atual da restrição de IA no Brasil.
- Se o erro 131047 chega na resposta do envio, por webhook ou por ambos (o código trata os dois).
- Restrições específicas para educação: não encontramos seção própria, mas a leitura foi feita por resumo, não integral.
- A aplicação da LGPD a este fluxo: depende da análise da instituição.

## Bloqueios para ativar um provedor real

**Ambos:**

- [ ] Autorização formal do número institucional, com referência registrada no canal
- [ ] Base legal, aviso de privacidade e política de retenção aprovados
- [ ] `ASA_WHATSAPP_PII_KEY` e segredos em cofre, com backup da chave

**WA-AKG:**

- [ ] Aceite institucional, por escrito, do risco de suspensão do número
- [ ] Atualizar dependências e testar o gateway (a atualização sugerida do Next não foi validada)
- [ ] Host persistente (não roda na Vercel) e caminho autenticado até ele, decisão ainda em aberto
- [ ] Teste de conexão real, feito por pessoa autorizada

**Cloud API:**

- [ ] Negócio verificado, número e token de sistema na Meta
- [ ] Modelos aprovados, se for preciso iniciar conversas
- [ ] Orçamento para o custo por mensagem
