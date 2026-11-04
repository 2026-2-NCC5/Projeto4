# Model Card — ASA Conecta: Risco de Evasão
**Versão:** 1.0.0 — Entrega 2 (Final) · **Substitui:** v0.1 (Entrega 1)
**Modelo:** Random Forest (300 árvores, `min_samples_leaf=5`, `class_weight="balanced_subsample"`), 20 atributos, sem Sexo e Estado Civil
**Artefato:** `modelo/modelo_risco_evasao_v1.0.0.joblib` · **Metadados:** `modelo/modelo_meta_v1.0.0.json` · **Inferência:** `inferencia_risco.py`

## 1. Finalidade
Apoiar a equipe do ASA na **priorização de acompanhamento e acolhimento** de estudantes com padrão histórico associado à evasão. O score ordena alunos por risco relativo.

## 2. Uso pretendido
- Triagem e priorização para **revisão humana**.
- Faixas de risco para organizar filas de contato proativo.
- Apoio a alertas assistivos, sempre acompanhados da evidência do agente determinístico e das regras de ação (`tabela_decisao_pendencias.csv`).

## 3. Usos não permitidos
Sanções, bloqueios, reprovação, cancelamento de matrícula, restrição de serviços, decisões disciplinares ou qualquer decisão administrativa automática. O score **não é uma probabilidade** (ver §10) e não deve ser mostrado ao estudante como "X% de chance de evadir".

## 4. Dados
`base_unificada_asa-final.csv` (sha256 `3bd8ed7d31b40c1f…`): 12.842 registros com rótulo, 2.512 evasões (19,6%), nenhum valor ausente, 12.835 IDs únicos (7 repetidos). Atributos de matrícula/contexto, financeiros, histórico acadêmico e relacionamento. `ID_ALUNO` e `evadiu` não são atributos. **Sexo e Estado Civil foram excluídos** por não trazerem ganho (ROC-AUC 0,927 com e sem eles).

## 5. Rótulo
`evadiu` é derivado do status acadêmico, conforme a regra de negócio da base. É uma *proxy*; casos ambíguos devem ser tratados e versionados.

## 6. Treino e validação
Holdout estratificado 80/20 (10.273 treino, 2.569 teste), semente 42. Validação cruzada estratificada de 5 folds só no treino. Imputação por mediana (numéricos) e moda (categóricos); codificação ordinal para as árvores. Modelo treinado nos 80% de treino, que é o que as métricas abaixo avaliam.

## 7. Métricas (teste, limiar 0,50)
| Métrica | Valor |
|---|---|
| ROC-AUC | 0,927 (CV 0,937 ± 0,009) |
| PR-AUC | 0,826 (CV 0,851 ± 0,021) |
| Precisão / Recall / F1 | 0,739 / 0,738 / 0,738 |
| Brier | 0,081 |
| Precisão no top 10% | 0,941 |

Comparação: Regressão Logística (v0.1) ROC-AUC 0,814 e PR-AUC 0,562; Gradient Boosting ROC-AUC 0,915 e PR-AUC 0,791. Contra o Gradient Boosting a diferença no CV está dentro do desvio entre folds (empate técnico).

## 8. Faixas e limiares
| Faixa | Corte | Alunos no teste | Taxa de evasão observada |
|---|---|---|---|
| Verde | < 0,35 | 73,0% | 4,2% |
| Amarelo | 0,35 a 0,65 | 12,3% | 34,3% |
| Vermelho | ≥ 0,65 | 14,8% | 83,4% |

- **≥ 0,65:** fila de revisão humana prioritária (precisão 0,83, recall 0,63).
- **≥ 0,35:** rede ampla de acompanhamento (precisão 0,61, recall 0,84).
- Os cortes são parâmetros de protótipo mantidos da v0.1 e validados nesta versão; a escolha final depende da capacidade de atendimento da equipe.

## 9. Explicabilidade
Importância por permutação (queda de ROC-AUC): `valor_total_periodo` 0,169; `tempo_de_curso` 0,044; `media_notas` 0,032; `pct_parcelas_em_aberto` 0,027; `dias_desde_ultimo_contato` 0,026. Indica utilidade preditiva, **não causalidade**. Não há explicação individual por aluno neste modelo; para isso use as regras da v0.1 e a evidência do agente determinístico.

## 10. Riscos e limitações
1. **Possível vazamento temporal.** Sem financeiro e sem tempo/semestres o ROC-AUC cai de 0,927 para 0,811 (o nível do baseline). Quem evade acumula menos valor, parcelas e semestres, então esses atributos podem refletir a saída em vez de antecipá-la. **Validar a data de corte de cada atributo com o dono do dado.** Até lá, as métricas podem estar infladas.
2. **Sem validação temporal.** O holdout é aleatório; o desempenho em semestres futuros pode ser menor.
3. **Score não calibrado.** Previsto ~0,65 corresponde a ~0,52 observado. Usar para ordenar e para as faixas.
4. **Ponto cego em alunos com histórico:** recall 0,73 (limiar 0,35) contra 0,90 para alunos sem histórico; 79 dos 503 evadidos do teste não foram sinalizados.
5. **Equidade.** A taxa de alerta acompanha a evasão real de cada grupo, mas a carga de falsos alertas é maior na Noite (0,22 contra 0,09 na Manhã) e entre 40+ (0,28 contra 0,05 entre ≤ 20). *Transferência Mesma Rede* (n=102) tem ROC-AUC 0,75, falso positivo 0,40 e recall 0,20 em 0,65. Integral e faixa 26–30 têm recall menor. Amostras pequenas, intervalos largos.
6. **Campos ausentes** são imputados e podem mudar a faixa. `inferencia_risco.py` se abstém quando mais da metade dos campos falta e lista os campos ausentes.
7. **Rótulo proxy** e possível viés histórico da base.
8. Falso positivo gera abordagem desnecessária; falso negativo deixa o aluno sem apoio.

## 11. Monitoramento recomendado
ROC-AUC, PR-AUC, recall e precisão por faixa; distribuição do score e taxa de evasão por faixa a cada semestre; recall e taxa de falso alerta por Turno, Faixa etária e Forma de Ingresso; drift dos atributos (principalmente `valor_total_periodo`); taxa de acionamentos humanos e *overrides*. Reavaliar cortes e recalibrar a cada semestre.

## 12. Versionamento e reprodução
- Modelo `1.0.0`, scikit-learn 1.9.1 (o `.joblib` exige a mesma versão), semente 42, hash da base nos metadados.
- Reprodutibilidade verificada: scores do artefato recarregado idênticos aos do teste.
- Reproduzir: `ASA_Entrega2_IA_ML_Final.ipynb` (ou `python avaliacao_final.py`) com o CSV na mesma pasta.
- Agente determinístico em produção: `agent_version`/`config_version` gravados em cada execução (`agent_runs`).

## 13. Integração (status)
`inferencia_risco.pontuar(registro)` devolve `status`, `score`, `faixa`, `campos_ausentes`, `modelo_versao` e `aviso`. **Ainda não está ligado à API Node nem ao app.** Caminho previsto: nova rota no `agent-service` que carrega o artefato, nova versão do contrato JSON em `contracts/agent/` (e nas cópias verificadas por `check-contracts-sync.sh`), cliente na API Node e exibição da faixa com a evidência e a próxima ação, sempre com revisão humana.

## 14. RAG (herdado da v0.1)
O Hit@3 de 75% é da Entrega 1 (TF-IDF sobre trechos de um guia). A busca em produção da API é lexical sobre PostgreSQL e **não foi medida** nesta entrega.
