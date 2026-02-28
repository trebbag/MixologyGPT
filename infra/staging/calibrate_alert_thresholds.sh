#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"
INTERNAL_TOKEN="${INTERNAL_TOKEN:-}"
APPLY="${APPLY:-false}"
MIN_JOBS="${MIN_JOBS:-20}"
BUFFER_MULTIPLIER="${BUFFER_MULTIPLIER:-1.25}"

if [[ -z "${INTERNAL_TOKEN}" ]]; then
  echo "INTERNAL_TOKEN is required"
  exit 1
fi

url="${API_BASE_URL}/v1/admin/source-policies/calibrate-alerts?apply=${APPLY}&min_jobs=${MIN_JOBS}&buffer_multiplier=${BUFFER_MULTIPLIER}"

echo "Calibrating source policy alert thresholds" >&2
echo "API: ${API_BASE_URL} apply=${APPLY} min_jobs=${MIN_JOBS} buffer=${BUFFER_MULTIPLIER}" >&2

curl -fsS -X POST "${url}" \
  -H "X-Internal-Token: ${INTERNAL_TOKEN}" \
  -H 'Content-Type: application/json'
