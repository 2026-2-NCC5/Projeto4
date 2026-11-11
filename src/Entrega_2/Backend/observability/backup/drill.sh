#!/usr/bin/env bash
# Ensaio de recuperação (restore drill): prova que um backup volta a funcionar, sem tocar na origem.
#
#   ./drill.sh <arquivo.dump[.enc]> [--manifest <arquivo.json>] [--report <saida.json>]
#
# 1. sobe um PostgreSQL 17 descartável (contêiner com tmpfs, porta aleatória em 127.0.0.1);
# 2. se o backup for de um schema do Supabase (asa), cria o schema `extensions` com pgcrypto e btree_gist;
# 3. restaura com restore.sh e mede o tempo (base do RTO);
# 4. compara a contagem de linhas de cada tabela com o manifesto gerado no backup;
# 5. remove o contêiner. Sai com código 1 se alguma tabela divergir.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
source "$HERE/lib.sh"

FILE="${1:-}"; [ -n "$FILE" ] && shift || die "informe o arquivo do backup"
MANIFEST=""; REPORT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --manifest) MANIFEST="$2"; shift 2 ;;
    --report) REPORT="$2"; shift 2 ;;
    *) die "opção desconhecida: $1" ;;
  esac
done
if [ -z "$MANIFEST" ]; then
  b="${FILE%.enc}"; MANIFEST="${b%.dump}.json"
fi
[ -r "$MANIFEST" ] || die "manifesto não encontrado: $MANIFEST"
SCHEMA="$(python3 -I -c 'import json,sys; s=json.load(open(sys.argv[1]))["schema"]; print("public" if s=="*" else s)' "$MANIFEST")"

NAME="asa-restore-drill-$$"
PASS="$(openssl rand -hex 16)"
PORT="$(python3 -I -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

log "subindo PostgreSQL descartável ($PG_CLIENT_IMAGE) em 127.0.0.1:$PORT"
T0=$(date +%s.%N)
docker run -d --name "$NAME" --tmpfs /var/lib/postgresql/data:rw -p "127.0.0.1:${PORT}:5432" \
  -e POSTGRES_PASSWORD="$PASS" -e POSTGRES_DB=restore "$PG_CLIENT_IMAGE" >/dev/null
for _ in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres -d restore -q 2>/dev/null && break; sleep 1; done
# o pg_isready responde antes do restart final do entrypoint: espera uma consulta de verdade
for _ in $(seq 1 30); do docker exec "$NAME" psql -U postgres -d restore -qAtc 'select 1' >/dev/null 2>&1 && break; sleep 1; done

export TARGET_DATABASE_URL="postgres://postgres:${PASS}@127.0.0.1:${PORT}/restore?sslmode=disable"
if [ "$SCHEMA" != "public" ]; then
  docker exec "$NAME" psql -U postgres -d restore -qc "create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions; create extension if not exists btree_gist with schema extensions; alter database restore set search_path = ${SCHEMA}, extensions, public;"
fi

T1=$(date +%s.%N)
"$HERE/restore.sh" "$FILE"
T2=$(date +%s.%N)

ENVF="$(mktemp)"; trap 'rm -f "$ENVF"; cleanup' EXIT
pg_env_file "$TARGET_DATABASE_URL" "$ENVF"
COUNTS="$(table_counts "$ENVF" "$SCHEMA")"

RESULT="$(python3 -I - "$MANIFEST" "$T0" "$T1" "$T2" <<PY
import json, sys
manifest = json.load(open(sys.argv[1]))
t0, t1, t2 = map(float, sys.argv[2:5])
restored = {}
for line in """$COUNTS""".splitlines():
    if "," in line:
        table, n = line.rsplit(",", 1)
        restored[table] = int(n)
expected = manifest["contagens"]
diffs = {t: {"backup": expected.get(t), "restaurado": restored.get(t)} for t in sorted(set(expected) | set(restored)) if expected.get(t) != restored.get(t)}
print(json.dumps({
    "backup": manifest["arquivo"], "sha256": manifest["sha256"], "schema": manifest["schema"],
    "tabelas_backup": len(expected), "tabelas_restauradas": len(restored),
    "linhas_backup": sum(expected.values()), "linhas_restauradas": sum(restored.values()),
    "divergencias": diffs, "ok": not diffs,
    "tempo_subida_banco_s": round(t1 - t0, 2), "tempo_restauracao_s": round(t2 - t1, 2), "tempo_total_s": round(t2 - t0, 2),
}, ensure_ascii=False, indent=2))
PY
)"
echo "$RESULT"
[ -n "$REPORT" ] && echo "$RESULT" > "$REPORT"
echo "$RESULT" | python3 -I -c 'import json,sys; sys.exit(0 if json.load(sys.stdin)["ok"] else 1)' && log "ensaio OK: todas as tabelas conferem" || die "ensaio FALHOU: há divergências"
