"""RAG inicial local e simples com TF-IDF, sem dependência de API externa."""
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

DOCUMENTOS = [
    ("Guia ASA - Rótulo", "Status Acadêmico define o rótulo; a coluna usada no rótulo nunca deve virar feature."),
    ("Guia ASA - Financeiro", "Atributos: percentual em aberto, acordos, atraso médio, bolsa e valor total."),
    ("Guia ASA - Histórico", "Atributos: média de notas, assiduidade, reprovação, tendências e total de semestres."),
    ("Guia ASA - Relacionamentos", "Excluir Motivo da Evasão e sinais explícitos de risco quando causarem vazamento.")
]
v = TfidfVectorizer(strip_accents="unicode", ngram_range=(1,2))
M = v.fit_transform([d[1] for d in DOCUMENTOS])

def responder(pergunta, k=2):
    sims = cosine_similarity(v.transform([pergunta]), M)[0]
    ids = np.argsort(sims)[::-1][:k]
    trechos = [DOCUMENTOS[i] for i in ids]
    resposta = " ".join(t[1] for t in trechos)
    fontes = [t[0] for t in trechos]
    return {"resposta": resposta, "fontes": fontes, "scores": [float(sims[i]) for i in ids]}

if __name__ == "__main__":
    print(responder("Quais dados financeiros ajudam a monitorar risco?"))
