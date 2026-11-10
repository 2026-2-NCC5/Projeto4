"""Inferência do score de risco de evasão (ASA Conecta, modelo 1.0.0).

Uso:
    from inferencia_risco import pontuar
    pontuar({"Forma de Ingresso": "Enem", "Grau Acadêmico": "Bacharelado", ...})

Saída: score (0–1), faixa (Verde/Amarelo/Vermelho), versão do modelo e campos ausentes.
O score serve para PRIORIZAR REVISÃO HUMANA; nunca para decisão administrativa automática.
Campos ausentes são imputados pelo próprio pipeline (mediana/moda do treino) e listados em `campos_ausentes`.
"""
from __future__ import annotations
import json, math, pathlib
import joblib, pandas as pd

_DIR = pathlib.Path(__file__).parent / "modelo"
_META = json.loads((_DIR / "modelo_meta_v1.0.0.json").read_text(encoding="utf-8"))
_MODEL = joblib.load(_DIR / "modelo_risco_evasao_v1.0.0.joblib")
FEATURES = _META["features"]
AVISO = "Score de apoio à priorização; requer revisão humana. Não é decisão administrativa."


def faixa(score: float) -> str:
    v, r = _META["faixas"]["verde_ate"], _META["faixas"]["vermelho_a_partir"]
    return "Verde" if score < v else ("Amarelo" if score < r else "Vermelho")


def pontuar(registro: dict) -> dict:
    if not isinstance(registro, dict):
        raise TypeError("registro deve ser um dict com os atributos do aluno")
    ausentes = [c for c in FEATURES if registro.get(c) is None or (isinstance(registro.get(c), float) and math.isnan(registro[c]))]
    if len(ausentes) > len(FEATURES) // 2:
        return {"status": "abstained", "motivo": "Dados insuficientes para pontuar com confiança.", "campos_ausentes": ausentes,
                "modelo_versao": _META["versao"], "aviso": AVISO}
    linha = pd.DataFrame([{c: registro.get(c) for c in FEATURES}])
    score = float(_MODEL.predict_proba(linha)[0, 1])
    return {"status": "scored", "score": round(score, 4), "faixa": faixa(score), "campos_ausentes": ausentes,
            "modelo_versao": _META["versao"], "aviso": AVISO}
