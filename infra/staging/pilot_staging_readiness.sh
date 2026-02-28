#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_ID="${RUN_ID:-staging_readiness_$(date +%Y%m%d_%H%M%S)}"
EVIDENCE_DIR="${EVIDENCE_DIR:-${ROOT_DIR}/docs/runbooks/evidence}"
mkdir -p "${EVIDENCE_DIR}"

API_BASE_URL="${API_BASE_URL:-${STAGING_BASE_URL:-}}"
ALERTMANAGER_URL="${ALERTMANAGER_URL:-${STAGING_ALERTMANAGER_URL:-}}"
INTERNAL_TOKEN="${INTERNAL_TOKEN:-}"
ALERT_CONFIRM_URL="${ALERT_CONFIRM_URL:-${ALERT_RECEIVER_CONFIRM_URL:-}}"
ALERT_CONFIRM_TOKEN="${ALERT_CONFIRM_TOKEN:-${ALERT_RECEIVER_CONFIRM_TOKEN:-}}"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
PAGERDUTY_ROUTING_KEY="${PAGERDUTY_ROUTING_KEY:-}"
FORWARD_WEBHOOK_URLS="${FORWARD_WEBHOOK_URLS:-}"
RUN_EXTERNAL_FORWARD_SMOKE="${RUN_EXTERNAL_FORWARD_SMOKE:-false}"
TARGET_DOMAINS="${TARGET_DOMAINS:-bbcgoodfood.com,diffordsguide.com,food.com,imbibemagazine.com,punchdrink.com,liquor.com}"
MIN_JOBS="${MIN_JOBS:-20}"
BUFFER_MULTIPLIER="${BUFFER_MULTIPLIER:-1.25}"
MAX_ROUNDS="${MAX_ROUNDS:-6}"
DRAIN_CYCLES="${DRAIN_CYCLES:-10}"
PENDING_LIMIT="${PENDING_LIMIT:-20}"
APPLY_CALIBRATION="${APPLY_CALIBRATION:-true}"
APPLY_RECOVERY="${APPLY_RECOVERY:-true}"
MIN_CLASS_COUNT="${MIN_CLASS_COUNT:-1}"
RUN_LOAD_PROFILE="${RUN_LOAD_PROFILE:-true}"
LOCK_GATES="${LOCK_GATES:-false}"
USERS="${USERS:-40}"
SPAWN_RATE="${SPAWN_RATE:-8}"
DURATION="${DURATION:-5m}"
LOCKS_FILE="${LOCKS_FILE:-infra/loadtest/gates.pilot.locked.json}"

if [[ -z "${API_BASE_URL}" ]]; then
  echo "ERROR: API_BASE_URL (or STAGING_BASE_URL) is required." >&2
  exit 1
fi

if [[ -z "${INTERNAL_TOKEN}" ]]; then
  echo "ERROR: INTERNAL_TOKEN is required." >&2
  exit 1
fi

if [[ "${ALERT_CONFIRM_TOKEN}" == "dummy" ]]; then
  ALERT_CONFIRM_TOKEN=""
fi

ALERT_CONFIRM_BASE_URL=""
if [[ -n "${ALERT_CONFIRM_URL}" ]]; then
  ALERT_CONFIRM_BASE_URL="${ALERT_CONFIRM_URL%/smoke/confirm*}"
  if [[ -z "${ALERT_CONFIRM_BASE_URL}" || "${ALERT_CONFIRM_BASE_URL}" == "${ALERT_CONFIRM_URL}" ]]; then
    echo "ERROR: ALERT_CONFIRM_URL must be the full /smoke/confirm endpoint, e.g. https://.../smoke/confirm?alertname=..." >&2
    exit 1
  fi
fi

if [[ "${RUN_EXTERNAL_FORWARD_SMOKE}" == "true" ]]; then
  if [[ -z "${ALERTMANAGER_URL}" ]]; then
    echo "ERROR: ALERTMANAGER_URL is required when RUN_EXTERNAL_FORWARD_SMOKE=true." >&2
    exit 1
  fi
  if [[ -z "${ALERT_CONFIRM_BASE_URL}" ]]; then
    echo "ERROR: ALERT_CONFIRM_URL is required when RUN_EXTERNAL_FORWARD_SMOKE=true." >&2
    exit 1
  fi
  if [[ -z "${SLACK_WEBHOOK_URL}" || "${SLACK_WEBHOOK_URL}" == "dummy" ]]; then
    echo "ERROR: SLACK_WEBHOOK_URL is required when RUN_EXTERNAL_FORWARD_SMOKE=true." >&2
    exit 1
  fi
  if [[ -z "${PAGERDUTY_ROUTING_KEY}" || "${PAGERDUTY_ROUTING_KEY}" == "dummy" ]]; then
    echo "ERROR: PAGERDUTY_ROUTING_KEY is required when RUN_EXTERNAL_FORWARD_SMOKE=true." >&2
    exit 1
  fi
fi

SUMMARY_FILE="${EVIDENCE_DIR}/staging-readiness-summary-${RUN_ID}.md"
DRILL_SUMMARY="${EVIDENCE_DIR}/pilot-drill-summary-${RUN_ID}.md"
BOOST_LOG="${EVIDENCE_DIR}/staging-readiness-boost-${RUN_ID}.log"
CAL_PREVIEW="${EVIDENCE_DIR}/staging-readiness-calibration-preview-${RUN_ID}.json"
CAL_APPLY="${EVIDENCE_DIR}/staging-readiness-calibration-apply-${RUN_ID}.json"
RECOVERY_PREVIEW="${EVIDENCE_DIR}/staging-readiness-recovery-preview-${RUN_ID}.json"
RECOVERY_APPLY="${EVIDENCE_DIR}/staging-readiness-recovery-apply-${RUN_ID}.json"
SMOKE_INTERNAL_LOG="${EVIDENCE_DIR}/staging-readiness-alert-smoke-internal-${RUN_ID}.log"
SMOKE_SLACK_LOG="${EVIDENCE_DIR}/staging-readiness-alert-smoke-slack-${RUN_ID}.log"
SMOKE_PAGERDUTY_LOG="${EVIDENCE_DIR}/staging-readiness-alert-smoke-pagerduty-${RUN_ID}.log"
LOAD_SUMMARY="${EVIDENCE_DIR}/staging-readiness-load-${RUN_ID}_gates.md"
LOAD_STATS="${EVIDENCE_DIR}/staging-readiness-load-${RUN_ID}_stats.csv"
LOAD_HISTORY="${EVIDENCE_DIR}/staging-readiness-load-${RUN_ID}_stats_history.csv"
LOAD_HTML="${EVIDENCE_DIR}/staging-readiness-load-${RUN_ID}.html"

# Keep output artifacts in one location regardless of where the script is called from.
export OUT_DIR="$(dirname "${LOAD_SUMMARY}")"

cat <<EOF_SUMMARY > "${SUMMARY_FILE}"
# Staging Readiness Run ${RUN_ID}

- API base: \`${API_BASE_URL}\`
- Alertmanager: \`${ALERTMANAGER_URL:-disabled}\`
- Confirm endpoint: \`${ALERT_CONFIRM_URL:-disabled}\`
- External alert forwarding smoke: \`${RUN_EXTERNAL_FORWARD_SMOKE}\`
- Target domains: \`${TARGET_DOMAINS}\`
- Min jobs: \`${MIN_JOBS}\`
- Run load profile: \`${RUN_LOAD_PROFILE}\`
EOF_SUMMARY

run_internal_alert_smoke() {
  local out_file="$3"
  local forward_destination="$1"
  local expect_prefix="$2"
  local confirm_base="${ALERT_CONFIRM_BASE_URL}"
  (
    cd "${ROOT_DIR}/infra/staging"
    if [[ -n "${confirm_base}" ]]; then
      ALERTMANAGER_URL="${ALERTMANAGER_URL}" \
      CONFIRM_BASE_URL="${confirm_base}" \
      CONFIRM_TOKEN="${ALERT_CONFIRM_TOKEN}" \
      CONFIRM_FORWARD_DESTINATION="${forward_destination}" \
      CONFIRM_FORWARD_EXPECT_TARGET_PREFIX="${expect_prefix}" \
      ./external_alert_smoke.sh
    else
      ALERTMANAGER_URL="${ALERTMANAGER_URL}" ./external_alert_smoke.sh
    fi
  ) | tee "${out_file}"
}

ALERT_SMOKE_STATUS="skipped (ALERTMANAGER_URL not set)"
EXTERNAL_SMOKE_STATUS="skipped"
if [[ -n "${ALERTMANAGER_URL}" ]]; then
  {
    echo "== Alert smoke =="
    run_internal_alert_smoke "" "" "${SMOKE_INTERNAL_LOG}"
    if [[ "${RUN_EXTERNAL_FORWARD_SMOKE}" == "true" ]]; then
      run_internal_alert_smoke "slack" "https://hooks.slack.com" "${SMOKE_SLACK_LOG}"
      run_internal_alert_smoke "pagerduty" "https://events.pagerduty.com" "${SMOKE_PAGERDUTY_LOG}"
      echo "External Slack/PagerDuty forwarding smoke checks passed."
      EXTERNAL_SMOKE_STATUS="PASS (Slack+PagerDuty)"
    else
      echo "External forwarding smoke skipped (alerts may stay internal)."
      EXTERNAL_SMOKE_STATUS="skipped"
    fi
    ALERT_SMOKE_STATUS="PASS (internal path)"
  } >> "${SUMMARY_FILE}" 2>&1
else
  {
    echo "== Alert smoke =="
    echo "Skipped: ALERTMANAGER_URL not set."
  } >> "${SUMMARY_FILE}" 2>&1
fi

{
  echo "== Staging harvest volume and parser calibration bootstrap =="
  cd "${ROOT_DIR}/infra/staging"
  API_BASE_URL="${API_BASE_URL}" \
    INTERNAL_TOKEN="${INTERNAL_TOKEN}" \
    MIN_JOBS="${MIN_JOBS}" \
    BUFFER_MULTIPLIER="${BUFFER_MULTIPLIER}" \
    MAX_ROUNDS="${MAX_ROUNDS}" \
    DRAIN_CYCLES="${DRAIN_CYCLES}" \
    PENDING_LIMIT="${PENDING_LIMIT}" \
    TARGET_DOMAINS="${TARGET_DOMAINS}" \
    APPLY_CALIBRATION="${APPLY_CALIBRATION}" \
    python3 ./boost_crawl_volume.py | tee "${BOOST_LOG}"
} >> "${SUMMARY_FILE}" 2>&1

{
  echo "== Final calibration apply =="
  cd "${ROOT_DIR}/infra/staging"
  API_BASE_URL="${API_BASE_URL}" \
    INTERNAL_TOKEN="${INTERNAL_TOKEN}" \
    APPLY=true \
    MIN_JOBS="${MIN_JOBS}" \
    BUFFER_MULTIPLIER="${BUFFER_MULTIPLIER}" \
    ./calibrate_alert_thresholds.sh >"${CAL_APPLY}" \
    2>&1
  API_BASE_URL="${API_BASE_URL}" \
    INTERNAL_TOKEN="${INTERNAL_TOKEN}" \
    APPLY=false \
    MIN_JOBS="${MIN_JOBS}" \
    BUFFER_MULTIPLIER="${BUFFER_MULTIPLIER}" \
    ./calibrate_alert_thresholds.sh >"${CAL_PREVIEW}" \
    2>&1
} >> "${SUMMARY_FILE}" 2>&1

{
  echo "== Recovery patch preview (safe keys only) =="
  cd "${ROOT_DIR}/infra/staging"
  API_BASE_URL="${API_BASE_URL}" \
    INTERNAL_TOKEN="${INTERNAL_TOKEN}" \
    APPLY=false \
    MIN_CLASS_COUNT="${MIN_CLASS_COUNT}" \
    python3 ./apply_recovery_patches.py >"${RECOVERY_PREVIEW}" \
    2>&1
} >> "${SUMMARY_FILE}" 2>&1

if [[ "${APPLY_RECOVERY}" == "true" ]]; then
  {
    echo "== Recovery patch apply for safe classes =="
    cd "${ROOT_DIR}/infra/staging"
    API_BASE_URL="${API_BASE_URL}" \
      INTERNAL_TOKEN="${INTERNAL_TOKEN}" \
      APPLY=true \
      MIN_CLASS_COUNT="${MIN_CLASS_COUNT}" \
      python3 ./apply_recovery_patches.py >"${RECOVERY_APPLY}" \
      2>&1
  } >> "${SUMMARY_FILE}" 2>&1
fi

GO_NO_GO="PASS"
if [[ "${RUN_LOAD_PROFILE}" == "true" ]]; then
  {
    echo "== Staging load profile + gate check =="
    cd "${ROOT_DIR}"
    # Keep load artifacts in the evidence directory.
    OUT_DIR="${OUT_DIR}" \
      STAGING_BASE_URL="${API_BASE_URL}" \
      LOCK_GATES="${LOCK_GATES}" \
      GATES_FILE="${LOCKS_FILE}" \
      USERS="${USERS}" \
      SPAWN_RATE="${SPAWN_RATE}" \
      DURATION="${DURATION}" \
      RUN_ID="${RUN_ID}" \
      REPORT_MD="${LOAD_SUMMARY}" \
      ./infra/loadtest/run_staging_profile.sh "${API_BASE_URL}"
  } || GO_NO_GO="FAIL"
  
  if ! [[ -s "${LOAD_SUMMARY}" ]]; then
    GO_NO_GO="FAIL"
  fi
fi

{
  echo ""
  echo "## Final status"
  echo "- Go/No-Go: ${GO_NO_GO}"
  echo "- Load profile run: ${RUN_LOAD_PROFILE}"
  echo "- Alert smoke: ${ALERT_SMOKE_STATUS}"
  echo "- External forwarding smoke: ${EXTERNAL_SMOKE_STATUS}"
  echo "- Recovery patches preview: ${RECOVERY_PREVIEW}"
  if [[ -f "${RECOVERY_APPLY}" ]]; then
    echo "- Recovery patches applied: ${RECOVERY_APPLY}"
  else
    echo "- Recovery patches applied: skipped"
  fi
  echo ""
} >> "${SUMMARY_FILE}"

echo ""
echo "Readiness evidence summary: ${SUMMARY_FILE}"
echo "Staging readiness result: ${GO_NO_GO}"

if [[ "${GO_NO_GO}" != "PASS" ]]; then
  exit 1
fi
