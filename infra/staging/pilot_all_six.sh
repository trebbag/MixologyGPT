#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_ID="${RUN_ID:-pilot_all_six_$(date +%Y%m%d_%H%M%S)}"
EVIDENCE_DIR="${EVIDENCE_DIR:-${ROOT_DIR}/docs/runbooks/evidence}"
SUMMARY_FILE="${EVIDENCE_DIR}/pilot-all-six-summary-${RUN_ID}.md"

API_BASE_URL="${API_BASE_URL:-${STAGING_BASE_URL:-}}"
WEB_BASE_URL="${WEB_BASE_URL:-${STAGING_WEB_BASE_URL:-${API_BASE_URL:-}}}"
ALERTMANAGER_URL="${ALERTMANAGER_URL:-${STAGING_ALERTMANAGER_URL:-}}"
ALERT_CONFIRM_URL="${ALERT_CONFIRM_URL:-${STAGING_ALERT_RECEIVER_CONFIRM_URL:-}}"
ALERT_CONFIRM_TOKEN="${ALERT_CONFIRM_TOKEN:-${STAGING_ALERT_RECEIVER_CONFIRM_TOKEN:-}}"
INTERNAL_TOKEN="${INTERNAL_TOKEN:-${STAGING_INTERNAL_TOKEN:-}}"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-${STAGING_SLACK_WEBHOOK_URL:-}}"
PAGERDUTY_ROUTING_KEY="${PAGERDUTY_ROUTING_KEY:-${STAGING_PAGERDUTY_ROUTING_KEY:-}}"
FORWARD_WEBHOOK_URLS="${FORWARD_WEBHOOK_URLS:-${STAGING_FORWARD_WEBHOOK_URLS:-}}"
STAGING_E2E_ACCESS_TOKEN="${STAGING_E2E_ACCESS_TOKEN:-}"

RUN_SIGNOFF="${RUN_SIGNOFF:-true}"
RUN_WEB_E2E="${RUN_WEB_E2E:-true}"
RUN_MOBILE_E2E="${RUN_MOBILE_E2E:-true}"
RUN_COMPLIANCE_SMOKE="${RUN_COMPLIANCE_SMOKE:-true}"
PRECHECK_ONLY="${PRECHECK_ONLY:-false}"
ALLOW_LOCAL_ENDPOINTS="${ALLOW_LOCAL_ENDPOINTS:-false}"
INSTALL_NODE_DEPS="${INSTALL_NODE_DEPS:-true}"
INSTALL_PLAYWRIGHT="${INSTALL_PLAYWRIGHT:-true}"

USERS="${USERS:-40}"
SPAWN_RATE="${SPAWN_RATE:-8}"
DURATION="${DURATION:-5m}"
MIN_JOBS="${MIN_JOBS:-20}"

mkdir -p "${EVIDENCE_DIR}"

SIGNOFF_LOG="${EVIDENCE_DIR}/pilot-all-six-signoff-${RUN_ID}.log"
WEB_E2E_LOG="${EVIDENCE_DIR}/pilot-all-six-web-e2e-${RUN_ID}.log"
MOBILE_E2E_LOG="${EVIDENCE_DIR}/pilot-all-six-mobile-e2e-${RUN_ID}.log"
COMPLIANCE_LOG="${EVIDENCE_DIR}/pilot-all-six-compliance-smoke-${RUN_ID}.log"

require_non_empty() {
  local key="$1"
  local value="$2"
  if [[ -z "${value}" ]]; then
    echo "missing ${key}"
    return 1
  fi
  return 0
}

reject_local_endpoint() {
  local key="$1"
  local value="$2"
  local normalized
  normalized="$(echo "${value}" | tr '[:upper:]' '[:lower:]')"
  if [[ "${normalized}" == *"localhost"* || "${normalized}" == *"127.0.0.1"* || "${normalized}" == *"alert-receiver"* ]]; then
    echo "${key} uses a local endpoint (${value})"
    return 1
  fi
  return 0
}

probe_web_base_url() {
  local base_url="$1"
  local probe_url="${base_url%/}/"
  local tmp_file
  tmp_file="$(mktemp)"
  local status_and_type
  if ! status_and_type="$(curl -sS -L --max-time 10 -o "${tmp_file}" -w "%{http_code}|%{content_type}" "${probe_url}")"; then
    rm -f "${tmp_file}"
    echo "fail|curl-error|"
    return 1
  fi
  local status="${status_and_type%%|*}"
  local content_type="${status_and_type#*|}"
  local body_head
  body_head="$(head -c 256 "${tmp_file}" | tr '[:upper:]' '[:lower:]')"
  rm -f "${tmp_file}"

  if [[ "${status}" -ge 400 ]]; then
    echo "fail|${status}|${content_type}"
    return 1
  fi
  if [[ "${content_type}" == *"text/html"* || "${body_head}" == *"<html"* || "${body_head}" == *"<!doctype html"* ]]; then
    echo "pass|${status}|${content_type}"
    return 0
  fi
  echo "fail|${status}|${content_type}"
  return 1
}

run_step() {
  local label="$1"
  local log_file="$2"
  shift 2
  echo "### ${label}" >> "${SUMMARY_FILE}"
  if "$@" > >(tee "${log_file}") 2>&1; then
    echo "- status: PASS" >> "${SUMMARY_FILE}"
    echo "- log: \`${log_file}\`" >> "${SUMMARY_FILE}"
    echo "" >> "${SUMMARY_FILE}"
    return 0
  fi
  echo "- status: FAIL" >> "${SUMMARY_FILE}"
  echo "- log: \`${log_file}\`" >> "${SUMMARY_FILE}"
  echo "" >> "${SUMMARY_FILE}"
  return 1
}

cat > "${SUMMARY_FILE}" <<EOF
# Pilot All-Six Run ${RUN_ID}

- api_base_url: \`${API_BASE_URL:-<unset>}\`
- web_base_url: \`${WEB_BASE_URL:-<unset>}\`
- alertmanager_url: \`${ALERTMANAGER_URL:-<unset>}\`
- alert_confirm_url: \`${ALERT_CONFIRM_URL:-<unset>}\`
- run_signoff: \`${RUN_SIGNOFF}\`
- run_web_e2e: \`${RUN_WEB_E2E}\`
- run_mobile_e2e: \`${RUN_MOBILE_E2E}\`
- run_compliance_smoke: \`${RUN_COMPLIANCE_SMOKE}\`

## Precheck
EOF

MISSING=0
PRECHECK_ITEMS=()
REQUIRED_PAIRS=()

if [[ "${RUN_SIGNOFF}" == "true" ]]; then
  REQUIRED_PAIRS+=("API_BASE_URL:${API_BASE_URL}")
  REQUIRED_PAIRS+=("INTERNAL_TOKEN:${INTERNAL_TOKEN}")
fi

if [[ "${RUN_WEB_E2E}" == "true" ]]; then
  REQUIRED_PAIRS+=("WEB_BASE_URL:${WEB_BASE_URL}")
  REQUIRED_PAIRS+=("STAGING_E2E_ACCESS_TOKEN:${STAGING_E2E_ACCESS_TOKEN}")
fi

if [[ "${RUN_MOBILE_E2E}" == "true" ]]; then
  REQUIRED_PAIRS+=("API_BASE_URL:${API_BASE_URL}")
  REQUIRED_PAIRS+=("STAGING_E2E_ACCESS_TOKEN:${STAGING_E2E_ACCESS_TOKEN}")
fi

if [[ "${RUN_COMPLIANCE_SMOKE}" == "true" ]]; then
  REQUIRED_PAIRS+=("API_BASE_URL:${API_BASE_URL}")
  REQUIRED_PAIRS+=("INTERNAL_TOKEN:${INTERNAL_TOKEN}")
fi

REQUIRED_SEEN=","
for pair in "${REQUIRED_PAIRS[@]}"; do
  key="${pair%%:*}"
  val="${pair#*:}"
  if [[ "${REQUIRED_SEEN}" == *",${key},"* ]]; then
    continue
  fi
  REQUIRED_SEEN="${REQUIRED_SEEN}${key},"
  if ! require_non_empty "${key}" "${val}" >/dev/null; then
    PRECHECK_ITEMS+=("- FAIL: missing \`${key}\`")
    MISSING=1
  else
    PRECHECK_ITEMS+=("- PASS: \`${key}\` provided")
  fi
done

if [[ "${RUN_WEB_E2E}" == "true" && -n "${WEB_BASE_URL}" ]]; then
  WEB_PROBE_RESULT="$(probe_web_base_url "${WEB_BASE_URL}" || true)"
  WEB_PROBE_STATUS="${WEB_PROBE_RESULT%%|*}"
  WEB_PROBE_REST="${WEB_PROBE_RESULT#*|}"
  WEB_PROBE_CODE="${WEB_PROBE_REST%%|*}"
  WEB_PROBE_TYPE="${WEB_PROBE_REST#*|}"
  if [[ "${WEB_PROBE_STATUS}" == "pass" ]]; then
    PRECHECK_ITEMS+=("- PASS: \`WEB_BASE_URL\` serves HTML (status ${WEB_PROBE_CODE})")
  else
    PRECHECK_ITEMS+=("- FAIL: \`WEB_BASE_URL\` does not appear to serve the web app (status ${WEB_PROBE_CODE}, content-type ${WEB_PROBE_TYPE:-unknown})")
    MISSING=1
  fi
fi

if [[ "${ALLOW_LOCAL_ENDPOINTS}" != "true" ]]; then
  LOCAL_CHECK_PAIRS=()
  if [[ "${RUN_SIGNOFF}" == "true" ]]; then
    LOCAL_CHECK_PAIRS+=("API_BASE_URL:${API_BASE_URL}")
    if [[ -n "${ALERTMANAGER_URL}" ]]; then
      LOCAL_CHECK_PAIRS+=("ALERTMANAGER_URL:${ALERTMANAGER_URL}")
    fi
  elif [[ "${RUN_WEB_E2E}" == "true" || "${RUN_MOBILE_E2E}" == "true" || "${RUN_COMPLIANCE_SMOKE}" == "true" ]]; then
    if [[ "${RUN_WEB_E2E}" == "true" ]]; then
      LOCAL_CHECK_PAIRS+=("WEB_BASE_URL:${WEB_BASE_URL}")
    fi
    if [[ "${RUN_MOBILE_E2E}" == "true" || "${RUN_COMPLIANCE_SMOKE}" == "true" ]]; then
      LOCAL_CHECK_PAIRS+=("API_BASE_URL:${API_BASE_URL}")
    fi
  fi

  LOCAL_SEEN=","
  for pair in "${LOCAL_CHECK_PAIRS[@]}"; do
    key="${pair%%:*}"
    val="${pair#*:}"
    if [[ "${LOCAL_SEEN}" == *",${key},"* ]]; then
      continue
    fi
    LOCAL_SEEN="${LOCAL_SEEN}${key},"
    if [[ -n "${val}" ]] && ! reject_local_endpoint "${key}" "${val}" >/dev/null; then
      PRECHECK_ITEMS+=("- FAIL: \`${key}\` must be non-local")
      MISSING=1
    fi
  done
fi

{
  printf '%s\n' "${PRECHECK_ITEMS[@]}"
  echo ""
} >> "${SUMMARY_FILE}"

if [[ "${PRECHECK_ONLY}" == "true" ]]; then
  if [[ "${MISSING}" -eq 1 ]]; then
    echo "Precheck completed with missing requirements."
  else
    echo "Precheck passed."
  fi
  echo "Summary: ${SUMMARY_FILE}"
  exit 0
fi

if [[ "${MISSING}" -eq 1 ]]; then
  echo "Precheck failed. Fix required variables and retry."
  echo "Summary: ${SUMMARY_FILE}"
  exit 1
fi

OVERALL=0

if [[ "${RUN_SIGNOFF}" == "true" ]]; then
  if ! run_step "1-5: real signoff (alerts + calibration + recovery + load gates)" "${SIGNOFF_LOG}" \
    env \
      API_BASE_URL="${API_BASE_URL}" \
      ALERTMANAGER_URL="${ALERTMANAGER_URL}" \
      ALERT_CONFIRM_URL="${ALERT_CONFIRM_URL}" \
      ALERT_CONFIRM_TOKEN="${ALERT_CONFIRM_TOKEN}" \
      INTERNAL_TOKEN="${INTERNAL_TOKEN}" \
      SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL}" \
      PAGERDUTY_ROUTING_KEY="${PAGERDUTY_ROUTING_KEY}" \
      FORWARD_WEBHOOK_URLS="${FORWARD_WEBHOOK_URLS}" \
      RUN_ID="${RUN_ID}_signoff" \
      EVIDENCE_DIR="${EVIDENCE_DIR}" \
      USERS="${USERS}" \
      SPAWN_RATE="${SPAWN_RATE}" \
      DURATION="${DURATION}" \
      MIN_JOBS="${MIN_JOBS}" \
      RUN_LOAD_PROFILE="true" \
      APPLY_CALIBRATION="true" \
      APPLY_RECOVERY="true" \
      LOCK_GATES="false" \
      bash "${ROOT_DIR}/infra/staging/pilot_real_signoff.sh"; then
    OVERALL=1
  fi
fi

if [[ "${RUN_WEB_E2E}" == "true" ]]; then
  if ! run_step "6a: web staging e2e matrix" "${WEB_E2E_LOG}" \
    bash -lc '
      set -euo pipefail
      cd "'"${ROOT_DIR}"'/apps/web"
      if [[ "'"${INSTALL_NODE_DEPS}"'" == "true" ]]; then
        npm ci
      fi
      if [[ "'"${INSTALL_PLAYWRIGHT}"'" == "true" ]]; then
        npx playwright install --with-deps chromium
      fi
      E2E_BASE_URL="'"${WEB_BASE_URL}"'" STAGING_E2E_ACCESS_TOKEN="'"${STAGING_E2E_ACCESS_TOKEN}"'" npm run test:e2e:staging
    '; then
    OVERALL=1
  fi
fi

if [[ "${RUN_MOBILE_E2E}" == "true" ]]; then
  if ! run_step "6b: mobile staging e2e matrix" "${MOBILE_E2E_LOG}" \
    bash -lc '
      set -euo pipefail
      cd "'"${ROOT_DIR}"'/apps/mobile"
      if [[ "'"${INSTALL_NODE_DEPS}"'" == "true" ]]; then
        npm ci
      fi
      STAGING_E2E_API_URL="'"${API_BASE_URL}"'" STAGING_E2E_ACCESS_TOKEN="'"${STAGING_E2E_ACCESS_TOKEN}"'" npm run test:e2e:staging
    '; then
    OVERALL=1
  fi
fi

if [[ "${RUN_COMPLIANCE_SMOKE}" == "true" ]]; then
  if ! run_step "6c: compliance rejection smoke" "${COMPLIANCE_LOG}" \
    env \
      API_BASE_URL="${API_BASE_URL}" \
      INTERNAL_TOKEN="${INTERNAL_TOKEN}" \
      python3 "${ROOT_DIR}/infra/staging/compliance_rejection_smoke.py"; then
    OVERALL=1
  fi
fi

{
  echo "## Final"
  if [[ "${OVERALL}" -eq 0 ]]; then
    echo "- status: PASS"
  else
    echo "- status: FAIL"
  fi
  echo ""
} >> "${SUMMARY_FILE}"

echo "Summary: ${SUMMARY_FILE}"
if [[ "${OVERALL}" -ne 0 ]]; then
  exit 1
fi
