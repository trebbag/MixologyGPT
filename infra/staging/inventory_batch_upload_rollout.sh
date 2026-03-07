#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_BASE_URL="${API_BASE_URL:-}"
WEB_BASE_URL="${WEB_BASE_URL:-}"
ACCESS_TOKEN="${ACCESS_TOKEN:-}"
EMAIL="${EMAIL:-}"
PASSWORD="${PASSWORD:-}"
MFA_TOKEN="${MFA_TOKEN:-}"
INTERNAL_TOKEN="${INTERNAL_TOKEN:-}"
RUN_RUNTIME_SMOKE="${RUN_RUNTIME_SMOKE:-true}"
PREFIX="${PREFIX:-Smoke Batch Upload}"

if [[ -z "${API_BASE_URL}" ]]; then
  echo "Missing API_BASE_URL" >&2
  exit 1
fi

if [[ -z "${ACCESS_TOKEN}" ]]; then
  if [[ -z "${EMAIL}" || -z "${PASSWORD}" ]]; then
    echo "Provide ACCESS_TOKEN or EMAIL/PASSWORD for login bootstrap." >&2
    exit 1
  fi

  ACCESS_TOKEN="$(
    API_BASE_URL="${API_BASE_URL}" EMAIL="${EMAIL}" PASSWORD="${PASSWORD}" MFA_TOKEN="${MFA_TOKEN}" python3 - <<'PY'
import json
import os
import sys
import urllib.error
import urllib.request

api_base_url = os.environ["API_BASE_URL"].rstrip("/")
payload = {
    "email": os.environ["EMAIL"],
    "password": os.environ["PASSWORD"],
}
mfa_token = os.environ.get("MFA_TOKEN", "").strip()
if mfa_token:
    payload["mfa_token"] = mfa_token

request = urllib.request.Request(
    f"{api_base_url}/v1/auth/jwt/login",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)

try:
    with urllib.request.urlopen(request) as response:
        body = json.loads((response.read().decode("utf-8") or "{}"))
except urllib.error.HTTPError as exc:
    body = exc.read().decode("utf-8") or "{}"
    print(f"Login failed: HTTP {exc.code} {body}", file=sys.stderr)
    raise SystemExit(1)

token = (body.get("access_token") or "").strip()
if not token:
    print(f"Login response missing access_token: {body}", file=sys.stderr)
    raise SystemExit(1)

print(token)
PY
  )"
fi

if [[ "${RUN_RUNTIME_SMOKE}" == "true" && -n "${WEB_BASE_URL}" ]]; then
  python3 "${ROOT_DIR}/infra/staging/runtime_surface_smoke.py" \
    --api-base-url "${API_BASE_URL}" \
    --web-base-url "${WEB_BASE_URL}"
fi

API_BASE_URL="${API_BASE_URL}" \
ACCESS_TOKEN="${ACCESS_TOKEN}" \
INTERNAL_TOKEN="${INTERNAL_TOKEN}" \
PREFIX="${PREFIX}" \
"${ROOT_DIR}/infra/staging/inventory_batch_upload_smoke.py"
