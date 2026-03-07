# Inventory Batch Upload Rollout

Last updated: `2026-03-06`

Use this sequence when promoting the AI-assisted inventory batch upload feature into a live environment.

## Scope
- Applies migration `0020_add_inventory_batch_upload_audits`
- Verifies web/mobile/API builds are running the new batch upload flow
- Confirms the admin ontology audit queue is writing and readable

## Preconditions
- Latest code is deployed or ready to deploy from `/Users/gregorygabbert/Documents/GitHub/BartenderAI`
- Runtime keys already exist in the target environment:
  - `OPENAI_API_KEY`
  - `COCKTAILDB_API_KEY`
- You have one of:
  - `ACCESS_TOKEN`
  - or `EMAIL` + `PASSWORD` for a valid user login
- Optional for audit-queue verification:
  - `INTERNAL_TOKEN`

## 1. Apply the migration

```bash
cd /Users/gregorygabbert/Documents/GitHub/BartenderAI/services/api
source .venv/bin/activate
PYTHONPATH=. alembic upgrade head
```

Expected result:
- Alembic creates `inventory_batch_upload_audits`
- No pending migration errors remain

## 2. Redeploy the application surfaces
- API
- Web
- Mobile build, if the environment distributes mobile binaries

Render note:
- Ensure the deployed API and web services still use the current runtime pairing:
  - `CORS_ALLOWED_ORIGINS=["https://mixologygpt-app.onrender.com"]`
  - `NEXT_PUBLIC_API_URL=https://mixologygpt.onrender.com`

## 3. Run the rollout smoke

With an existing bearer token:

```bash
cd /Users/gregorygabbert/Documents/GitHub/BartenderAI
API_BASE_URL=https://<api-host> \
WEB_BASE_URL=https://<web-host> \
ACCESS_TOKEN=<bearer-token> \
INTERNAL_TOKEN=<internal-token> \
./infra/staging/inventory_batch_upload_rollout.sh
```

Or let the helper log in first:

```bash
cd /Users/gregorygabbert/Documents/GitHub/BartenderAI
API_BASE_URL=https://<api-host> \
WEB_BASE_URL=https://<web-host> \
EMAIL=<user-email> \
PASSWORD=<user-password> \
INTERNAL_TOKEN=<internal-token> \
./infra/staging/inventory_batch_upload_rollout.sh
```

Optional:
- Add `MFA_TOKEN=<otp>` if the login user has MFA enabled
- Add `RUN_RUNTIME_SMOKE=false` to skip web/API surface checks
- Add `PREFIX="Custom Smoke Prefix"` to make the inserted rows easier to identify

## Expected output
- Runtime surface smoke passes if `WEB_BASE_URL` is supplied
- Batch preview returns `2` rows
- Batch import returns `applied: true`
- `created_items` is greater than `0`
- `pending_review_rows` is greater than `0` for the new ingredient entries
- If `INTERNAL_TOKEN` is supplied, `/v1/admin/inventory-batch-audits` returns `200` and includes the imported row names

## Failure interpretation
- `404` or `500` on the audit endpoint:
  - migration likely not applied or API not redeployed
- `401` on batch preview/import:
  - token is stale or login credentials are wrong
- `fetch_failed:cocktaildb-key-missing` in row notes or weak enrichment:
  - `COCKTAILDB_API_KEY` missing in the target runtime
- missing web/API runtime smoke:
  - check `NEXT_PUBLIC_API_URL` and `CORS_ALLOWED_ORIGINS`

## Evidence to keep
- Rollout command output
- Deployed commit SHA
- Confirmation that the admin ontology audit queue shows the imported rows
