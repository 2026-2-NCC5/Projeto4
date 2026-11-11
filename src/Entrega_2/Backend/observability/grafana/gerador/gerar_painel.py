import json, sys
DS = {"type": "prometheus", "uid": "prometheus"}
panels = []
pid = [0]
def nid():
    pid[0] += 1
    return pid[0]
def target(expr, legend="", ref="A"):
    return {"datasource": DS, "expr": expr, "legendFormat": legend, "refId": ref, "range": True}
def stat(title, expr, unit, x, y, w=4, h=4, thresholds=None, decimals=None, desc=""):
    p = {"id": nid(), "type": "stat", "title": title, "description": desc, "datasource": DS,
         "gridPos": {"x": x, "y": y, "w": w, "h": h},
         "targets": [target(expr)],
         "options": {"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                     "colorMode": "value", "graphMode": "area", "textMode": "value", "justifyMode": "auto"},
         "fieldConfig": {"defaults": {"unit": unit, "thresholds": {"mode": "absolute", "steps": thresholds or [{"color": "green", "value": None}]}}, "overrides": []}}
    if decimals is not None:
        p["fieldConfig"]["defaults"]["decimals"] = decimals
    panels.append(p)
def ts(title, targets, unit, x, y, w=12, h=8, stack=False, desc="", minv=None):
    p = {"id": nid(), "type": "timeseries", "title": title, "description": desc, "datasource": DS,
         "gridPos": {"x": x, "y": y, "w": w, "h": h},
         "targets": [target(e, l, chr(65 + i)) for i, (e, l) in enumerate(targets)],
         "options": {"legend": {"displayMode": "table", "placement": "bottom", "calcs": ["mean", "max", "lastNotNull"]},
                     "tooltip": {"mode": "multi", "sort": "desc"}},
         "fieldConfig": {"defaults": {"unit": unit, "custom": {"lineWidth": 2, "fillOpacity": 15 if stack else 5,
                          "stacking": {"mode": "normal" if stack else "none", "group": "A"}, "showPoints": "never"}}, "overrides": []}}
    if minv is not None:
        p["fieldConfig"]["defaults"]["min"] = minv
    panels.append(p)
def row(title, y):
    panels.append({"id": nid(), "type": "row", "title": title, "collapsed": False, "gridPos": {"x": 0, "y": y, "w": 24, "h": 1}, "panels": []})

SVC = 'container_label_com_docker_compose_service=~"api|agent-service|db",container_label_com_docker_compose_project=~"$projeto"'
row("Visão geral (API)", 0)
stat("API no ar", 'up{job="api"}', "none", 0, 1, thresholds=[{"color": "red", "value": None}, {"color": "green", "value": 1}], desc="1 = o Prometheus consegue coletar /metrics da API")
stat("Requisições/s", 'sum(rate(asa_http_requests_total[1m]))', "reqps", 4, 1, decimals=1)
stat("Latência p95 (servidor)", 'histogram_quantile(0.95, sum by (le) (rate(asa_http_request_duration_seconds_bucket{route!="unmatched"}[1m])))', "s", 8, 1,
     thresholds=[{"color": "green", "value": None}, {"color": "orange", "value": 0.5}, {"color": "red", "value": 1}], decimals=3)
stat("Erros 5xx", '(sum(rate(asa_http_requests_total{status_code=~"5.."}[1m])) or vector(0)) / clamp_min(sum(rate(asa_http_requests_total[1m])), 1e-9)', "percentunit", 12, 1,
     thresholds=[{"color": "green", "value": None}, {"color": "orange", "value": 0.01}, {"color": "red", "value": 0.02}], decimals=2)
stat("CPU da API", 'rate(process_cpu_seconds_total{job="api"}[1m])', "percentunit", 16, 1,
     thresholds=[{"color": "green", "value": None}, {"color": "orange", "value": 0.7}, {"color": "red", "value": 0.9}], decimals=0, desc="Fração de 1 núcleo usada pelo processo Node.js (limite do contêiner: 1 vCPU)")
stat("Memória (RSS) da API", 'process_resident_memory_bytes{job="api"}', "bytes", 20, 1, decimals=0)

row("Tráfego, latência e erros", 5)
ts("Requisições por status", [('sum by (status_code) (rate(asa_http_requests_total[1m]))', "{{status_code}}")], "reqps", 0, 6, stack=True)
ts("Latência da API (servidor)", [
    ('histogram_quantile(0.50, sum by (le) (rate(asa_http_request_duration_seconds_bucket{route!="unmatched"}[1m])))', "p50"),
    ('histogram_quantile(0.95, sum by (le) (rate(asa_http_request_duration_seconds_bucket{route!="unmatched"}[1m])))', "p95"),
    ('histogram_quantile(0.99, sum by (le) (rate(asa_http_request_duration_seconds_bucket{route!="unmatched"}[1m])))', "p99")], "s", 12, 6)
ts("p95 por rota", [('histogram_quantile(0.95, sum by (le, method, route) (rate(asa_http_request_duration_seconds_bucket{route!="unmatched"}[1m])))', "{{method}} {{route}}")], "s", 0, 14, w=24, h=9)

row("Sistema operacional e contêineres (cgroups)", 23)
ts("CPU por contêiner (núcleos)", [(f'sum by (container_label_com_docker_compose_service) (rate(container_cpu_usage_seconds_total{{{SVC}}}[1m]))', "{{container_label_com_docker_compose_service}}")], "short", 0, 24,
   desc="1,0 = um núcleo inteiro. Cada contêiner tem limite de 1 vCPU (cgroup cpu.max).", minv=0)
ts("Memória por contêiner (working set)", [(f'sum by (container_label_com_docker_compose_service) (container_memory_working_set_bytes{{{SVC}}})', "{{container_label_com_docker_compose_service}}")], "bytes", 12, 24, minv=0)
ts("Throttling de CPU (períodos limitados)", [(f'sum by (container_label_com_docker_compose_service) (rate(container_cpu_cfs_throttled_periods_total{{{SVC}}}[1m])) / clamp_min(sum by (container_label_com_docker_compose_service) (rate(container_cpu_cfs_periods_total{{{SVC}}}[1m])), 1e-9)', "{{container_label_com_docker_compose_service}}")], "percentunit", 0, 32,
   desc="Fração dos períodos de 100 ms em que o kernel pausou o contêiner por exceder a cota de CPU", minv=0)
ts("Event loop do Node.js e heap", [('nodejs_eventloop_lag_seconds{job="api",quantile="0.99"}', "atraso p99 do event loop"), ('nodejs_eventloop_lag_max_seconds{job="api"}', "atraso máximo")], "s", 12, 32, minv=0)
ts("Rede por contêiner", [(f'sum by (container_label_com_docker_compose_service) (rate(container_network_receive_bytes_total{{{SVC}}}[1m]))', "{{container_label_com_docker_compose_service}} recebido"),
                          (f'sum by (container_label_com_docker_compose_service) (rate(container_network_transmit_bytes_total{{{SVC}}}[1m]))', "{{container_label_com_docker_compose_service}} enviado")], "Bps", 0, 40, minv=0)
ts("Heap do V8 da API", [('nodejs_heap_used_bytes{job="api"}', "heap em uso"), ('nodejs_heap_total_bytes{job="api"}', "heap reservado"), ('process_resident_memory_bytes{job="api"}', "RSS")], "bytes", 12, 40, minv=0)

row("Banco de dados", 48)
ts("Pool de conexões da API", [('asa_db_pool_connections{job="api",state="in_use"}', "em uso"), ('asa_db_pool_connections{job="api",state="idle"}', "ociosas"), ('asa_db_pool_connections{job="api",state="waiting"}', "requisições esperando conexão")], "short", 0, 49, w=8, minv=0)
ts("PostgreSQL: conexões por estado", [('sum by (state) (pg_stat_activity_count{datname=~"asa_conecta|postgres"})', "{{state}}")], "short", 8, 49, w=8, minv=0)
ts("PostgreSQL: transações/s e cache hit", [('sum(rate(pg_stat_database_xact_commit{datname="asa_conecta"}[1m]))', "commits/s"),
                                             ('sum(rate(pg_stat_database_blks_hit{datname="asa_conecta"}[1m])) / clamp_min(sum(rate(pg_stat_database_blks_hit{datname="asa_conecta"}[1m])) + sum(rate(pg_stat_database_blks_read{datname="asa_conecta"}[1m])), 1e-9) * 100', "cache hit (%)")], "short", 16, 49, w=8, minv=0)

row("Teste de carga (k6, visão do cliente)", 57)
ts("Usuários virtuais e requisições/s", [('sum(k6_vus)', "VUs ativos"), ('sum(rate(k6_http_reqs_total[30s]))', "requisições/s")], "short", 0, 58, w=8, minv=0)
ts("Latência vista pelo cliente", [('max(k6_http_req_duration_p95{name!="setup"})', "p95 da rota mais lenta"), ('max(k6_http_req_duration_p99{name!="setup"})', "p99 da rota mais lenta"), ('max(k6_http_req_duration_p50{name!="setup"})', "p50 da rota mais lenta")], "s", 8, 58, w=8, minv=0)
ts("Falhas e checagens", [('avg(k6_http_req_failed_rate{name!="setup"})', "requisições com falha"), ('avg(k6_checks_rate)', "checagens aprovadas")], "percentunit", 16, 58, w=8, minv=0)

dash = {
    "uid": "asa-conecta-observabilidade", "title": "ASA Conecta — Observabilidade", "tags": ["asa-conecta", "entrega-2"],
    "timezone": "America/Sao_Paulo", "schemaVersion": 41, "version": 1, "editable": False, "graphTooltip": 1,
    "refresh": "5s", "time": {"from": "now-30m", "to": "now"},
    "templating": {"list": [{"name": "projeto", "label": "Projeto Compose", "type": "query", "datasource": DS,
                             "query": {"query": "label_values(container_last_seen, container_label_com_docker_compose_project)", "refId": "projeto"},
                             "definition": "label_values(container_last_seen, container_label_com_docker_compose_project)",
                             "includeAll": True, "multi": False, "allValue": ".*", "current": {"text": "All", "value": "$__all"}, "refresh": 2}]},
    "panels": panels,
}
json.dump(dash, open(sys.argv[1], "w"), ensure_ascii=False, indent=2)
print(len(panels), "panels")
