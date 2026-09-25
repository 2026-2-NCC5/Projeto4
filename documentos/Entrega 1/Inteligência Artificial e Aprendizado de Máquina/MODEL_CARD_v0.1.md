# Model Card — ASA Conecta Baseline de Risco de Evasão
**Versão:** 0.1 — Entrega 1  
**Data:** 25/09/2026  
**Modelo:** Regressão Logística com pré-processamento tabular

## 1. Finalidade
Apoiar o Agente para o Estudante na priorização de acompanhamento e acolhimento. O score representa risco preditivo relativo de evasão segundo padrões da base histórica.

## 2. Uso pretendido
- Triagem e priorização para revisão humana.
- Explicação global dos fatores associados ao score.
- Apoio a alertas e recomendações assistivas.

## 3. Usos não permitidos
Não usar para sanções, bloqueios, reprovação, cancelamento de matrícula, restrição de serviços, decisões disciplinares ou qualquer decisão administrativa automática.

## 4. Dados
Base analisada: `base_unificada_asa-final.csv`. Após remover alvo ausente: **12,842 registros**. Classe evasão: **2,512 (19.6%)**.
Features: contexto, matrícula, financeiro, histórico acadêmico e relacionamento. `ID_ALUNO` e o status usado para construir o rótulo não são features.

## 5. Rótulo
`evadiu` é derivado do status acadêmico conforme regra de negócio documentada. Casos ambíguos devem ser tratados e versionados explicitamente.

## 6. Preparação
Numéricas: mediana + StandardScaler. Categóricas: moda + OneHotEncoder. Regressão Logística com `class_weight='balanced'`.

## 7. Métricas da baseline
Holdout estratificado 80/20, random_state=42:
- ROC-AUC: **0.814**
- PR-AUC: **0.562**
- Recall evasão: **0.777**
- Precision evasão: **0.413**
- F1 evasão: **0.540**
- Acurácia: **0.740**

Validação cruzada estratificada (5 folds):
- ROC-AUC médio: **0.831 ± 0.010**
- PR-AUC médio: **0.594**
- F1 médio: **0.544**

## 8. Fatores explicativos
A importância por permutação aponta, nesta execução, maior contribuição de: valor_total_periodo, media_notas, total_parcelas, Grau Acadêmico, tempo_de_curso, dias_desde_ultimo_contato. Isso indica utilidade preditiva, não causalidade.

## 9. Score e decisão
Faixas iniciais: Verde <0,35; Amarelo 0,35–0,65; Vermelho >=0,65. São thresholds de protótipo, não política definitiva.

## 10. Riscos e limitações
- O rótulo é uma proxy construída a partir de status acadêmico.
- A base pode conter viés histórico e cobertura desigual entre dimensões.
- Associação preditiva não significa causa.
- Split aleatório pode superestimar generalização se houver dependência temporal ou duplicidade por aluno.
- Necessário auditar métricas por subgrupos e monitorar drift.
- Falsos positivos podem gerar abordagens desnecessárias; falsos negativos podem deixar alunos sem apoio.

## 11. Monitoramento recomendado
ROC-AUC, PR-AUC, recall, precision, distribuição do score, taxa por faixa, drift de features, taxa de acionamentos humanos, overrides e resultados posteriores. Reavaliar thresholds periodicamente.

## 12. RAG
Baseline TF-IDF sobre trechos do guia. Hit@3 inicial nos testes preparados: **75%**. Em produção, usar documentos oficiais versionados, avaliação ampliada e respostas com fontes verificáveis.
