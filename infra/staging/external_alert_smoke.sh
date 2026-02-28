#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ALERTMANAGER_URL="${ALERTMANAGER_URL:-http://localhost:9093}"
ALERT_NAME="${ALERT_NAME:-StagingExternalSmokeAlert}"
SEVERITY="${SEVERITY:-warning}"
ALERT_RUN_ID="${ALERT_RUN_ID:-$(date +%s)}"
CONFIRM_BASE_URL="${CONFIRM_BASE_URL:-}"
CONFIRM_URL="${CONFIRM_URL:-}"
CONFIRM_FORWARD_URL="${CONFIRM_FORWARD_URL:-}"
CONFIRM_FORWARD_DESTINATION="${CONFIRM_FORWARD_DESTINATION:-}"
CONFIRM_FORWARD_EXPECT_TARGET_PREFIX="${CONFIRM_FORWARD_EXPECT_TARGET_PREFIX:-}"
CONFIRM_REQUIRE_OK="${CONFIRM_REQUIRE_OK:-true}"
CONFIRM_TOKEN="${CONFIRM_TOKEN:-}"
CONFIRM_WAIT_SECONDS="${CONFIRM_WAIT_SECONDS:-45}"
CONFIRM_INTERVAL_SECONDS="${CONFIRM_INTERVAL_SECONDS:-5}"

if [[ -n "${CONFIRM_BASE_URL}" ]]; then
  CONFIRM_BASE_URL="${CONFIRM_BASE_URL%/}"
fi

if [[ -z "${CONFIRM_URL}" && -n "${CONFIRM_BASE_URL}" ]]; then
  CONFIRM_URL="${CONFIRM_BASE_URL}/smoke/confirm?alertname=${ALERT_NAME}&run_id=${ALERT_RUN_ID}"
fi

if [[ -z "${CONFIRM_FORWARD_URL}" && -n "${CONFIRM_BASE_URL}" ]]; then
  # `destination` is optional but recommended (`slack|pagerduty|webhook`) so we can prove the
  # downstream path is exercised and not just "received".
  forward_query="alertname=${ALERT_NAME}&run_id=${ALERT_RUN_ID}&require_ok=${CONFIRM_REQUIRE_OK}"
  if [[ -n "${CONFIRM_FORWARD_DESTINATION}" ]]; then
    forward_query="${forward_query}&destination=${CONFIRM_FORWARD_DESTINATION}"
  fi
  CONFIRM_FORWARD_URL="${CONFIRM_BASE_URL}/smoke/confirm-forward?${forward_query}"
fi

echo "Triggering alertmanager smoke"
(
  cd "${ROOT_DIR}"
  ALERTMANAGER_URL="${ALERTMANAGER_URL}" ALERT_NAME="${ALERT_NAME}" SEVERITY="${SEVERITY}" ALERT_RUN_ID="${ALERT_RUN_ID}" \
    ./infra/observability/validate_alerting.sh
)

if [[ -z "${CONFIRM_URL}" && -z "${CONFIRM_FORWARD_URL}" ]]; then
  echo "No CONFIRM_URL/CONFIRM_FORWARD_URL provided. Alertmanager smoke complete."
  exit 0
fi

if [[ -n "${CONFIRM_URL}" ]]; then
  echo "Polling external receiver confirmation endpoint"
  deadline=$(( $(date +%s) + CONFIRM_WAIT_SECONDS ))
  while true; do
    if [[ -n "${CONFIRM_TOKEN}" ]]; then
      status="$(curl -s -o /tmp/bartenderai-alert-confirm.json -w "%{http_code}" \
        -H "Authorization: Bearer ${CONFIRM_TOKEN}" \
        "${CONFIRM_URL}")"
    else
      status="$(curl -s -o /tmp/bartenderai-alert-confirm.json -w "%{http_code}" \
        "${CONFIRM_URL}")"
    fi
    if [[ "${status}" =~ ^2 ]]; then
      echo "External confirmation succeeded with HTTP ${status}."
      cat /tmp/bartenderai-alert-confirm.json
      break
    fi
    if (( $(date +%s) >= deadline )); then
      echo "External confirmation timed out after ${CONFIRM_WAIT_SECONDS}s (last status ${status})."
      cat /tmp/bartenderai-alert-confirm.json || true
      exit 1
    fi
    sleep "${CONFIRM_INTERVAL_SECONDS}"
  done
fi

if [[ -z "${CONFIRM_FORWARD_URL}" ]]; then
  exit 0
fi

echo "Polling downstream forward confirmation endpoint"
deadline=$(( $(date +%s) + CONFIRM_WAIT_SECONDS ))
while true; do
  if [[ -n "${CONFIRM_TOKEN}" ]]; then
    status="$(curl -s -o /tmp/bartenderai-alert-forward-confirm.json -w "%{http_code}" \
      -H "Authorization: Bearer ${CONFIRM_TOKEN}" \
      "${CONFIRM_FORWARD_URL}")"
  else
    status="$(curl -s -o /tmp/bartenderai-alert-forward-confirm.json -w "%{http_code}" \
      "${CONFIRM_FORWARD_URL}")"
  fi
  if [[ "${status}" =~ ^2 ]]; then
    echo "Downstream forward confirmation succeeded with HTTP ${status}."
    cat /tmp/bartenderai-alert-forward-confirm.json
    if [[ -n "${CONFIRM_FORWARD_EXPECT_TARGET_PREFIX}" ]]; then
      python3 - <<'PY'
import json
import os
import sys

expected = os.environ.get("CONFIRM_FORWARD_EXPECT_TARGET_PREFIX", "").strip()
if not expected:
    raise SystemExit(0)

path = "/tmp/bartenderai-alert-forward-confirm.json"
with open(path, "r", encoding="utf-8") as handle:
    payload = json.load(handle)

latest = payload.get("latest") if isinstance(payload, dict) else None
target = ""
if isinstance(latest, dict):
    target = str(latest.get("target") or "").strip()

if not target.startswith(expected):
    print(
        f"Expected downstream forward target to start with {expected!r}, got {target!r}",
        file=sys.stderr,
    )
    raise SystemExit(2)
print(f"Downstream forward target validated: {target}")
PY
    fi
    exit 0
  fi
  if (( $(date +%s) >= deadline )); then
    echo "Downstream forward confirmation timed out after ${CONFIRM_WAIT_SECONDS}s (last status ${status})."
    cat /tmp/bartenderai-alert-forward-confirm.json || true
    exit 1
  fi
  sleep "${CONFIRM_INTERVAL_SECONDS}"
done
