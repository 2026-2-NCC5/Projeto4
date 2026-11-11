#!/usr/bin/env bash
# Restaura um backup gerado por backup.sh.
#
#   TARGET_DATABASE_URL='postgres://...' ./restore.sh <arquivo.dump|arquivo.dump.enc> [--confirm-remote <host>] [--keep-owner]
#
# Proteções:
#  - confere o sha256 antes de qualquer escrita;
#  - recusa banco remoto, a menos que --confirm-remote repita exatamente o host de destino
#    (restaurar em produção substitui os dados: faça antes um backup novo do estado atual);
#  - roda em transação única (--single-transaction): ou restaura tudo, ou nada muda.
# Sem --keep-owner, dono e permissões não são restaurados (útil para cópias de teste e ensaios).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
source "$HERE/lib.sh"

FILE="${1:-}"; [ -n "$FILE" ] && shift || die "informe o arquivo do backup"
CONFIRM=""; OWNER="--no-owner --no-privileges"
while [ $# -gt 0 ]; do
  case "$1" in
    --confirm-remote) CONFIRM="$2"; shift 2 ;;
    --keep-owner) OWNER=""; shift ;;
    *) die "opção desconhecida: $1" ;;
  esac
done
[ -r "$FILE" ] || die "arquivo não encontrado: $FILE"
[ -n "${TARGET_DATABASE_URL:-}" ] || die "defina TARGET_DATABASE_URL"
HOST="$(url_host "$TARGET_DATABASE_URL")"
if ! is_local_host "$HOST" && [ "$CONFIRM" != "$HOST" ]; then
  die "destino remoto (${HOST}): repita o host com --confirm-remote ${HOST} para confirmar"
fi

DIR="$(cd "$(dirname "$FILE")" && pwd)"; BASE="$(basename "$FILE")"
if [ -r "$DIR/$BASE.sha256" ]; then
  (cd "$DIR" && sha256sum --quiet -c "$BASE.sha256") || die "checksum não confere: backup corrompido ou alterado"
  log "checksum ok"
else
  log "aviso: $BASE.sha256 não encontrado; integridade não verificada"
fi

WORK="$(mktemp -d)"; ENVF="$(mktemp)"; trap 'rm -rf "$WORK" "$ENVF"' EXIT
DUMP="$BASE"
if [[ "$BASE" == *.enc ]]; then
  [ -r "${BACKUP_KEY_FILE:-}" ] || die "backup cifrado: defina BACKUP_KEY_FILE"
  DUMP="${BASE%.enc}"
  ( umask 077; openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:${BACKUP_KEY_FILE}" -in "$DIR/$BASE" -out "$WORK/$DUMP" )
else
  cp "$DIR/$BASE" "$WORK/$DUMP"
fi
pg_env_file "$TARGET_DATABASE_URL" "$ENVF"

log "restaurando $BASE em ${HOST}"
START=$(date +%s.%N)
# shellcheck disable=SC2086
PG_WORKDIR="$WORK" pg_client "$ENVF" pg_restore --single-transaction --exit-on-error --clean --if-exists $OWNER --dbname="$(grep '^PGDATABASE=' "$ENVF" | cut -d= -f2)" "/work/$DUMP"
END=$(date +%s.%N)
log "restauração concluída em $(python3 -I -c "print(round($END-$START,2))") s"
