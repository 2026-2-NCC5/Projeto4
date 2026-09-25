import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


# ============================================================
# 1. CARREGAMENTO DOS DADOS
# ============================================================

rel = pd.read_excel("Relacionamentos.xlsx")
rel = rel[["ID_ALUNO", "Tema Relacionamento", "Motivo do Contato"]].fillna("Não informado")


# ============================================================
# 2. TEXTO DE CADA REGISTRO HISTÓRICO
# ============================================================

rel["texto"] = (
    rel["Motivo do Contato"].astype(str) + " " + rel["Tema Relacionamento"].astype(str)
)


# ============================================================
# 3. VETORIZAÇÃO DO HISTÓRICO (TF-IDF)
# ============================================================
# TF-IDF em vez de contagem simples: palavras que aparecem em
# muitos registros (ex: "via", "do", "de") pesam menos, e palavras
# específicas de um assunto (ex: "boleto", "trancamento") pesam mais.
# Isso evita que conectores comuns dominem a similaridade.

stopwords_pt = [
    "de", "do", "da", "das", "dos", "a", "o", "as", "os", "um", "uma",
    "uns", "umas", "para", "com", "em", "no", "na", "nos", "nas", "via",
    "ao", "aos", "à", "às", "e", "ou", "que",
]

vectorizer = TfidfVectorizer(stop_words=stopwords_pt)
X = vectorizer.fit_transform(rel["texto"])

print("Matriz de registros históricos:", X.shape)


# ============================================================
# 4. ENTRADA: PERGUNTA DO ESTUDANTE
# ============================================================

pergunta = input("Digite a pergunta do estudante: ")
# exemplo pra testar: "segunda via do boleto"


# ============================================================
# 5. REPRESENTAÇÃO EM VETOR DA PERGUNTA
# ============================================================
# Mesmo espaço vetorial (mesmo vocabulário e pesos) do histórico.

vetor_pergunta = vectorizer.transform([pergunta])


# ============================================================
# 6. ÁLGEBRA LINEAR: PRODUTO ESCALAR E SIMILARIDADE DE COSSENO
# ============================================================

# cálculo manual, pra deixar explícita a fórmula por trás do cosine_similarity:
v = vetor_pergunta.toarray()[0]
r0 = X[0].toarray()[0]
produto_escalar_manual = np.dot(v, r0)
sim_manual = produto_escalar_manual / (np.linalg.norm(v) * np.linalg.norm(r0) + 1e-9)
print("Exemplo manual (pergunta x 1º registro) — produto escalar:", round(produto_escalar_manual, 4),
      "| cosseno:", round(sim_manual, 4))

# vetorizado, contra todos os registros de uma vez:
similaridades = cosine_similarity(vetor_pergunta, X)[0]


# ============================================================
# 7. REGISTROS SEMELHANTES
# ============================================================

top_n = 5
indices_similares = similaridades.argsort()[::-1][:top_n]

resultado = rel.iloc[indices_similares].copy()
resultado["similaridade"] = similaridades[indices_similares]

print("\nRegistros mais semelhantes à pergunta:")
print(resultado[["Motivo do Contato", "Tema Relacionamento", "similaridade"]])


# ============================================================
# 8. IDENTIFICAÇÃO DO TEMA
# ============================================================
# Abaixo do limiar, o agente admite que não sabe em vez de
# inventar um procedimento (exigência do enunciado).

LIMIAR_CONFIANCA = 0.3

if similaridades[indices_similares[0]] < LIMIAR_CONFIANCA:
    motivo_identificado = None
    print("\nNenhum registro suficientemente semelhante encontrado.")
else:
    motivo_identificado = resultado["Motivo do Contato"].mode()[0]
    print("\nMotivo identificado:", motivo_identificado)


# ============================================================
# 9. ORIENTAÇÃO AO ESTUDANTE
# ============================================================

if motivo_identificado:
    print(f"\nOrientação: sua solicitação foi identificada como '{motivo_identificado}'. "
          f"Buscando o procedimento oficial correspondente na base de conhecimento do ASA...")
else:
    print("\nOrientação: não consegui identificar sua solicitação com confiança suficiente. "
          "Encaminhando para atendimento humano.")

