# Plano de ativação

Cada etapa é reversível por configuração. Nenhuma ocorre sem o aceite indicado.

## Etapa 0: código em produção, canal desligado

Publique com `ASA_WHATSAPP_PROVIDER=none` (padrão). Muda para quem já usa: tempo real no atendimento, novas rotas, a Central disponível sem WhatsApp, e 404 em vez de 403 para chamado alheio.

```bash
npm run db:migrate   # aplica a 017
```

**Reversão:** republicar a versão anterior. A migration só adiciona colunas com padrão e relaxa restrições; o código antigo não usa chamados sem estudante enquanto o canal estiver desligado. O rollback SQL só é necessário para remover as tabelas.

**Antes de publicar:** faça backup. A produção usa o papel `asa_migrator`, então confirme se os privilégios do `asa_api` alcançam as tabelas novas, porque as migrations não têm `grant`. **Isto não foi verificado em Supabase.**

## Etapa 1: demonstração em ambiente separado

`ASA_WHATSAPP_PROVIDER=fake`, banco próprio e demonstração ligada. Nunca no ambiente de produção, onde a API recusa subir.

**Aceite:** a equipe do ASA percorre o cenário e valida a tela e os textos.

## Etapa 2: decisão institucional

- [ ] Escolher entre Cloud API (recomendado) e piloto WA-AKG
- [ ] Autorizar formalmente o número
- [ ] Aprovar base legal, aviso de privacidade e texto de consentimento (`CONSENT_TEXT` é **provisório**)
- [ ] Definir retenção de mensagens e arquivos
- [ ] Definir se mensagens do WhatsApp aparecem no app
- [ ] Orçar o custo por mensagem (Cloud API)

## Etapa 3: conexão sem envio

Provedor real, `ASA_WHATSAPP_OUTBOUND_ENABLED=false`. Mensagens entram na Central, e nada sai. Valide com um número de teste institucional: entrada, deduplicação, mídia e reconexão.

**Aceite:** um dia sem erro de processamento, com número e mensagens de teste.

## Etapa 4: envio com grupo restrito

Ligue o envio. Participantes: pessoas que aceitaram participar, informadas de que é piloto.

**Aceite:** estados de entrega conferidos no aparelho; `unknown` e falhas tratados pela equipe; vínculo testado por estudantes reais.

## Etapa 5: operação

Divulgar o número, acompanhar fila e métricas. Para o WA-AKG, esta etapa **não é recomendada**: é um piloto, não operação definitiva.

## Reversão a qualquer momento

| Quero | Faça |
|---|---|
| Parar de enviar | `ASA_WHATSAPP_OUTBOUND_ENABLED=false`, ou pausar o canal |
| Parar de receber | Desconectar o canal |
| Desligar tudo | `ASA_WHATSAPP_PROVIDER=none` |
| Remover o módulo | Código anterior + `database/rollback/017_support_whatsapp.down.sql`, com perda de dados descrita no arquivo |
