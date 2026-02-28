#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-http://localhost:8000}"
USERS="${USERS:-20}"
SPAWN_RATE="${SPAWN_RATE:-4}"
DURATION="${DURATION:-3m}"
OUT_DIR="${OUT_DIR:-infra/loadtest/results}"
RUN_ID="${RUN_ID:-$(date +%Y%m%d-%H%M%S)}"

mkdir -p "${OUT_DIR}"

echo "Running load test against ${HOST}"
echo "users=${USERS} spawn_rate=${SPAWN_RATE} duration=${DURATION}"

if command -v locust >/dev/null 2>&1; then
  LOCUST_CMD=(locust)
elif python3 -c "import locust" >/dev/null 2>&1; then
  LOCUST_CMD=(python3 -m locust)
elif [[ -x "services/api/.venv/bin/locust" ]]; then
  LOCUST_CMD=(services/api/.venv/bin/locust)
elif [[ -x "infra/loadtest/.venv311/bin/locust" ]]; then
  LOCUST_CMD=(infra/loadtest/.venv311/bin/locust)
else
  echo "locust is not installed. Install with: python3 -m pip install -r infra/loadtest/requirements.txt"
  exit 1
fi

"${LOCUST_CMD[@]}" \
  -f infra/loadtest/locustfile.py \
  --headless \
  --host "${HOST}" \
  -u "${USERS}" \
  -r "${SPAWN_RATE}" \
  -t "${DURATION}" \
  --exit-code-on-error 0 \
  --csv "${OUT_DIR}/${RUN_ID}" \
  --html "${OUT_DIR}/${RUN_ID}.html" \
  --only-summary

echo "Artifacts:"
echo "- ${OUT_DIR}/${RUN_ID}_stats.csv"
echo "- ${OUT_DIR}/${RUN_ID}_stats_history.csv"
echo "- ${OUT_DIR}/${RUN_ID}.html"
