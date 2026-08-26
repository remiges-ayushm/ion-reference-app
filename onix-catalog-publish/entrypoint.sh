#!/bin/sh
set -eu

mkdir -p /app/config

for tmpl in /app/templates/*.tmpl; do
  out="/app/config/$(basename "${tmpl%.tmpl}")"
  envsubst "$ENVSUBST_VARS" < "$tmpl" > "$out"
done

for f in /app/templates/*; do
  case "$f" in
    *.tmpl) continue ;;
  esac
  cp "$f" "/app/config/$(basename "$f")"
done

exec "$@"
