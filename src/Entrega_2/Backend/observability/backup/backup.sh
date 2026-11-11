#!/usr/bin/env bash
# Backup lógico do PostgreSQL do ASA Conecta (pg_dump, formato custom), com checksum, permissões 600,
# cifragem opcional (AES-256) e retenção.
#
#   DATABASE_URL='postgres://...' ./backup.sh [--schema asa] [--dir ~/asa-conecta-backups] [--keep 14] [--label prod]
#
#   --schema  só um schema (produção: asa; o ambiente local usa public e é copiado inteiro)
#   --dir     destino FORA do repositório (padrão: ~/asa-conecta-backups)
#   --keep    quantos backups do mesmo rótulo manter (padrão: 14)
#   BACKUP_KEY_FILE=arquivo  cifra o dump com AES-256-CBC + PBKDF2 (openssl); a chave fica fora do Git
#
# Saída: <dir>/<label>-AAAAMMDD-HHMMSS.dump[.enc], .sha256 e .json (manifesto com contagem de linhas por tabela).
# Agendamento sugerido (cron do usuário de operação):  15 3 * * *  DATABASE_URL=... /caminho/backup.sh --schema asa
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
source "$HERE/lib.sh"

SCHEMA=""; DIR="${HOME}/asa-conecta-backups"; KEEP=14; LABEL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --schema) SCHEMA="$2"; shift 2 ;;
    --dir) DIR="$2"; shift 2 ;;
    --keep) KEEP="$2"; shift 2 ;;
    --label) LABEL="$2"; shift 2 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) die "opção desconhecida: $1" ;;
  esac
done
[ -n "${DATABASE_URL:-}" ] || die "defina DATABASE_URL (variável de ambiente, nunca como argumento)"
HOST="$(url_host "$DATABASE_URL")"
[ -n "$LABEL" ] || { is_local_host "$HOST" && LABEL="local" || LABEL="remoto"; }

umask 077
mkdir -p "$DIR"; chmod 700 "$DIR"
case "$(cd "$DIR" && pwd)" in "$(git -C "$HERE" rev-parse --show-toplevel 2>/dev/null || echo /nao-e-repo)"*) die "o destino está dentro do repositório Git: use uma pasta fora dele" ;; esac

STAMP="$(date +%Y%m%d-%H%M%S)"
NAME="${LABEL}-${STAMP}.dump"
ENVF="$(mktemp)"; trap 'rm -f "$ENVF"' EXIT
pg_env_file "$DATABASE_URL" "$ENVF"

log "backup de ${HOST} (${SCHEMA:-banco inteiro}) → ${DIR}/${NAME}"
START=$(date +%s.%N)
PG_WORKDIR="$DIR" pg_client "$ENVF" pg_dump --format=custom --compress=6 ${SCHEMA:+--schema="$SCHEMA"} --file="/work/${NAME}"
END=$(date +%s.%N)
chmod 600 "$DIR/$NAME"

# manifesto: contagem de linhas por tabela, usada depois para conferir a restauração
COUNTS="$(table_counts "$ENVF" "${SCHEMA:-public}")"
SIZE=$(stat -c %s "$DIR/$NAME")

FINAL="$NAME"
if [ -n "${BACKUP_KEY_FILE:-}" ]; then
  [ -r "$BACKUP_KEY_FILE" ] || die "BACKUP_KEY_FILE ilegível"
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:${BACKUP_KEY_FILE}" -in "$DIR/$NAME" -out "$DIR/$NAME.enc"
  rm -f "$DIR/$NAME"; FINAL="$NAME.enc"; chmod 600 "$DIR/$FINAL"
fi
SUM="$(sha256_of "$DIR/$FINAL")"
echo "$SUM  $FINAL" > "$DIR/$FINAL.sha256"

python3 -I - "$DIR/${LABEL}-${STAMP}.json" "$FINAL" "$SUM" "$SIZE" "$HOST" "${SCHEMA:-*}" "$START" "$END" <<PY
import json, sys
out, final, sha, size, host, schema, start, end = sys.argv[1:9]
counts = {}
for line in """$COUNTS""".splitlines():
    if "," in line:
        table, n = line.rsplit(",", 1)
        counts[table] = int(n)
json.dump({"arquivo": final, "sha256": sha, "bytes_dump": int(size), "host": host, "schema": schema,
           "cifrado": final.endswith(".enc"), "duracao_s": round(float(end) - float(start), 2),
           "tabelas": len(counts), "linhas": sum(counts.values()), "contagens": counts},
          open(out, "w"), ensure_ascii=False, indent=2)
PY
chmod 600 "$DIR/${LABEL}-${STAMP}.json" "$DIR/$FINAL.sha256"
log "ok: $(numfmt --to=iec "$SIZE") em $(python3 -I -c "print(round($END-$START,2))") s · sha256 ${SUM:0:16}…"

# retenção: mantém os KEEP mais recentes deste rótulo
mapfile -t OLD < <(ls -1t "$DIR"/"${LABEL}"-*.dump* 2>/dev/null | grep -v '\.sha256$' | tail -n +"$((KEEP + 1))")
for f in "${OLD[@]}"; do
  base="${f%.enc}"; base="${base%.dump}"
  rm -f "$f" "$f.sha256" "${base}.json"
  log "retenção: removido $(basename "$f")"
done
echo "$DIR/$FINAL"
