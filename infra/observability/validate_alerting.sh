#!/usr/bin/env bash
set -euo pipefail

ALERTMANAGER_URL="${ALERTMANAGER_URL:-http://localhost:9093}"
ALERT_NAME="${ALERT_NAME:-LocalAlertSmokeTest}"
SEVERITY="${SEVERITY:-warning}"
ALERT_RUN_ID="${ALERT_RUN_ID:-$(date +%s)}"

# Include a unique run id label so Alertmanager always emits a fresh notification (avoids dedup/repeat-interval delays).
payload="[{\"labels\":{\"alertname\":\"${ALERT_NAME}\",\"severity\":\"${SEVERITY}\",\"service\":\"bartenderai\",\"run_id\":\"${ALERT_RUN_ID}\"},\"annotations\":{\"summary\":\"Local alert delivery smoke test\",\"description\":\"Synthetic alert for alert routing validation\"}}]"

echo "Posting synthetic alert to ${ALERTMANAGER_URL}"
curl -fsS -X POST "${ALERTMANAGER_URL}/api/v2/alerts" \
  -H 'Content-Type: application/json' \
  -d "${payload}"

echo "Checking alert groups"
curl -fsS "${ALERTMANAGER_URL}/api/v2/alerts/groups" | head -n 80

echo "Alert smoke test posted. Confirm receiver endpoint delivery in your alert destination."
