#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EVIDENCE_DIR="${EVIDENCE_DIR:-${ROOT_DIR}/docs/runbooks/evidence}"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
SUMMARY_FILE="${EVIDENCE_DIR}/staging-ci-sequence-${TIMESTAMP}.md"

DEPLOY_REF="${DEPLOY_REF:-$(git -C "${ROOT_DIR}" rev-parse --abbrev-ref HEAD)}"
BASE_URL="${BASE_URL:-${STAGING_BASE_URL:-}}"
WEB_BASE_URL="${WEB_BASE_URL:-${STAGING_WEB_BASE_URL:-${BASE_URL}}}"
USERS="${USERS:-40}"
SPAWN_RATE="${SPAWN_RATE:-8}"
DURATION="${DURATION:-5m}"
MIN_JOBS="${MIN_JOBS:-20}"
WATCH="${WATCH:-true}"
SKIP_DEPLOY="${SKIP_DEPLOY:-false}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

is_truthy() {
  local normalized
  normalized="$(printf '%s' "${1}" | tr '[:upper:]' '[:lower:]')"
  case "${normalized}" in
    1|true|yes|y|on) return 0 ;;
    *) return 1 ;;
  esac
}

append_summary() {
  cat >>"${SUMMARY_FILE}" <<EOF
$1
EOF
}

latest_run_id() {
  local workflow="$1"
  local started_at="$2"
  local attempts=0
  while [[ "${attempts}" -lt 24 ]]; do
    local run_id
    run_id="$(gh run list --workflow "${workflow}" --event workflow_dispatch --limit 10 --json databaseId,createdAt 2>/dev/null | \
      python3 - "${started_at}" <<'PY'
import json
import sys
from datetime import datetime

started_at = datetime.strptime(sys.argv[1], "%Y-%m-%dT%H:%M:%SZ")
payload = sys.stdin.read().strip()
if not payload:
    sys.exit(0)
try:
    runs = json.loads(payload)
except json.JSONDecodeError:
    sys.exit(0)
for run in runs:
    created_raw = run.get("createdAt")
    if not created_raw:
        continue
    created_at = datetime.strptime(created_raw, "%Y-%m-%dT%H:%M:%SZ")
    if created_at >= started_at:
        print(run["databaseId"])
        break
PY
)"
    if [[ -n "${run_id}" ]]; then
      echo "${run_id}"
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 5
  done

  echo "Unable to resolve workflow run id for ${workflow} after dispatch." >&2
  return 1
}

dispatch_workflow() {
  local workflow="$1"
  shift
  local started_at
  started_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  gh workflow run "${workflow}" --ref "${DEPLOY_REF}" "$@"
  local run_id
  run_id="$(latest_run_id "${workflow}" "${started_at}")"
  local run_url="https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/actions/runs/${run_id}"

  echo "${workflow} -> run ${run_id}"
  echo "${run_url}"

  append_summary "## ${workflow}
- run_id: \`${run_id}\`
- url: ${run_url}
"

  if is_truthy "${WATCH}"; then
    gh run watch "${run_id}" --exit-status
  fi
}

require_command gh
require_command git
require_command python3

if [[ "${DEPLOY_REF}" == "HEAD" ]]; then
  echo "Detached HEAD detected. Set DEPLOY_REF=<branch> before running this script." >&2
  exit 1
fi

gh auth status >/dev/null

if ! git -C "${ROOT_DIR}" ls-remote --exit-code --heads origin "${DEPLOY_REF}" >/dev/null 2>&1; then
  echo "Remote branch ${DEPLOY_REF} was not found on origin. Push the branch before dispatching workflows." >&2
  exit 1
fi

mkdir -p "${EVIDENCE_DIR}"
cat >"${SUMMARY_FILE}" <<EOF
# Staging CI Sequence - ${TIMESTAMP}

- ref: \`${DEPLOY_REF}\`
- base_url: \`${BASE_URL:-<secret-default>}\`
- web_base_url: \`${WEB_BASE_URL:-<secret-default>}\`
- users/spawn_rate/duration: \`${USERS}/${SPAWN_RATE}/${DURATION}\`
- min_jobs: \`${MIN_JOBS}\`

EOF

if ! is_truthy "${SKIP_DEPLOY}"; then
  dispatch_workflow "staging-deploy.yml" -f "deploy_ref=${DEPLOY_REF}"
fi

signoff_args=()
if [[ -n "${BASE_URL}" ]]; then
  signoff_args+=(-f "base_url=${BASE_URL}")
fi
if [[ -n "${WEB_BASE_URL}" ]]; then
  signoff_args+=(-f "web_base_url=${WEB_BASE_URL}")
fi
signoff_args+=(-f "users=${USERS}" -f "spawn_rate=${SPAWN_RATE}" -f "duration=${DURATION}")
dispatch_workflow "staging-signoff.yml" "${signoff_args[@]}"

all_six_args=()
if [[ -n "${BASE_URL}" ]]; then
  all_six_args+=(-f "base_url=${BASE_URL}")
fi
if [[ -n "${WEB_BASE_URL}" ]]; then
  all_six_args+=(-f "web_base_url=${WEB_BASE_URL}")
fi
all_six_args+=(
  -f "users=${USERS}"
  -f "spawn_rate=${SPAWN_RATE}"
  -f "duration=${DURATION}"
  -f "min_jobs=${MIN_JOBS}"
)
dispatch_workflow "staging-pilot-all-six.yml" "${all_six_args[@]}"

append_summary "## Next
- review the three workflow results on the same ref
- if all three PASS, record owner GO/NO-GO against the refreshed evidence bundle
"

echo
echo "Summary written to ${SUMMARY_FILE}"
