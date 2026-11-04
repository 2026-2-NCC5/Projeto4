"""ASA Conecta — Entrega 2 (Final). Gerado a partir do notebook ASA_Entrega2_IA_ML_Final.ipynb. Exige inferencia_risco.py na mesma pasta."""
import os, json, hashlib, warnings, numpy as np, pandas as pd
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_validate
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler, OrdinalEncoder
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.dummy import DummyClassifier
from sklearn.inspection import permutation_importance
from sklearn.calibration import calibration_curve
from sklearn.metrics import (roc_auc_score, average_precision_score, precision_score, recall_score, f1_score,
                             brier_score_loss, confusion_matrix, roc_curve, precision_recall_curve)
warnings.filterwarnings("ignore")
SEED, DATA, OUT = 42, "base_unificada_asa-final.csv", "resultados"
os.makedirs(OUT, exist_ok=True); os.makedirs("modelo", exist_ok=True)

raw = pd.read_csv(DATA)
df = raw.dropna(subset=["evadiu"]).copy()
df["evadiu"] = df["evadiu"].astype(int); df["tem_bolsa"] = df["tem_bolsa"].astype(int)
print(f"Linhas no arquivo: {len(raw)} | com rótulo: {len(df)} | IDs únicos: {df.ID_ALUNO.nunique()} (repetidos: {len(df)-df.ID_ALUNO.nunique()})")
print(f"Evasão: {df.evadiu.sum()} ({df.evadiu.mean():.1%}) | sha256 da base: {hashlib.sha256(open(DATA,'rb').read()).hexdigest()[:16]}")
aus = df.isna().sum()[lambda s: s>0]; print("\nColunas com valores ausentes:", "nenhuma" if aus.empty else aus.to_dict())
print("\nAlunos sem nenhum semestre de histórico (total_semestres==0):", f"{(df.total_semestres==0).mean():.1%}",
      "| taxa de evasão neles:", f"{df[df.total_semestres==0].evadiu.mean():.1%}", "vs", f"{df[df.total_semestres>0].evadiu.mean():.1%}", "nos demais")

SENS = ["Sexo", "Estado Civil"]                      # atributos pessoais cuja necessidade é testada
features = [c for c in df.columns if c not in ["ID_ALUNO", "evadiu"]]
is_cat = lambda c: df[c].dtype == "object" or str(df[c].dtype) == "str"
X, y = df[features], df["evadiu"]
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=.20, stratify=y, random_state=SEED)

def prep(cols, scale):
    num = [c for c in cols if not is_cat(c)]; cat = [c for c in cols if is_cat(c)]
    n = [("imp", SimpleImputer(strategy="median"))] + ([("sc", StandardScaler())] if scale else [])
    c = [("imp", SimpleImputer(strategy="most_frequent")),
         ("enc", OneHotEncoder(handle_unknown="ignore") if scale else OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1))]
    return ColumnTransformer([("num", Pipeline(n), num), ("cat", Pipeline(c), cat)])

RF = lambda: RandomForestClassifier(n_estimators=300, min_samples_leaf=5, class_weight="balanced_subsample", n_jobs=-1, random_state=SEED)
HGB = lambda: HistGradientBoostingClassifier(max_depth=4, learning_rate=.06, max_iter=250, class_weight="balanced", random_state=SEED)
no_sens = [c for c in features if c not in SENS]
models = {
    "Baseline (classe majoritária)": Pipeline([("p", prep(features, True)), ("m", DummyClassifier(strategy="prior"))]),
    "Regressão Logística":           Pipeline([("p", prep(features, True)), ("m", LogisticRegression(max_iter=2000, class_weight="balanced", random_state=SEED))]),
    "Random Forest":                 Pipeline([("p", prep(features, False)), ("m", RF())]),
    "Gradient Boosting (HistGB)":    Pipeline([("p", prep(features, False)), ("m", HGB())]),
    "Random Forest sem Sexo/Estado Civil": Pipeline([("p", prep(no_sens, False)), ("m", RF())]),
}
def prec_at(yt, s, frac):
    k = max(1, int(len(s)*frac)); return yt.values[np.argsort(-s)[:k]].mean()
def metrics(yt, p, thr=.5):
    pr = (p >= thr).astype(int)
    return dict(roc_auc=roc_auc_score(yt, p), pr_auc=average_precision_score(yt, p), precision=precision_score(yt, pr, zero_division=0),
                recall=recall_score(yt, pr), f1=f1_score(yt, pr), brier=brier_score_loss(yt, p),
                p_at_10=prec_at(yt, p, .10), p_at_20=prec_at(yt, p, .20))
skf = StratifiedKFold(5, shuffle=True, random_state=SEED)
rows, probs = [], {}
for name, m in models.items():
    cv = cross_validate(m, Xtr, ytr, cv=skf, scoring=["roc_auc", "average_precision", "f1", "recall"])
    m.fit(Xtr, ytr); probs[name] = m.predict_proba(Xte)[:, 1]
    rows.append(dict(modelo=name, **metrics(yte, probs[name]), cv_roc_auc=cv["test_roc_auc"].mean(), cv_roc_auc_dp=cv["test_roc_auc"].std(),
                     cv_pr_auc=cv["test_average_precision"].mean(), cv_pr_auc_dp=cv["test_average_precision"].std(), cv_f1=cv["test_f1"].mean(), cv_recall=cv["test_recall"].mean()))
comp = pd.DataFrame(rows); comp.to_csv(f"{OUT}/comparacao_modelos.csv", index=False)
pd.set_option("display.width", 220); pd.set_option("display.max_columns", 30)
print("Teste (limiar 0,50) e validação cruzada (5 folds, treino):")
print(comp.round(3).to_string(index=False))

fig, ax = plt.subplots(1, 3, figsize=(15, 4.2))
for n, p in probs.items():
    if n.startswith("Baseline"): continue
    f, t, _ = roc_curve(yte, p); ax[0].plot(f, t, label=f"{n} ({roc_auc_score(yte, p):.3f})")
    pr, rc, _ = precision_recall_curve(yte, p); ax[1].plot(rc, pr, label=f"{n} ({average_precision_score(yte, p):.3f})")
    fr, mp = calibration_curve(yte, p, n_bins=10, strategy="quantile"); ax[2].plot(mp, fr, "o-", label=n)
ax[0].plot([0,1],[0,1],"--",c="gray"); ax[0].set(title="ROC (teste)", xlabel="FPR", ylabel="TPR")
ax[1].axhline(yte.mean(), ls="--", c="gray"); ax[1].set(title="Precision–Recall (teste)", xlabel="Recall", ylabel="Precision")
ax[2].plot([0,1],[0,1],"--",c="gray"); ax[2].set(title="Calibração (teste)", xlabel="Probabilidade prevista", ylabel="Fração observada")
for a in ax: a.legend(fontsize=7)
plt.tight_layout(); plt.savefig(f"{OUT}/curvas_roc_pr_calibracao.png", dpi=140); plt.close()

FINAL = "Random Forest sem Sexo/Estado Civil"
final = models[FINAL]; pf = probs[FINAL]; FEATS = no_sens
rows = []
for t in np.round(np.arange(.10, .91, .05), 2):
    pr = (pf >= t).astype(int); tn, fp, fn, tp = confusion_matrix(yte, pr).ravel()
    rows.append(dict(limiar=t, precision=tp/max(tp+fp,1), recall=tp/(tp+fn), f1=f1_score(yte, pr), alertas_pct=pr.mean(), FP=fp, FN=fn))
thr = pd.DataFrame(rows); thr.to_csv(f"{OUT}/analise_limiares.csv", index=False)
print(thr.round(3).to_string(index=False))
bands = pd.cut(pf, [-.01, .35, .65, 1.01], labels=["Verde (<0,35)", "Amarelo (0,35–0,65)", "Vermelho (≥0,65)"])
faixa = pd.DataFrame({"faixa": bands, "y": yte.values}).groupby("faixa", observed=False).agg(alunos=("y","size"), evadiram=("y","sum"), taxa_evasao=("y","mean")).reset_index()
faixa["pct_do_teste"] = faixa.alunos / faixa.alunos.sum(); faixa.to_csv(f"{OUT}/faixas_risco.csv", index=False)
print("\nFaixas de risco (mesmos cortes 0,35/0,65 do protótipo da Entrega 1):"); print(faixa.round(3).to_string(index=False))
fig, ax = plt.subplots(figsize=(6.5, 4)); [ax.plot(thr.limiar, thr[c], label=c) for c in ["precision","recall","f1"]]
ax.axvline(.35, ls=":", c="gray"); ax.axvline(.65, ls=":", c="gray"); ax.set(title="Limiar de decisão (modelo final)", xlabel="Limiar"); ax.legend()
plt.tight_layout(); plt.savefig(f"{OUT}/limiares.png", dpi=140); plt.close()

fin  = ["total_parcelas","pct_parcelas_em_aberto","pct_parcelas_acordo","atraso_medio_dias","tem_bolsa","valor_total_periodo"]
hist = ["media_notas","media_assiduidade","pct_reprovacao","tendencia_notas","tendencia_assiduidade","total_semestres"]
rel  = ["total_contatos","dias_desde_ultimo_contato"]
cen = {"Modelo final (todas as features sem Sexo/Est. civil)": [], "Sem valor_total_periodo": ["valor_total_periodo"], "Sem financeiro": fin,
       "Sem histórico acadêmico": hist, "Sem relacionamento": rel, "Sem tempo_de_curso e total_semestres": ["tempo_de_curso","total_semestres"],
       "Sem financeiro e sem tempo/semestres": fin+["tempo_de_curso","total_semestres"], "Só matrícula/contexto": fin+hist+rel}
rows = []
for nome, drop in cen.items():
    fs = [c for c in FEATS if c not in drop]
    m = Pipeline([("p", prep(fs, False)), ("m", RF())]).fit(Xtr[fs], ytr); p = m.predict_proba(Xte[fs])[:, 1]
    rows.append(dict(cenario=nome, n_features=len(fs), roc_auc=roc_auc_score(yte, p), pr_auc=average_precision_score(yte, p)))
abl = pd.DataFrame(rows); abl.to_csv(f"{OUT}/ablacao_features.csv", index=False); print(abl.round(3).to_string(index=False))
print("\nMédias por desfecho:"); print(df.groupby("evadiu")[["valor_total_periodo","total_parcelas","tempo_de_curso","total_semestres"]].mean().round(1).to_string())
print("\nSplit por ID_ALUNO (sem aluno repetido entre treino e teste):")
from sklearn.model_selection import GroupShuffleSplit
tr, te = next(GroupShuffleSplit(1, test_size=.2, random_state=SEED).split(df, groups=df.ID_ALUNO))
m = Pipeline([("p", prep(FEATS, False)), ("m", RF())]).fit(df.iloc[tr][FEATS], df.iloc[tr].evadiu); p = m.predict_proba(df.iloc[te][FEATS])[:, 1]
print(f"ROC-AUC {roc_auc_score(df.iloc[te].evadiu, p):.3f} | PR-AUC {average_precision_score(df.iloc[te].evadiu, p):.3f}  (7 IDs repetidos na base; sem efeito material)")

d = Xte[FEATS + SENS].copy(); d["y"] = yte.values; d["p"] = pf
d["Faixa etária"] = pd.cut(d.Idade, [0,20,25,30,40,200], labels=["≤20","21-25","26-30","31-40","40+"])
def grp(s, t):
    pr = (s.p >= t); pos = s.y == 1
    return pr.mean(), (pr[pos].mean() if pos.any() else np.nan), (pr[~pos].mean() if (~pos).any() else np.nan), (s.y[pr].mean() if pr.any() else np.nan)
rows = []
for g in ["Sexo","Turno","Forma de Ingresso","Grau Acadêmico","Faixa etária","tem_bolsa"]:
    for v, s in d.groupby(g, observed=True):
        if len(s) < 30: continue
        a35 = grp(s, .35); a65 = grp(s, .65)
        rows.append(dict(atributo=g, grupo=str(v), n=len(s), taxa_evasao=s.y.mean(), alerta_035=a35[0], recall_035=a35[1], fpr_035=a35[2], alerta_065=a65[0], recall_065=a65[1], precision_065=a65[3],
                         roc_auc=roc_auc_score(s.y, s.p) if 0 < s.y.sum() < len(s) else np.nan))
eq = pd.DataFrame(rows); eq.to_csv(f"{OUT}/equidade_subgrupos.csv", index=False)
print(eq.round(3).to_string(index=False))
print("\nMaiores diferenças de recall (limiar 0,35) entre grupos de mesmo atributo, n≥70:")
r = eq[eq.n >= 70].groupby("atributo").apply(lambda s: pd.Series(dict(pior=s.loc[s.recall_035.idxmin(),"grupo"], recall_pior=s.recall_035.min(), melhor=s.loc[s.recall_035.idxmax(),"grupo"], recall_melhor=s.recall_035.max())))
print(r.round(3).to_string())

T = .35
d["pred"] = (d.p >= T).astype(int)
d["tipo"] = np.select([(d.y==1)&(d.pred==1), (d.y==1)&(d.pred==0), (d.y==0)&(d.pred==1)], ["VP","FN","FP"], "VN")
cols = ["Idade","tempo_de_curso","total_semestres","media_notas","media_assiduidade","valor_total_periodo","pct_parcelas_em_aberto","dias_desde_ultimo_contato"]
err = d.groupby("tipo")[cols + ["p"]].mean().T; err.loc["n"] = d.tipo.value_counts(); err.to_csv(f"{OUT}/analise_erros_perfil.csv")
print(f"Perfil médio por tipo de resultado (limiar {T}):"); print(err.round(2).to_string())
d["historico"] = np.where(d.total_semestres == 0, "sem histórico (0 semestres)", "com histórico")
sem = d.groupby("historico").apply(lambda s: pd.Series(dict(n=len(s), taxa_evasao=s.y.mean(), roc_auc=roc_auc_score(s.y, s.p), recall=(s.pred[s.y==1]==1).mean(), precision=s.y[s.pred==1].mean()))).reset_index()
sem.to_csv(f"{OUT}/erros_por_historico.csv", index=False); print("\nDesempenho por existência de histórico:"); print(sem.round(3).to_string(index=False))

pi = permutation_importance(final, Xte[FEATS], yte, scoring="roc_auc", n_repeats=8, random_state=SEED, n_jobs=1)
imp = pd.DataFrame({"atributo": FEATS, "importancia_auc": pi.importances_mean, "desvio": pi.importances_std}).sort_values("importancia_auc", ascending=False)
imp.to_csv(f"{OUT}/importancia_atributos_final.csv", index=False); print(imp.head(12).round(4).to_string(index=False))
fig, ax = plt.subplots(figsize=(6.5, 5)); t = imp.head(12)[::-1]; ax.barh(t.atributo, t.importancia_auc, xerr=t.desvio)
ax.set(title="Importância por permutação (queda de ROC-AUC) — modelo final"); plt.tight_layout(); plt.savefig(f"{OUT}/importancia_atributos_final.png", dpi=140); plt.close()

import joblib, sklearn
VERSAO = "1.0.0"
joblib.dump(final, "modelo/modelo_risco_evasao_v1.0.0.joblib", compress=3)
meta = dict(modelo="Random Forest (300 árvores, min_samples_leaf=5, class_weight=balanced_subsample)", versao=VERSAO, features=FEATS, atributos_excluidos=SENS,
            faixas=dict(verde_ate=.35, vermelho_a_partir=.65), sklearn=sklearn.__version__, semente=SEED,
            base_sha256=hashlib.sha256(open(DATA,"rb").read()).hexdigest(), n_treino=len(Xtr), n_teste=len(Xte),
            metricas_teste_limiar_050=metrics(yte, pf, .5), cv_pr_auc=float(comp.set_index("modelo").loc[FINAL,"cv_pr_auc"]), cv_roc_auc=float(comp.set_index("modelo").loc[FINAL,"cv_roc_auc"]))
json.dump(meta, open("modelo/modelo_meta_v1.0.0.json", "w"), indent=2, ensure_ascii=False, default=float)
pd.DataFrame({"y": yte.values, "score": pf, "faixa": bands.astype(str)}).to_csv(f"{OUT}/scores_teste_final.csv", index=False)
# reprodutibilidade: recarregar o artefato e conferir que os scores são idênticos
re = joblib.load("modelo/modelo_risco_evasao_v1.0.0.joblib").predict_proba(Xte[FEATS])[:, 1]
print("Scores idênticos após recarregar o artefato:", bool(np.allclose(re, pf)), "| tamanho do arquivo (MB):", round(os.path.getsize("modelo/modelo_risco_evasao_v1.0.0.joblib")/1e6, 1))
import inferencia_risco as ir
ex = Xte[FEATS].iloc[0].to_dict(); print("\nExemplo de inferência:", json.dumps(ir.pontuar(ex), ensure_ascii=False))
print("Registro incompleto (sem 'Idade' e 'Turno'):", json.dumps(ir.pontuar({k: v for k, v in ex.items() if k not in ("Idade","Turno")}), ensure_ascii=False))
