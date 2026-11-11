#!/usr/bin/env bash
# Verificações de controle de acesso e de transporte (somente leitura).
#
#   ./verificar-acesso.sh producao                       # API e portal publicados (sem login, sem escrita)
#   ./verificar-acesso.sh local                          # ambiente Docker (usa observability/.env)
#
# Cada linha: resultado esperado, obtido e OK/FALHOU. Sai com 1 se alguma verificação falhar.
set -uo pipefail
ALVO="${1:-producao}"
HERE="$(cd "$(dirname "$0")" && pwd)"
FALHAS=0

esperar() { # esperar <descrição> <esperado> <obtido>
  local ok="OK"; [ "$2" = "$3" ] || { ok="FALHOU"; FALHAS=$((FALHAS + 1)); }
  printf '%-74s esperado=%-6s obtido=%-6s %s\n' "$1" "$2" "$3" "$ok"
}
status() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$@"; }
cabecalho() { curl -s -D - -o /dev/null --max-time 20 "$1" | tr -d '\r' | grep -i "^$2:" | head -1 | cut -d' ' -f2-; }

if [ "$ALVO" = "producao" ]; then
  API="${API_URL:-https://asa-conecta-api.vercel.app}"
  PORTAL="${PORTAL_URL:-https://asa-conecta.vercel.app}"
  echo "# Produção: $API · $PORTAL ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
  esperar "GET /health (público, sem dados pessoais)" 200 "$(status "$API/health")"
  esperar "GET /api/student/me sem token → 401" 401 "$(status "$API/api/student/me")"
  esperar "GET /api/admin/users sem token → 401" 401 "$(status "$API/api/admin/users")"
  esperar "GET /api/asa/dashboard com token inválido → 401" 401 "$(status -H 'Authorization: Bearer token.invalido.123' "$API/api/asa/dashboard")"
  esperar "POST /internal/v1/student-agent/evaluate (agente não é público) → 404" 404 "$(status -X POST -H 'Content-Type: application/json' -d '{}' "$API/internal/v1/student-agent/evaluate")"
  esperar "GET /api/internal/jobs/sla-scan sem CRON_SECRET → 401" 401 "$(status "$API/api/internal/jobs/sla-scan")"
  esperar "GET /metrics (coleta desligada sem METRICS_TOKEN) → 404" 404 "$(status "$API/metrics")"
  esperar "HTTP sem TLS redireciona para HTTPS (308)" 308 "$(status "http://${API#https://}/health")"
  esperar "Portal via HTTP redireciona para HTTPS (308)" 308 "$(status "http://${PORTAL#https://}/")"
  esperar "Cabeçalho HSTS na API" "max-age=31536000;" "$(cabecalho "$API/health" strict-transport-security | cut -d' ' -f1)"
  esperar "X-Content-Type-Options na API" nosniff "$(cabecalho "$API/health" x-content-type-options)"
  esperar "Cabeçalho CSP no portal" sim "$( [ -n "$(cabecalho "$PORTAL/" content-security-policy)" ] && echo sim || echo nao)"
  TLS="$(curl -sv -o /dev/null "$API/health" 2>&1 | grep -oE 'SSL connection using TLSv[0-9.]+' | grep -oE 'TLSv[0-9.]+' | head -1)"
  esperar "Versão do TLS negociada" TLSv1.3 "${TLS:-?}"
else
  ENVF="$HERE/../.env"
  [ -r "$ENVF" ] || { echo "crie observability/.env (veja .env.example)"; exit 2; }
  get() { grep "^$1=" "$ENVF" | cut -d= -f2-; }
  API="${API_URL:-http://127.0.0.1:${API_PORT:-3000}}"
  AGENT="${AGENT_URL:-http://127.0.0.1:${AGENT_SERVICE_PORT:-8000}}"
  echo "# Local: $API · agente $AGENT ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
  TOKEN="$(curl -s "$API/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"carga.01@edu.fecap.br\",\"password\":\"$(get LOAD_TEST_PASSWORD)\"}" | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["data"]["accessToken"])' 2>/dev/null)"
  [ -n "$TOKEN" ] || { echo "login da conta de teste falhou (rode antes o k6, que cria as contas)"; exit 2; }
  AUTH=(-H "Authorization: Bearer $TOKEN")
  esperar "GET /metrics sem token → 401" 401 "$(status "$API/metrics")"
  esperar "GET /metrics com token errado → 401" 401 "$(status -H 'Authorization: Bearer errado-errado-errado-errado' "$API/metrics")"
  esperar "GET /metrics com METRICS_TOKEN → 200" 200 "$(status -H "Authorization: Bearer $(get METRICS_TOKEN)" "$API/metrics")"
  esperar "GET /api/student/me sem token → 401" 401 "$(status "$API/api/student/me")"
  esperar "GET /api/student/me como aluno → 200" 200 "$(status "${AUTH[@]}" "$API/api/student/me")"
  esperar "GET /api/asa/dashboard (equipe ASA) como aluno → 403" 403 "$(status "${AUTH[@]}" "$API/api/asa/dashboard")"
  esperar "GET /api/admin/users (administração) como aluno → 403" 403 "$(status "${AUTH[@]}" "$API/api/admin/users")"
  SIG="${TOKEN##*.}"; C="${SIG:10:1}"; [ "$C" = "A" ] && N=B || N=A
  ADULT="${TOKEN%.*}.${SIG:0:10}${N}${SIG:11}"
  esperar "JWT com assinatura adulterada → 401" 401 "$(status -H "Authorization: Bearer $ADULT" "$API/api/student/me")"
  esperar "Agente sem AGENT_SERVICE_TOKEN → 401" 401 "$(status -X POST -H 'Content-Type: application/json' -d '{}' "$AGENT/internal/v1/student-agent/evaluate")"
  esperar "Jobs internos sem CRON_SECRET → 401" 401 "$(status "$API/api/internal/jobs/sla-scan")"
fi
echo "# falhas: $FALHAS"
[ "$FALHAS" -eq 0 ]
