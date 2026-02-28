#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

API_BASE_URL="${API_BASE_URL:-${STAGING_BASE_URL:-}}"
ALERTMANAGER_URL="${ALERTMANAGER_URL:-${STAGING_ALERTMANAGER_URL:-}}"
ALERT_CONFIRM_URL="${ALERT_CONFIRM_URL:-${ALERT_RECEIVER_CONFIRM_URL:-}}"
INTERNAL_TOKEN="${INTERNAL_TOKEN:-}"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
PAGERDUTY_ROUTING_KEY="${PAGERDUTY_ROUTING_KEY:-}"
FORWARD_WEBHOOK_URLS="${FORWARD_WEBHOOK_URLS:-}"
RUN_EXTERNAL_FORWARD_SMOKE="${RUN_EXTERNAL_FORWARD_SMOKE:-false}"

RUN_ID="${RUN_ID:-pilot_real_signoff_$(date +%Y%m%d_%H%M%S)}"
EVIDENCE_DIR="${EVIDENCE_DIR:-${ROOT_DIR}/docs/runbooks/evidence}"

require_non_empty() {
  local key="$1"
  local value="$2"
  if [[ -z "${value}" ]]; then
    echo "ERROR: ${key} is required." >&2
    exit 1
  fi
}

reject_local_endpoint() {
  local key="$1"
  local value="$2"
  local normalized
  normalized="$(echo "${value}" | tr '[:upper:]' '[:lower:]')"
  if [[ "${normalized}" == *"localhost"* || "${normalized}" == *"127.0.0.1"* || "${normalized}" == *"alert-receiver"* ]]; then
    echo "ERROR: ${key} must be a real staging/remote endpoint, not local (${value})." >&2
    exit 1
  fi
}

require_non_empty "API_BASE_URL/STAGING_BASE_URL" "${API_BASE_URL}"
require_non_empty "INTERNAL_TOKEN" "${INTERNAL_TOKEN}"

reject_local_endpoint "API_BASE_URL" "${API_BASE_URL}"
if [[ -n "${ALERTMANAGER_URL}" ]]; then
  reject_local_endpoint "ALERTMANAGER_URL" "${ALERTMANAGER_URL}"
fi

if [[ -n "${ALERT_CONFIRM_URL}" ]]; then
  reject_local_endpoint "ALERT_CONFIRM_URL" "${ALERT_CONFIRM_URL}"
fi

if [[ "${RUN_EXTERNAL_FORWARD_SMOKE}" == "true" ]]; then
  require_non_empty "ALERTMANAGER_URL/STAGING_ALERTMANAGER_URL" "${ALERTMANAGER_URL}"
  require_non_empty "ALERT_CONFIRM_URL/ALERT_RECEIVER_CONFIRM_URL" "${ALERT_CONFIRM_URL}"
  require_non_empty "SLACK_WEBHOOK_URL" "${SLACK_WEBHOOK_URL}"
  require_non_empty "PAGERDUTY_ROUTING_KEY" "${PAGERDUTY_ROUTING_KEY}"
  reject_local_endpoint "SLACK_WEBHOOK_URL" "${SLACK_WEBHOOK_URL}"
  if [[ "${PAGERDUTY_ROUTING_KEY}" == "dummy" ]]; then
    echo "ERROR: PAGERDUTY_ROUTING_KEY is set to dummy; provide a real routing key." >&2
    exit 1
  fi
fi

mkdir -p "${EVIDENCE_DIR}"

echo "Running real staging pilot sign-off"
echo "RUN_ID=${RUN_ID}"
echo "API_BASE_URL=${API_BASE_URL}"
echo "ALERTMANAGER_URL=${ALERTMANAGER_URL:-disabled}"
echo "ALERT_CONFIRM_URL=${ALERT_CONFIRM_URL:-disabled}"
echo "RUN_EXTERNAL_FORWARD_SMOKE=${RUN_EXTERNAL_FORWARD_SMOKE}"
echo "EVIDENCE_DIR=${EVIDENCE_DIR}"

(
  cd "${ROOT_DIR}"
  API_BASE_URL="${API_BASE_URL}" \
  ALERTMANAGER_URL="${ALERTMANAGER_URL}" \
  ALERT_CONFIRM_URL="${ALERT_CONFIRM_URL}" \
  INTERNAL_TOKEN="${INTERNAL_TOKEN}" \
  SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL}" \
  PAGERDUTY_ROUTING_KEY="${PAGERDUTY_ROUTING_KEY}" \
  FORWARD_WEBHOOK_URLS="${FORWARD_WEBHOOK_URLS}" \
  RUN_EXTERNAL_FORWARD_SMOKE="${RUN_EXTERNAL_FORWARD_SMOKE}" \
  RUN_ID="${RUN_ID}" \
  EVIDENCE_DIR="${EVIDENCE_DIR}" \
  APPLY_CALIBRATION="${APPLY_CALIBRATION:-true}" \
  APPLY_RECOVERY="${APPLY_RECOVERY:-true}" \
  RUN_LOAD_PROFILE="${RUN_LOAD_PROFILE:-true}" \
  LOCK_GATES="${LOCK_GATES:-false}" \
  MIN_JOBS="${MIN_JOBS:-20}" \
  BUFFER_MULTIPLIER="${BUFFER_MULTIPLIER:-1.25}" \
  TARGET_DOMAINS="${TARGET_DOMAINS:-allrecipes.com,bbcgoodfood.com,diffordsguide.com,food.com,imbibemagazine.com,punchdrink.com}" \
  bash ./infra/staging/pilot_staging_readiness.sh
)

echo "Real staging pilot sign-off completed."
echo "Summary: ${EVIDENCE_DIR}/staging-readiness-summary-${RUN_ID}.md"
