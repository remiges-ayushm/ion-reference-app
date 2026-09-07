#!/usr/bin/env bash
# Builds and pushes every image the terraform/ module deploys to Artifact Registry.
#
# Usage:
#   PROJECT_ID=remiges-trade REGION=asia-southeast2 ./scripts/build-and-push.sh [tag]
#
# Run this AFTER the Artifact Registry repo exists (see terraform/README.md's
# bootstrap step) and BEFORE `terraform apply` for everything else.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-asia-southeast2}"
REPO="${REPO:-beckn-app}"
TAG="${1:-latest}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}"

gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

build_and_push() {
  local name="$1" context="$2" dockerfile="${3:-Dockerfile}"
  echo "==> building ${name}"
  docker build -t "${REGISTRY}/${name}:${TAG}" -f "${context}/${dockerfile}" "${context}"
  docker push "${REGISTRY}/${name}:${TAG}"
}

build_and_push bap-application         "${ROOT}/bap-application"
build_and_push bap-application-migrate "${ROOT}/bap-application" Dockerfile.migrate
build_and_push bpp-application         "${ROOT}/bpp-application"
build_and_push bpp-application-migrate "${ROOT}/bpp-application" Dockerfile.migrate
build_and_push bap-frontend            "${ROOT}/bap-frontend"
build_and_push bpp-frontend            "${ROOT}/bpp-frontend"
build_and_push onix-bap                "${ROOT}/onix-bap"
build_and_push onix-bpp                "${ROOT}/onix-bpp"
build_and_push onix-catalog-publish    "${ROOT}/onix-catalog-publish"
build_and_push dedi-static-server      "${ROOT}/dedi-static-server"
build_and_push landing-page            "${ROOT}/landing-page"

echo "==> done — images pushed with tag '${TAG}' to ${REGISTRY}"
echo "    this only pushes images — it does NOT redeploy any already-running"
echo "    service (each has lifecycle { ignore_changes = [image] }). Use"
echo "    'task redeploy:<service>' or 'task redeploy:all' for that."
