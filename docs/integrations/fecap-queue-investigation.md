# Investigação do painel de fila presencial da FECAP

**Verificado em:** 01/11/2026
**Fonte:** [Painel presencial ASA](https://presencial.fecap.br/)

## Resultado da consulta pública

A página oficial foi consultada sem autenticação por um único `GET`; respondeu HTTP 200 (`text/html; charset=utf-8`). O HTML inclui as grades dinâmicas e, ao mesmo tempo, a resposta apresentada está em modo somente leitura/offline e informa:

- “Não há registros a serem exibidos.”
- “Você não tem permissões para exibir estes registros.”
- “Erro ao concluir solicitação.”

Como a própria página comunica falta de permissão, a mensagem de ausência de linhas **não comprova que a fila esteja vazia**. Nenhum número de senha, mesa, posição, titular ou horário atual foi obtido. Nenhuma chamada foi feita ao endpoint interno das grades e nenhum controle de acesso foi contornado. A presença da marcação `entity-grid` no HTML não altera essa conclusão.

O HTML e fixtures de inspeções anteriores mostram que a página usa Microsoft Power Pages com grades de entidade carregadas pelo próprio portal. A configuração pública inclui uma URL `/_services/entity-grid-data.json/<site>` e nomes lógicos de colunas referentes a posição, senha, mesa e data de atribuição. Isso descreve a interface observada; não concede autorização para ler os registros subjacentes.

## Dados e limitações confirmados

| Informação | Evidência disponível agora | Conclusão |
|---|---|---|
| Estrutura da página | Título `FILA ASA`, seções de últimas, próximas e anteriores senhas | Estrutura identificável |
| Endpoint/grades | Configuração de grades no HTML observado anteriormente | O portal usa carregamento dinâmico |
| Senhas atuais | Nenhum registro legível nesta consulta | Indisponíveis |
| Posição, mesa e horários atuais | Nenhum registro legível nesta consulta | Indisponíveis |
| CPF, RA ou titular | Não expostos na página consultada | Não inferir nem consultar |
| Identificador de QR/atendimento | Não documentado | Vínculo individual não implementável sem contrato da FECAP |
| Conclusão/cancelamento/ausência | Não confirmados nesta consulta | Não inferir pelo desaparecimento da senha |

O exemplo datado de 31/10/2026 no escopo e as fixtures existentes não são estado atual. Fixtures sintéticas servem apenas aos testes automatizados e nunca devem ser servidas pelo app, portal ou API fora do ambiente de testes.

## Tratamento implementado

- O backend seleciona somente os providers institucionais reais por padrão.
- A coleta permanece desativada até as flags de autorização e leitura estarem habilitadas no ambiente correto.
- O parser detecta avisos explícitos de permissão em HTML ou JSON e retorna erro de fonte (`403`), em vez de converter a resposta em fila vazia.
- O adaptador HTML aplica a mesma proteção; o fallback não contorna o aviso.
- A API só aceita acompanhamento manual quando a senha aparece em um snapshot recente e saudável da fonte oficial.
- Um acompanhamento por número digitado continua sem comprovar que a pessoa é titular. O ASA Conecta não pede CPF como prova.
- A interface não apresenta dados de demonstração e o Compose não ativa seeds sintéticas por padrão.

## Evidência e limites

A consulta feita em 01/11/2026 foi uma abertura pública sem login. O leitor recebeu a página em modo somente leitura/offline e o aviso de permissão listado acima. Não foram enviados cookies institucionais, credenciais, CPFs ou RAs. Não foram feitas requisições `POST` às grades nem consultados dados de qualquer estudante.

Não foi possível verificar frequência real de atualização, formato do payload de registros acessíveis ou funcionamento do parser contra um snapshot atual. Não há evidência de webhook, SSE, API oficial de vinculação ou mecanismo de verificação do QR Code.

## Pendências para ativar dados reais

1. A FECAP deve habilitar permissões de leitura para a integração ou fornecer API/webhook documentado e autorizado.
2. A FECAP deve confirmar frequência de consulta permitida e ambiente de homologação.
3. Para vínculo pessoal, a FECAP deve fornecer identificador ou fluxo de comprovação de titularidade verificável.
4. A instituição deve validar finalidade, retenção e responsabilidades LGPD.
5. Depois disso, validar o provider com resposta real autorizada antes de habilitar produção.

Até essas dependências serem resolvidas, a fonte deve permanecer indisponível no ASA Conecta. Não existe um modo seguro de obter registros reais por meio da página atualmente apresentada sem ultrapassar a permissão observada.
