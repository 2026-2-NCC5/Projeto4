#!/usr/bin/env bash
# Executa os cenários E2E oficiais de ponta a ponta com PostgreSQL (docker compose),
# API Node.js real e Agent Service Python real, gravando evidências em
# documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/evidence/e2e/last-run.{md,json}.
#
#   ./scripts/e2e.sh        (a partir de src/Entrega 2/Backend)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVIDENCE="$(cd "$ROOT/../../.." && pwd)/documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/evidence/e2e"
cd "$ROOT"

echo "▶ subindo PostgreSQL e Mailpit (docker compose)"
docker compose up -d db mailpit >/dev/null
for _ in $(seq 1 40); do
  docker compose exec -T db pg_isready -U "${POSTGRES_USER:-asa}" -d "${POSTGRES_DB:-asa_conecta}" >/dev/null 2>&1 && break
  sleep 1
done
# banco descartável dos testes (o volume antigo pode não ter rodado o script de init)
docker compose exec -T db psql -U "${POSTGRES_USER:-asa}" -d postgres -Atc "select 1 from pg_database where datname='asa_conecta_test'" | grep -q 1 \
  || docker compose exec -T db createdb -U "${POSTGRES_USER:-asa}" asa_conecta_test

cd "$ROOT/api"
if [ ! -f .env ]; then cp .env.example .env; fi
if [ ! -d node_modules ]; then npm ci; fi

if [ ! -x "$ROOT/agent-service/.venv/bin/python" ]; then
  echo "▶ criando venv do Agent Service"
  python3 -m venv "$ROOT/agent-service/.venv"
  "$ROOT/agent-service/.venv/bin/pip" install -q -r "$ROOT/agent-service/requirements-dev.txt"
fi

echo "▶ migrations + seeds"
npm run -s db:migrate
npm run -s db:seed

echo "▶ testes E2E (grava as evidências em $EVIDENCE)"
TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgres://asa:asa_dev_password@localhost:5432/asa_conecta_test}" E2E_WRITE_EVIDENCE=1 npm run -s test:e2e
echo "✔ evidências em $EVIDENCE (last-run.md, voice-last-run.md, auth-last-run.md)"
