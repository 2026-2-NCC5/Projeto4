"""Gráficos do relatório (matplotlib), gerados a partir das evidências em ../evidencias.

Paleta categórica fixa (validada para daltonismo): azul = API / "antes", laranja = banco / "depois",
verde-água = serviço do agente. Sem eixo duplo: medidas diferentes ficam em painéis separados.
"""
import csv
import json
from datetime import datetime, timezone
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

AZUL, LARANJA, VERDE = "#2a78d6", "#eb6834", "#1baf7a"
TINTA, TINTA2, GRADE, FUNDO = "#0b0b0b", "#52514e", "#e6e5e1", "#fcfcfb"
SERVICOS = {"api": ("API (Node.js)", AZUL), "db": ("PostgreSQL", LARANJA), "agent-service": ("Agente (FastAPI)", VERDE)}

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 9, "axes.edgecolor": GRADE, "axes.labelcolor": TINTA2,
    "axes.titlesize": 10, "axes.titleweight": "bold", "axes.titlecolor": TINTA, "axes.titlelocation": "left",
    "xtick.color": TINTA2, "ytick.color": TINTA2, "axes.grid": True, "grid.color": GRADE, "grid.linewidth": 0.6,
    "axes.spines.top": False, "axes.spines.right": False, "figure.facecolor": "white", "axes.facecolor": FUNDO,
    "legend.frameon": False, "legend.fontsize": 8.5, "lines.linewidth": 2, "savefig.dpi": 200,
})


def carregar(caminho):
    return json.loads(Path(caminho).read_text(encoding="utf-8"))


def serie(dados, nome, filtro=None):
    """Lista de (minutos desde o início, valor) da primeira série que contém `filtro` no rótulo."""
    inicio = datetime.fromisoformat(dados["inicio"].replace("Z", "+00:00")).timestamp()
    for item in dados["series"].get(nome, []):
        if filtro is None or filtro in item["rotulo"]:
            return [((t - inicio) / 60, v) for t, v in item["pontos"] if v is not None]
    return []


def pico(dados, nome, filtro=None):
    valores = [v for _, v in serie(dados, nome, filtro)]
    return max(valores) if valores else 0.0


def _xy(pontos, escala=1.0):
    return [p[0] for p in pontos], [p[1] * escala for p in pontos]


def _rotulo_final(ax, pontos, texto, cor, escala=1.0):
    if pontos:
        x, y = pontos[-1][0], pontos[-1][1] * escala
        ax.annotate(texto, (x, y), xytext=(4, 0), textcoords="offset points", color=TINTA2, fontsize=8, va="center")


def grafico_rampa(dados, saida):
    fig, eixos = plt.subplots(3, 1, figsize=(7.2, 6.2), sharex=True)
    vus = serie(dados, "k6_vus")
    eixos[0].plot(*_xy(vus), color=AZUL)
    eixos[0].set_title("Usuários virtuais simultâneos (k6)")
    rps = serie(dados, "rps")
    eixos[1].plot(*_xy(rps), color=AZUL)
    eixos[1].set_title("Requisições atendidas por segundo (API)")
    p95s = serie(dados, "lat_p95")
    p95c = serie(dados, "k6_p95")
    eixos[2].plot(*_xy(p95s, 1000), color=AZUL, label="p95 no servidor (histograma da API)")
    eixos[2].plot(*_xy(p95c, 1000), color=LARANJA, label="p95 no cliente (k6, rota mais lenta da jornada)")
    eixos[2].set_title("Latência p95 (ms)")
    eixos[2].legend(loc="upper left")
    eixos[2].set_xlabel("minutos desde o início do teste")
    for ax in eixos:
        ax.set_ylim(bottom=0)
    fig.tight_layout()
    fig.savefig(saida)
    plt.close(fig)


def grafico_estresse(antes, depois, saida):
    fig, eixos = plt.subplots(3, 1, figsize=(7.2, 6.6), sharex=True)
    for dados, cor, nome in ((antes, AZUL, "antes: banco com 1 vCPU"), (depois, LARANJA, "depois: banco com 2 vCPU")):
        eixos[0].plot(*_xy(serie(dados, "rps")), color=cor, label=nome)
        eixos[1].plot(*_xy(serie(dados, "lat_p95")), color=cor, label=nome)
        eixos[2].plot(*_xy(serie(dados, "pool_espera")), color=cor, label=nome)
    eixos[0].set_title("Requisições atendidas por segundo")
    eixos[0].legend(loc="upper left")
    eixos[1].set_title("Latência p95 no servidor (s)")
    eixos[1].axhline(1.0, color=TINTA2, linewidth=1, linestyle=(0, (4, 3)))
    eixos[1].annotate("objetivo: p95 < 1 s", (0.1, 1.0), xytext=(0, 3), textcoords="offset points", fontsize=8, color=TINTA2)
    eixos[2].set_title("Requisições esperando conexão no pool do banco")
    eixos[2].set_xlabel("minutos desde o início (taxa de jornadas sobe de 5 a 100 por segundo)")
    for ax in eixos:
        ax.set_ylim(bottom=0)
    fig.tight_layout()
    fig.savefig(saida)
    plt.close(fig)


def grafico_cpu(antes, depois, saida):
    fig, eixos = plt.subplots(1, 2, figsize=(7.2, 3.0), sharey=True)
    for ax, dados, titulo in ((eixos[0], antes, "Antes (banco com 1 vCPU)"), (eixos[1], depois, "Depois (banco com 2 vCPU)")):
        for chave, (nome, cor) in SERVICOS.items():
            pontos = serie(dados, "cpu_conteiner", f"service={chave}")
            ax.plot(*_xy(pontos), color=cor, label=nome)
        ax.set_title(titulo)
        ax.set_xlabel("minutos")
        ax.set_ylim(bottom=0)
    eixos[0].set_ylabel("núcleos de CPU em uso")
    eixos[1].legend(loc="upper left")
    fig.tight_layout()
    fig.savefig(saida)
    plt.close(fig)


def grafico_memoria(depois, saida):
    fig, ax = plt.subplots(figsize=(7.2, 2.6))
    for chave, (nome, cor) in SERVICOS.items():
        pontos = serie(depois, "mem_conteiner", f"service={chave}")
        ax.plot(*_xy(pontos, 1 / 2**20), color=cor, label=nome)
        _rotulo_final(ax, pontos, f"{pontos[-1][1] / 2**20:.0f} MiB" if pontos else "", cor, 1 / 2**20)
    ax.set_title("Memória em uso por contêiner no estresse (MiB, working set do cgroup)")
    ax.set_xlabel("minutos")
    ax.set_ylim(bottom=0)
    ax.legend(loc="upper left", ncol=3)
    fig.tight_layout()
    fig.savefig(saida)
    plt.close(fig)


def grafico_producao(k6prod, cold_csv, saida):
    metricas = k6prod["metrics"]
    rotas = [("health", "/health\n(banco e agente)"), ("info", "/api/platform/\ninfo"), ("portal", "portal\n(CDN)")]
    fig, eixos = plt.subplots(1, 2, figsize=(7.2, 2.9), gridspec_kw={"width_ratios": [1.25, 1]})
    largura = 0.26
    for i, (chave, cor, nome) in enumerate((("med", AZUL, "mediana"), ("p(95)", LARANJA, "p95"), ("p(99)", VERDE, "p99"))):
        valores = [metricas.get(f"http_req_duration{{rota:{r}}}", {}).get("values", {}).get(chave, 0) for r, _ in rotas]
        xs = [j + (i - 1) * largura for j in range(len(rotas))]
        eixos[0].bar(xs, valores, width=largura - 0.03, color=cor, label=nome)
    eixos[0].set_xticks(range(len(rotas)), [n for _, n in rotas])
    eixos[0].set_title("Latência em produção por rota (ms)")
    eixos[0].legend(loc="upper right")
    eixos[0].grid(axis="x", visible=False)
    linhas = list(csv.DictReader(open(cold_csv, encoding="utf-8")))
    seq = [int(l["seq"]) for l in linhas if l["http"] == "200"]
    tot = [float(l["t_total"]) * 1000 for l in linhas if l["http"] == "200"]
    eixos[1].plot(seq, tot, color=AZUL, marker="o", markersize=5)
    eixos[1].set_title("Cold start de /health (ms)")
    eixos[1].set_xlabel("requisição nº (1 s de intervalo)")
    if tot:
        eixos[1].annotate(f"{tot[0]:.0f} ms (instância fria)", (seq[0], tot[0]), xytext=(8, -4), textcoords="offset points", fontsize=8, color=TINTA2)
    eixos[1].set_ylim(bottom=0)
    fig.tight_layout()
    fig.savefig(saida)
    plt.close(fig)


def capacidade_sla(dados, limite=1.0):
    """Maior vazão atendida enquanto o p95 do servidor ficou abaixo do limite (segundos)."""
    rps = dict(serie(dados, "rps"))
    p95 = dict(serie(dados, "lat_p95"))
    ok = [rps[t] for t in rps if t in p95 and p95[t] < limite]
    return max(ok) if ok else 0.0


def gerar_todos(evid: Path, img: Path):
    img.mkdir(parents=True, exist_ok=True)
    rampa = carregar(evid / "series-rampa.json")
    antes = carregar(evid / "series-estresse-antes.json")
    depois = carregar(evid / "series-estresse-depois.json")
    grafico_rampa(rampa, img / "grafico-rampa.png")
    grafico_estresse(antes, depois, img / "grafico-estresse.png")
    grafico_cpu(antes, depois, img / "grafico-cpu-conteineres.png")
    grafico_memoria(depois, img / "grafico-memoria.png")
    grafico_producao(carregar(evid / "k6-producao.json"), evid / "producao-cold-start.csv", img / "grafico-producao.png")
    return {"rampa": rampa, "antes": antes, "depois": depois}
