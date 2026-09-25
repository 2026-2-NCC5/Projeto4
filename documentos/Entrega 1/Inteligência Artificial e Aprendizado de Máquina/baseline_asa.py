"""
ASA Conecta — baseline de risco de evasão.
Uso: python baseline_asa.py base_unificada_asa-final.csv
"""
import sys
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, roc_auc_score, average_precision_score

path = sys.argv[1] if len(sys.argv) > 1 else "base_unificada_asa-final.csv"
df = pd.read_csv(path).dropna(subset=["evadiu"]).copy()
df["evadiu"] = df["evadiu"].astype(int)

features = [c for c in df.columns if c not in ["ID_ALUNO", "evadiu"]]
cat = [c for c in features if df[c].dtype == "object"]
num = [c for c in features if c not in cat]
X, y = df[features], df["evadiu"]

pre = ColumnTransformer([
    ("num", Pipeline([("imputer", SimpleImputer(strategy="median")),
                      ("scaler", StandardScaler())]), num),
    ("cat", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")),
                      ("onehot", OneHotEncoder(handle_unknown="ignore"))]), cat),
])
model = Pipeline([
    ("preprocess", pre),
    ("model", LogisticRegression(max_iter=2000, class_weight="balanced", random_state=42)),
])

Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=.20, stratify=y, random_state=42)
model.fit(Xtr, ytr)
p = model.predict_proba(Xte)[:, 1]
pred = (p >= .50).astype(int)

print(classification_report(yte, pred, digits=3))
print("ROC-AUC:", round(roc_auc_score(yte, p), 4))
print("PR-AUC:", round(average_precision_score(yte, p), 4))
