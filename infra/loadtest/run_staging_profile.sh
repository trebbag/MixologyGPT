#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOST="${1:-${STAGING_BASE_URL:-}}"

if [[ -z "${HOST}" ]]; then
  echo "Provide staging base URL as arg1 or STAGING_BASE_URL env var."
  exit 1
fi

RUN_ID="${RUN_ID:-staging_tuned_$(date +%Y%m%d-%H%M%S)}"
USERS="${USERS:-40}"
SPAWN_RATE="${SPAWN_RATE:-8}"
DURATION="${DURATION:-5m}"
OUT_DIR="${OUT_DIR:-infra/loadtest/results}"
GATES_FILE="${GATES_FILE:-infra/loadtest/gates.json}"
REPORT_MD="${REPORT_MD:-infra/loadtest/results/${RUN_ID}_gates.md}"
LOCK_GATES="${LOCK_GATES:-false}"
LOCKED_GATES_OUT="${LOCKED_GATES_OUT:-infra/loadtest/gates.pilot.locked.json}"
LOCKED_GATES_REPORT="${LOCKED_GATES_REPORT:-infra/loadtest/results/${RUN_ID}_locked_gates.md}"

echo "Running staging load profile"
echo "host=${HOST} users=${USERS} spawn_rate=${SPAWN_RATE} duration=${DURATION}"

cd "${ROOT_DIR}"
USERS="${USERS}" SPAWN_RATE="${SPAWN_RATE}" DURATION="${DURATION}" RUN_ID="${RUN_ID}" \
  ./infra/loadtest/run_loadtest.sh "${HOST}"

python3 ./infra/loadtest/evaluate_gates.py \
  --stats "${OUT_DIR}/${RUN_ID}_stats.csv" \
  --gates "${GATES_FILE}" \
  --run-id "${RUN_ID}" \
  --output-md "${REPORT_MD}"

echo "Gate evaluation written to ${REPORT_MD}"

if [[ "${LOCK_GATES}" == "true" ]]; then
  python3 ./infra/loadtest/lock_gates.py \
    --stats "${OUT_DIR}/${RUN_ID}_stats.csv" \
    --gates-in "${GATES_FILE}" \
    --gates-out "${LOCKED_GATES_OUT}" \
    --run-id "${RUN_ID}" \
    --output-md "${LOCKED_GATES_REPORT}"
  echo "Locked gate file written to ${LOCKED_GATES_OUT}"
  echo "Locked gate report written to ${LOCKED_GATES_REPORT}"
fi
