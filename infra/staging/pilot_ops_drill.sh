#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_BASE_URL="${API_BASE_URL:-${STAGING_BASE_URL:-}}"
ALERTMANAGER_URL="${ALERTMANAGER_URL:-http://localhost:9093}"
INTERNAL_TOKEN="${INTERNAL_TOKEN:-}"
APPLY_CALIBRATION="${APPLY_CALIBRATION:-false}"
MIN_JOBS="${MIN_JOBS:-20}"
BUFFER_MULTIPLIER="${BUFFER_MULTIPLIER:-1.25}"
RUN_LOAD_PROFILE="${RUN_LOAD_PROFILE:-false}"
LOCK_GATES="${LOCK_GATES:-false}"
ALERT_CONFIRM_URL="${ALERT_CONFIRM_URL:-}"
ALERT_CONFIRM_BASE_URL="${ALERT_CONFIRM_BASE_URL:-}"
ALERT_CONFIRM_TOKEN="${ALERT_CONFIRM_TOKEN:-}"
ALERT_CONFIRM_FORWARD_DESTINATION="${ALERT_CONFIRM_FORWARD_DESTINATION:-}"
ALERT_CONFIRM_FORWARD_EXPECT_TARGET_PREFIX="${ALERT_CONFIRM_FORWARD_EXPECT_TARGET_PREFIX:-}"
DRILL_RUN_ID="${DRILL_RUN_ID:-$(date +%Y-%m-%d_%H%M%S)}"
EVIDENCE_DIR="${EVIDENCE_DIR:-${ROOT_DIR}/docs/runbooks/evidence}"
GATES_FILE="${GATES_FILE:-${ROOT_DIR}/infra/loadtest/gates.pilot.locked.json}"

mkdir -p "${EVIDENCE_DIR}"
HEALTH_FILE="${EVIDENCE_DIR}/pilot-drill-health-${DRILL_RUN_ID}.json"
METRICS_FILE="${EVIDENCE_DIR}/pilot-drill-metrics-${DRILL_RUN_ID}.txt"
CAL_PREVIEW_FILE="${EVIDENCE_DIR}/pilot-drill-calibration-preview-${DRILL_RUN_ID}.json"
CAL_APPLY_FILE="${EVIDENCE_DIR}/pilot-drill-calibration-apply-${DRILL_RUN_ID}.json"
ALERT_FILE="${EVIDENCE_DIR}/pilot-drill-alert-smoke-${DRILL_RUN_ID}.log"
RUNBOOK_CHECK_FILE="${EVIDENCE_DIR}/pilot-drill-runbook-check-${DRILL_RUN_ID}.txt"
SUMMARY_FILE="${EVIDENCE_DIR}/pilot-drill-summary-${DRILL_RUN_ID}.md"

if [[ -z "${API_BASE_URL}" ]]; then
  echo "API_BASE_URL or STAGING_BASE_URL is required."
  exit 1
fi

if [[ -z "${INTERNAL_TOKEN}" ]]; then
  echo "INTERNAL_TOKEN is required."
  exit 1
fi

echo "== Pilot Ops Drill =="
echo "API_BASE_URL=${API_BASE_URL}"
echo "ALERTMANAGER_URL=${ALERTMANAGER_URL}"
echo "APPLY_CALIBRATION=${APPLY_CALIBRATION}"
echo "RUN_LOAD_PROFILE=${RUN_LOAD_PROFILE}"
echo "LOCK_GATES=${LOCK_GATES}"
echo "DRILL_RUN_ID=${DRILL_RUN_ID}"
echo "EVIDENCE_DIR=${EVIDENCE_DIR}"

echo ""
echo "1) Health and metrics smoke"
curl -fsS "${API_BASE_URL}/health" | tee "${HEALTH_FILE}" >/dev/null
curl -fsS "${API_BASE_URL}/metrics" | head -n 200 > "${METRICS_FILE}"
echo "Health and metrics checks passed."
echo "  - Health: ${HEALTH_FILE}"
echo "  - Metrics snapshot: ${METRICS_FILE}"

echo ""
echo "2) Run alert threshold calibration"
(
  cd "${ROOT_DIR}/infra/staging"
  API_BASE_URL="${API_BASE_URL}" \
  INTERNAL_TOKEN="${INTERNAL_TOKEN}" \
  APPLY=false \
  MIN_JOBS="${MIN_JOBS}" \
  BUFFER_MULTIPLIER="${BUFFER_MULTIPLIER}" \
  ./calibrate_alert_thresholds.sh >"${CAL_PREVIEW_FILE}"
)
echo "Calibration preview saved to ${CAL_PREVIEW_FILE}"

if [[ "${APPLY_CALIBRATION}" == "true" ]]; then
  (
    cd "${ROOT_DIR}/infra/staging"
    API_BASE_URL="${API_BASE_URL}" \
    INTERNAL_TOKEN="${INTERNAL_TOKEN}" \
    APPLY=true \
    MIN_JOBS="${MIN_JOBS}" \
    BUFFER_MULTIPLIER="${BUFFER_MULTIPLIER}" \
    ./calibrate_alert_thresholds.sh >"${CAL_APPLY_FILE}"
  )
  echo "Calibration apply saved to ${CAL_APPLY_FILE}"
else
  echo "Calibration apply skipped (set APPLY_CALIBRATION=true to persist thresholds)."
fi

echo ""
echo "3) Alert smoke validation"
(
  cd "${ROOT_DIR}/infra/staging"
  ALERTMANAGER_URL="${ALERTMANAGER_URL}" \
  CONFIRM_URL="${ALERT_CONFIRM_URL}" \
  CONFIRM_BASE_URL="${ALERT_CONFIRM_BASE_URL}" \
  CONFIRM_TOKEN="${ALERT_CONFIRM_TOKEN}" \
  CONFIRM_FORWARD_DESTINATION="${ALERT_CONFIRM_FORWARD_DESTINATION}" \
  CONFIRM_FORWARD_EXPECT_TARGET_PREFIX="${ALERT_CONFIRM_FORWARD_EXPECT_TARGET_PREFIX}" \
  ./external_alert_smoke.sh >"${ALERT_FILE}"
)
echo "Alert smoke output saved to ${ALERT_FILE}"

echo ""
echo "4) Runbook validation checks"
: > "${RUNBOOK_CHECK_FILE}"
for runbook in \
  "${ROOT_DIR}/docs/runbooks/crawler-kill-switch.md" \
  "${ROOT_DIR}/docs/runbooks/incident-response.md" \
  "${ROOT_DIR}/docs/runbooks/rollback.md"
do
  if [[ ! -f "${runbook}" ]]; then
    echo "Missing runbook: ${runbook}"
    exit 1
  fi
  echo "OK ${runbook}" >> "${RUNBOOK_CHECK_FILE}"
done
echo "Runbooks present."
echo "Runbook check output saved to ${RUNBOOK_CHECK_FILE}"

echo ""
echo "5) Optional staging load profile and gate evaluation"
if [[ "${RUN_LOAD_PROFILE}" == "true" ]]; then
  (
    cd "${ROOT_DIR}"
    STAGING_BASE_URL="${API_BASE_URL}" \
    LOCK_GATES="${LOCK_GATES}" \
    GATES_FILE="${GATES_FILE}" \
    ./infra/loadtest/run_staging_profile.sh "${API_BASE_URL}"
  )
  echo "Staging load profile completed."
else
  echo "Load profile skipped (set RUN_LOAD_PROFILE=true to execute)."
fi

cat > "${SUMMARY_FILE}" <<EOF
# Pilot Ops Drill Summary

- Run id: \`${DRILL_RUN_ID}\`
- API base URL: \`${API_BASE_URL}\`
- Alertmanager URL: \`${ALERTMANAGER_URL}\`
- Calibration applied: \`${APPLY_CALIBRATION}\`
- Load profile executed: \`${RUN_LOAD_PROFILE}\`
- Gate lock executed: \`${LOCK_GATES}\`

## Evidence
- Health: \`${HEALTH_FILE}\`
- Metrics snapshot: \`${METRICS_FILE}\`
- Calibration preview: \`${CAL_PREVIEW_FILE}\`
- Calibration apply: \`${CAL_APPLY_FILE}\`
- Alert smoke: \`${ALERT_FILE}\`
- Runbook checks: \`${RUNBOOK_CHECK_FILE}\`

## Notes
- If calibration apply was skipped, \`${CAL_APPLY_FILE}\` may not exist.
- If load profile was skipped, run \`infra/loadtest/run_staging_profile.sh\` separately.
EOF

echo ""
echo "Pilot ops drill complete."
echo "Summary written to ${SUMMARY_FILE}"
