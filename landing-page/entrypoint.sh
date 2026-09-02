#!/bin/sh
set -eu

envsubst '${BAP_URL} ${BPP_URL}' < /usr/share/nginx/html/index.html.template > /usr/share/nginx/html/index.html

exec "$@"
