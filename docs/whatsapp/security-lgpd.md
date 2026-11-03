# Segurança e LGPD

Este módulo trata dados pessoais de estudantes. **Antes de qualquer uso real, a instituição precisa definir** base legal, aviso de privacidade, papéis de controlador e operador, e política de retenção. Os controles abaixo são técnicos e não substituem essa análise.

## Controles implementados e testados

| Risco | Controle | Teste |
|---|---|---|
| Aluno A vê dados do aluno B | Dono verificado no serviço; resposta 404; feed filtrado na consulta por `student_id` da sessão | integração, E2E |
| Nota interna vaza | `visibility` na consulta; eventos sem conteúdo | integração, E2E |
| WhatsApp aparece no app sem autorização | `student_visible` falso por padrão; espelhamento exige configuração **e** vínculo | integração |
| Número vira identidade | Só vínculo verificado associa; nada de criar estudante a partir de número | integração |
| Número muda de dono | Identidade vem do dono do chamado; revogar solta os chamados da conversa; fila confere antes de enviar | integração |
| Enumeração de números | Estudante não digita número; conflito responde genericamente | integração |
| Vazamento do banco expõe telefones | AES-256-GCM + HMAC com chaves derivadas (HKDF) fora do repositório | unitário, integração |
| Webhook forjado ou repetido | Assinatura sobre os bytes crus; janela de 5 min; deduplicação | unitário, integração |
| SSRF por mídia | WA-AKG: só caminho `/api/media/...`, host fixo; Meta: só https em hosts da Meta; nenhum dos dois segue redirecionamento | unitário |
| Mídia enorme esgota memória | Leitura em partes, interrompida no limite | unitário |
| Tipo de arquivo falso | Tipo conferido pelo conteúdo; ZIP só como `.docx` | unitário |
| PDF malicioso | Desenhado em canvas pelo pdf.js, sem XFA, sem scripts, sem plugin | unitário (UI), E2E |
| Link de arquivo antigo | Link assinado de 5 min, pedido na hora; abrir fica na auditoria | integração |
| QR ou chave no cliente errado | QR só na resposta do admin (`no-store`); nada de provedor no app | integração |
| Conteúdo em log | Logs só com ids e códigos; inbox cifrada e apagada ao processar | integração |
| Mensagem duplicada | Idempotência em todas as camadas; `unknown` sem reenvio | integração |
| Disparo em massa | Não há rota para isso | por construção |
| Texto do WhatsApp como comando | É dado: não aciona ação nenhuma, nem passa por IA | por construção |
| Revogação de papel | Long polling reautentica a cada chamada | herdado do `authenticate` |
| Pedido para parar | "SAIR"/"PARAR" bloqueiam respostas; vale pela data da mensagem, então uma mensagem antiga atrasada não desfaz | integração |
| Conta de demonstração em produção | Provedor fake recusado na subida | unitário |

## Pendências reais

Estas não estão resolvidas, e nenhuma deve ser tratada como concluída:

| Item | Situação |
|---|---|
| **Retenção de mensagens e arquivos** | **Sem expurgo automático.** Só o log de eventos (180 dias, valor de exemplo), a inbox e a presença são limpos. É preciso definir a política e implementar |
| **Anonimização e exclusão a pedido do titular** | Não implementado. Revogar vínculo não apaga conversas |
| **Antivírus** | Não há. O tipo é conferido, mas um PDF com conteúdo malicioso pode ser baixado |
| **Anexos cifrados na aplicação** | Ficam em `bytea`, com a proteção em repouso do banco. Sem cifra própria |
| **Chave de cofre** | Trocar `ASA_WHATSAPP_PII_KEY` torna vínculos e conversas ilegíveis. Não há rotação |
| **Escopo por setor** | Toda a equipe vê todos os chamados |
| **Impressão e exportação** | Prévia não restringe. O download é permitido a quem abre |
| **SBOM** | Não gerado. `pdfjs-dist` é a única dependência nova, com versão fixa |
| **Prioridade visível ao aluno** | Já existia antes desta entrega: `priority` vai no resumo do chamado, embora um comentário no código diga o contrário. Não foi alterado, porque pode haver cliente usando |
| **Mensagens que esgotam as tentativas** | Ficam em `failed`, com o conteúdo cifrado por 30 dias, e a administração pode reprocessar. Sem alerta ativo: aparece só no painel de saúde |

## O que nunca vai para fora

- Conversas do WhatsApp não são enviadas a nenhum modelo de IA nesta entrega.
- Nenhuma credencial de provedor existe no portal ou no app. Há teste que varre o código do app.
- O gateway WA-AKG recebe o que for necessário para enviar. Com ele ativo, o histórico do número fica no banco dele, **sem retenção e sem cifra** ([detalhes](integration-wa-akg.md)).

## Variáveis sensíveis

`ASA_WHATSAPP_PII_KEY`, `ASA_WHATSAPP_WEBHOOK_SECRET`, `ASA_WA_AKG_API_KEY`, `ASA_META_ACCESS_TOKEN`, `ASA_META_APP_SECRET`, `ASA_META_VERIFY_TOKEN` e `WA_AKG_*`: só no ambiente, nunca com prefixo `EXPO_PUBLIC_` nem `VITE_`.
