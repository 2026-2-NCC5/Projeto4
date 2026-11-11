#!/usr/bin/env bash
# Funções comuns dos scripts de backup/restauração do ASA Conecta.
# O cliente do PostgreSQL roda num contêiner (postgres:17-alpine, mesma major do Supabase): nada a instalar.
# A senha nunca aparece na linha de comando (ps, /proc): a URL vira variáveis PG* num arquivo temporário 600.

PG_CLIENT_IMAGE="${PG_CLIENT_IMAGE:-postgres:17-alpine}"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2; }
die() { log "ERRO: $*"; exit 1; }

# url_host <url> → host da URL (sem porta)
url_host() {
  python3 -I -c 'import sys,urllib.parse as u; print((u.urlsplit(sys.argv[1]).hostname or "").lower())' "$1"
}

is_local_host() {
  case "$1" in localhost|127.0.0.1|::1|db) return 0 ;; *) return 1 ;; esac
}

# pg_env_file <url> <arquivo> → grava PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE e PGSSLMODE
pg_env_file() {
  local url="$1" out="$2"
  ( umask 077; python3 -I - "$url" > "$out" <<'PY'
import sys, urllib.parse as u
p = u.urlsplit(sys.argv[1])
q = dict(u.parse_qsl(p.query))
host = p.hostname or "localhost"
local = host in ("localhost", "127.0.0.1", "::1", "db")
print(f"PGHOST={host}")
print(f"PGPORT={p.port or 5432}")
print(f"PGUSER={u.unquote(p.username or 'postgres')}")
print(f"PGPASSWORD={u.unquote(p.password or '')}")
print(f"PGDATABASE={(p.path or '/postgres').lstrip('/') or 'postgres'}")
print(f"PGSSLMODE={q.get('sslmode', 'disable' if local else 'require')}")
print("PGAPPNAME=asa-conecta-backup")
PY
  )
}

# pg_client <arquivo_env> <comando...> → executa o comando no contêiner cliente, na rede do host
pg_client() {
  local envfile="$1"; shift
  docker run --rm -i --network host --env-file "$envfile" -v "${PG_WORKDIR:-$PWD}:/work" -w /work \
    -u "$(id -u):$(id -g)" "$PG_CLIENT_IMAGE" "$@"
}

sha256_of() { sha256sum "$1" | awk '{print $1}'; }

# contagem exata de linhas por tabela de um schema (CSV: tabela,linhas)
table_counts() {
  local envfile="$1" schema="$2"
  pg_client "$envfile" psql -X -q -At -v ON_ERROR_STOP=1 -v schema="$schema" <<'SQL'
select format('select %L || '','' || count(*) from %I.%I;', tablename, schemaname, tablename)
from pg_tables where schemaname = :'schema' order by tablename
\gexec
SQL
}
