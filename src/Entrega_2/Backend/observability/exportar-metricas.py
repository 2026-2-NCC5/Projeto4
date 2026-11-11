#!/usr/bin/env python3
"""Exporta as séries do Prometheus de uma janela de teste para JSON (base dos gráficos do relatório).

    python3 exportar-metricas.py --inicio 2026-11-11T22:36:00Z --fim 2026-11-11T22:44:00Z --saida resultados/series-antes.json

Só usa a biblioteca padrão. O Prometheus local fica em 127.0.0.1 (PROMETHEUS_URL para outra porta).
"""
import argparse
import json
import os
import urllib.parse
import urllib.request

SVC = 'container_label_com_docker_compose_service=~"api|agent-service|db"'
BY_SVC = "container_label_com_docker_compose_service"
LAT = 'sum by (le) (rate(asa_http_request_duration_seconds_bucket{route!="unmatched"}[30s]))'

CONSULTAS = {
    "rps": "sum(rate(asa_http_requests_total[30s]))",
    "rps_5xx": 'sum(rate(asa_http_requests_total{status_code=~"5.."}[30s])) or vector(0)',
    "rps_4xx": 'sum(rate(asa_http_requests_total{status_code=~"4.."}[30s])) or vector(0)',
    "lat_p50": f"histogram_quantile(0.50, {LAT})",
    "lat_p95": f"histogram_quantile(0.95, {LAT})",
    "lat_p99": f"histogram_quantile(0.99, {LAT})",
    "lat_p95_rota": 'histogram_quantile(0.95, sum by (le, route) (rate(asa_http_request_duration_seconds_bucket{route!="unmatched"}[30s])))',
    "cpu_processo_api": 'rate(process_cpu_seconds_total{job="api"}[30s])',
    "rss_api": 'process_resident_memory_bytes{job="api"}',
    "heap_api": 'nodejs_heap_used_bytes{job="api"}',
    "eventloop_p99": 'nodejs_eventloop_lag_seconds{job="api",quantile="0.99"}',
    "pool_em_uso": 'asa_db_pool_connections{job="api",state="in_use"}',
    "pool_espera": 'asa_db_pool_connections{job="api",state="waiting"}',
    "cpu_conteiner": f"sum by ({BY_SVC}) (rate(container_cpu_usage_seconds_total{{{SVC}}}[30s]))",
    "mem_conteiner": f"sum by ({BY_SVC}) (container_memory_working_set_bytes{{{SVC}}})",
    "throttling": f"sum by ({BY_SVC}) (rate(container_cpu_cfs_throttled_periods_total{{{SVC}}}[30s])) / clamp_min(sum by ({BY_SVC}) (rate(container_cpu_cfs_periods_total{{{SVC}}}[30s])), 1e-9)",
    "pg_conexoes": 'sum(pg_stat_activity_count{datname="asa_conecta"})',
    "pg_commits": 'sum(rate(pg_stat_database_xact_commit{datname="asa_conecta"}[30s]))',
    "k6_vus": "sum(k6_vus)",
    "k6_rps": "sum(rate(k6_http_reqs_total[30s]))",
    "k6_p95": 'max(k6_http_req_duration_p95{name!="setup"})',
    "k6_falhas": 'avg(k6_http_req_failed_rate{name!="setup"})',
}


def consultar(base, expr, inicio, fim, passo):
    query = urllib.parse.urlencode({"query": expr, "start": inicio, "end": fim, "step": passo})
    with urllib.request.urlopen(f"{base}/api/v1/query_range?{query}", timeout=30) as resposta:
        corpo = json.load(resposta)
    if corpo.get("status") != "success":
        raise RuntimeError(f"{expr}: {corpo}")
    series = []
    for item in corpo["data"]["result"]:
        rotulo = ",".join(f"{k}={v}" for k, v in sorted(item["metric"].items()) if k != "__name__") or "valor"
        pontos = [[float(t), None if v in ("NaN", "+Inf", "-Inf") else float(v)] for t, v in item["values"]]
        series.append({"rotulo": rotulo, "pontos": pontos})
    return series


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--inicio", required=True)
    parser.add_argument("--fim", required=True)
    parser.add_argument("--passo", default="5s")
    parser.add_argument("--saida", required=True)
    args = parser.parse_args()
    base = os.environ.get("PROMETHEUS_URL", "http://127.0.0.1:9090")
    dados = {"inicio": args.inicio, "fim": args.fim, "passo": args.passo,
             "series": {nome: consultar(base, expr, args.inicio, args.fim, args.passo) for nome, expr in CONSULTAS.items()},
             "consultas": CONSULTAS}
    with open(args.saida, "w", encoding="utf-8") as arquivo:
        json.dump(dados, arquivo, ensure_ascii=False)
    print(f"{len(CONSULTAS)} consultas → {args.saida}")


if __name__ == "__main__":
    main()
