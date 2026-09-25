#!/usr/bin/env bash
# Garante que as cópias do contrato Mobile ↔ API sejam idênticas à fonte canônica.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CANON="$ROOT/contracts/api/mobile-api.v1.ts"
COPIES=(
  "$ROOT/api/src/contracts/mobileApi.v1.ts"
  "$ROOT/../Frontend/types/api.ts"
)
status=0
for copy in "${COPIES[@]}"; do
  if [ ! -f "$copy" ]; then
    echo "FALTA: $copy"; status=1; continue
  fi
  if ! diff -q "$CANON" "$copy" >/dev/null; then
    echo "DIVERGENTE: $copy (execute: cp \"$CANON\" \"$copy\")"; status=1
  else
    echo "OK: $copy"
  fi
done
exit $status
