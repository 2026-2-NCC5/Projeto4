# Investigação do painel público de fila da FECAP

Atualizado em 01/11/2026. Inspeção limitada a uma requisição `GET` da página pública e ao código/fixtures já presentes no ASA Conecta. Não foram usados cookies institucionais, credenciais, CPFs, POSTs ao serviço de dados, endpoints de escrita ou conta de estudante.

## Resultado da inspeção pública

- `GET https://presencial.fecap.br/` respondeu HTTP 200 com `text/html; charset=utf-8`; o título é `FILA ASA`.
- A página usa Microsoft Power Pages/Dataverse. O HTML inclui duas grades de entidade e configurações serializadas das visualizações.
- As grades apontam para `/_services/entity-grid-data.json/<site-id>`. Uma visualização lista `fecap_posicaonafilapresencial` e `fecap_senhanopresencial`, ordenadas pela posição. A outra lista `fecap_senhanopresencial`, `fecap_mesaasa_porextenso` e `fecap_datadeatribuicao`, ordenadas pela data.
- A resposta estática contém também uma mensagem de falta de permissão para visualizar registros. O HTML obtido não foi evidência de senhas atuais: não foi feita a chamada POST que carrega as grades, e o número de quatro dígitos encontrado na marcação não foi tratado como senha.
- A captura por leitor web nesta execução também mostrou a página em modo somente leitura/offline, sem registros utilizáveis. Isso não determina a disponibilidade para o usuário final do site.
- Não há WebSocket/SSE institucional documentado no HTML inspecionado. O ASA Conecta distribui suas próprias leituras por SSE/polling, depois de uma fonte habilitada.

## Campos e limites

| Informação | Evidência na página | Uso permitido nesta implementação |
|---|---|---|
| Número da senha | Nome lógico da coluna nas grades | Parser existente preserva como texto e zeros à esquerda; leitura conectada requer autorização |
| Posição | Coluna da grade de próximas senhas | Usada apenas se a fonte preencher a coluna |
| Mesa | Coluna da grade de chamadas | `null` se ausente; nunca inferida |
| Data/hora de chamada | Coluna da grade de chamadas | `null` se ausente |
| CPF, RA e titular | Não observados | Não acessados nem inferidos |
| Identidade do atendimento/QR | Não observados | Não há vínculo institucional nem reivindicação segura |
| Conclusão/cancelamento/no-show | Não confirmados por evidência nesta consulta | Não inferidos a partir do desaparecimento da senha |

O exemplo de senhas fornecido no escopo e fixtures locais são amostras históricas. Eles não são apresentados como estado atual da fila.

## Estratégia recomendada

1. Preferir API/webhook institucional documentado, com credenciais de serviço e escopos mínimos.
2. Se a FECAP autorizar por escrito a leitura do painel, ativar o provedor público por configuração separada. O monitor é centralizado no backend; clientes não fazem scraping individual.
3. Manter posição, mesa, chamada e horário como desconhecidos quando a origem não os apresentar.
4. Manter o acompanhamento manual como alerta por senha informada. Isso não comprova titularidade do estudante.
5. Implementar vínculo individual somente quando houver prova emitida/validada pela FECAP (por exemplo, identificador opaco do QR verificável por API). Um número público ou CPF digitado isoladamente não é prova.

## Evidências e reprodução

Requisição usada: um `GET` da página inicial, timeout de 10 segundos, sem autenticação. Foram examinados status, content type, título e configurações das grades já embutidas no HTML. Não foram solicitados `/_services/entity-grid-data.json`, `/_layout/tokenhtml`, URLs de edição/exclusão, nem chamadas de escrita.

Os arquivos `src/Entrega_2/Backend/api/test/fixtures/queue/` contêm fixtures de desenvolvimento. A documentação das fixtures descreve a origem e a data registradas no próprio repositório; os testes de parsing não equivalem a consulta real nesta execução.

## Pendências institucionais

- Aprovação explícita da FECAP para uso automatizado e frequência aceitável.
- Documentação ou autorização de API/webhook e contrato de titularidade.
- Conta/ambiente de homologação e definição do formato do comprovante/QR.
- Confirmação de retenção, finalidade e papéis de tratamento conforme LGPD.
- Validação com captura atual autorizada antes de homologar o parser contra registros reais.
