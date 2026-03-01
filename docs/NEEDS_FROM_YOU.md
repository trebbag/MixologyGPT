# Needs From You

## Current active blocker from latest all-six run (`2026-02-28`)
- Latest run: GitHub Actions `Staging Pilot All-Six` (`22527705001`)
- Result: precheck failed before signoff/E2E execution
- Failure details:
  - `STAGING_E2E_ACCESS_TOKEN` returned `401` from `GET /v1/auth/sessions`
  - role lookup returned `401` from `GET /v1/users/me`
- Required fix:
  - rotate/regenerate `STAGING_E2E_ACCESS_TOKEN` for a `power` or `admin` user
  - update the GitHub secret and rerun all-six

## Pilot cutover blockers (as of 2026-02-24)
- What is needed: real staging API access and internal auth for signoff + E2E execution
- Why: pilot sign-off now allows alert smoke to be skipped when alert infrastructure is not wired; external forwarding is optional
- Required now:
  - `STAGING_BASE_URL`
  - `STAGING_INTERNAL_TOKEN` (required by pilot signoff + policy/recovery maintenance workflows)
  - `STAGING_E2E_ACCESS_TOKEN` (required for authenticated staging load-profile calls during signoff/all-six)
- Optional (recommended for in-app alert smoke):
  - `STAGING_ALERTMANAGER_URL`
- Optional (recommended for receiver confirmation):
  - `STAGING_ALERT_RECEIVER_CONFIRM_URL`
  - `STAGING_ALERT_RECEIVER_CONFIRM_TOKEN`
- Optional (only if you want external forwarding validation):
  - `STAGING_SLACK_WEBHOOK_URL` (or runtime `SLACK_WEBHOOK_URL`)
  - `STAGING_PAGERDUTY_ROUTING_KEY` (or runtime `PAGERDUTY_ROUTING_KEY`)
- Fast path command (real staging only): `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI && API_BASE_URL=https://<staging-host> INTERNAL_TOKEN=<token> ./infra/staging/pilot_real_signoff.sh`
- One-shot all-six command (real staging only): `cd /Users/gregorygabbert/Documents/GitHub/BartenderAI && API_BASE_URL=https://<staging-host> INTERNAL_TOKEN=<token> STAGING_E2E_ACCESS_TOKEN=<token> ./infra/staging/pilot_all_six.sh`
- If web is hosted on a different domain than the API (for example Render static site + Render API service), add `WEB_BASE_URL=https://<staging-web-host>` to the all-six command.
- Safe handling: secrets only in GitHub Actions/host secret stores; never commit

## One-click all-six staging workflow secrets
- What is needed: populate all secrets used by `.github/workflows/staging-pilot-all-six.yml`
- Why: this workflow now runs the full six-item continuation (real signoff + non-mocked web/mobile staging E2E + compliance smoke) in one job
- Required now:
  - `STAGING_BASE_URL`
  - `STAGING_WEB_BASE_URL` (required when staging web is not served by `STAGING_BASE_URL`)
  - `STAGING_INTERNAL_TOKEN`
  - `STAGING_E2E_ACCESS_TOKEN`
- Optional:
  - `STAGING_ALERTMANAGER_URL`
  - `STAGING_ALERT_RECEIVER_CONFIRM_URL`
  - `STAGING_ALERT_RECEIVER_CONFIRM_TOKEN` (if receiver confirmation is protected)
  - `STAGING_SLACK_WEBHOOK_URL`
  - `STAGING_PAGERDUTY_ROUTING_KEY`
- Safe handling: GitHub Actions secrets only; never commit to repo files

## Real staging load sign-off window
- What is needed: approved staging host/window for the second tuned load sign-off run
- Why: local lock/gate pass exists, but pilot go/no-go must be tied to representative non-local staging traffic
- Required now:
  - `STAGING_BASE_URL`
  - staging traffic window (timebox where representative load is acceptable)
  - explicit go/no-go owner for final gate sign-off
- Safe handling: no secrets in logs; keep run artifacts in `docs/runbooks/evidence`

## Staging non-mocked E2E execution token
- What is needed: `STAGING_E2E_ACCESS_TOKEN`
- Why: new non-mocked staging E2E suites for web/mobile require a valid bearer token to bypass interactive login and exercise tertiary offline/retry/error paths against real staging.
- Role requirement:
  - Web staging E2E includes `/studio` and `/recipes/harvest` routes, so this token must belong to a user with role `power` or `admin`.
  - A `user`/`consumer` token can pass auth checks but still fail web E2E route access checks.
- Rotation note:
  - If all-six precheck reports `401` on `/v1/auth/sessions` or `/v1/users/me`, regenerate and update `STAGING_E2E_ACCESS_TOKEN`.
- Used by:
  - `.github/workflows/staging-e2e-matrix.yml`
  - `apps/web` script `npm run test:e2e:staging`
  - `apps/mobile` script `npm run test:e2e:staging`
- Safe handling: store only in GitHub Actions secrets; never commit.

## OpenAI API access
- What is needed: `OPENAI_API_KEY`
- Why: embeddings and LLM-powered studio/copilot flows use OpenAI by default
- Config keys: `OPENAI_API_KEY`, `EMBEDDINGS_PROVIDER=openai`, `EMBEDDINGS_MODEL`, `LLM_PROVIDER=openai`, `LLM_MODEL`
- How to obtain: create an API key in the OpenAI dashboard, then add it to your local environment or secret manager
- Safe handling: do not commit secrets; set locally in `.env` or environment injection only

## OpenAI embedding model entitlement validation
- What is needed: confirm the staging/project key has access to `EMBEDDINGS_MODEL` (currently `text-embedding-3-small`) or provide an approved replacement model id
- Why: staging can fall back to deterministic hash embeddings for resiliency, but pilot quality validation requires real OpenAI embedding outputs
- Config keys: `OPENAI_API_KEY`, `EMBEDDINGS_MODEL`
- How to obtain: verify model access in OpenAI dashboard/project settings and run a staging smoke embedding request
- Safe handling: keep keys in secret managers or env vars only

## Approved source allowlist + seed URLs
- What is needed: final list of allowed domains and their seed URLs for crawling
- Why: automated harvest uses source policies to crawl only approved sources and honor rating/pervasiveness requirements
- Config keys: managed in the Admin Source Policies UI; seeds are stored in `recipe_source_policies.seed_urls`
- How to obtain: provide the approved domains and exact seed URLs you want the crawler to start from
- Safe handling: no secrets required, but confirm legal/compliance approvals for each source

Current decision captured:
- Pilot sign-off target domains now exclude `allrecipes.com`.
- Preferred crawl targets are `diffordsguide.com` and (optionally) `liquor.com` when an active source policy exists for `liquor.com`.

## Source compliance sign-off
- What is needed: legal/compliance confirmation for each approved source domain
- Why: crawler now enforces robots/meta/canonical/paywall compliance checks and should only run against approved sources
- Config keys: managed in Admin Source Policies (`respect_robots`, `seed_urls`, review thresholds)
- How to obtain: confirm with legal/content policy owner that each source can be crawled for the intended use
- Safe handling: no secrets required

## Crawler alert threshold calibration
- What is needed: domain-level alert thresholds for failure rate, parser fallback rate, retry queue size, and compliance rejection count
- Why: the new crawler telemetry dashboard and warning system evaluates these thresholds from `alert_settings` per source policy
- Config keys: managed in Admin Source Policies as JSON in `alert_settings` (`max_failure_rate`, `max_parser_fallback_rate`, `max_retry_queue`, `max_compliance_rejections`, `max_avg_attempt_count`)
- How to obtain: start with defaults, then calibrate after pilot runs using observed telemetry in the Admin Crawler Ops panel
- Safe handling: no secrets required

## Admin user for internal jobs
- What is needed: at least one admin user in the system
- Why: background harvest sweeps run with internal credentials and must attribute jobs to an admin user
- Config keys: none (user record in the database)
- How to obtain: create a user, then set role to `admin` in the Admin UI or via DB update
- Safe handling: no secrets required

Local shortcut:
- If `ENVIRONMENT` is unset (defaults to `local`), calling `POST /v1/auth/dev-token` will seed an admin user:
  - email: `dev@bartender.ai`
  - password: `dev-password`

## Staging deployment pipeline secrets
- What is needed: GitHub Actions secrets for staging deploy
- Why: the staging pipeline (`.github/workflows/staging-deploy.yml`) builds/pushes images and deploys over SSH only when these secrets are set
- Config keys:
  - `STAGING_SSH_HOST`
  - `STAGING_SSH_USER`
  - `STAGING_SSH_KEY`
  - `STAGING_GHCR_TOKEN`
  - `STAGING_GHCR_USERNAME` (optional; defaults to workflow actor)
  - `STAGING_DEPLOY_PATH`
  - `STAGING_BASE_URL`
  - `STAGING_WEB_BASE_URL` (required when staging web host differs from API host; used by staging web E2E in all-six workflow)
  - `STAGING_ALERT_WEBHOOK_URL` (recommended; syncs `ALERT_WEBHOOK_URL` during deploy)
  - `STAGING_SLACK_WEBHOOK_URL` (recommended; enables receiver forwarding + CI external smoke validation)
  - `STAGING_PAGERDUTY_ROUTING_KEY` (recommended; enables receiver forwarding + CI external smoke validation)
  - `STAGING_FORWARD_WEBHOOK_URLS` (optional; generic webhook forwarding)
  - `STAGING_ALERT_RECEIVER_CONFIRM_TOKEN` (recommended; protects `/smoke/confirm*` endpoints used by CI)
  - `STAGING_ALERTMANAGER_URL` (optional; enables CI smoke trigger after deploy)
  - `STAGING_ALERT_RECEIVER_CONFIRM_URL` (optional; receiver-side confirmation endpoint)
  - `STAGING_INTERNAL_TOKEN` (required by staging policy/recovery maintenance and pilot signoff workflows)
  - `STAGING_E2E_ACCESS_TOKEN` (required by non-mocked staging web/mobile E2E workflow)
- How to obtain: provision a staging VM with Docker, create a deploy SSH keypair, and create a GHCR token with pull access on the staging host
- Safe handling: store only in GitHub Actions secrets and host secret store; never commit keys/tokens

## Staging runtime environment values
- What is needed: populated `infra/staging/.env.staging` on the staging host
- Why: API/workers/web containers require runtime secrets and provider configuration
- Config keys:
  - `POSTGRES_PASSWORD`
  - `JWT_SECRET`
  - `OPENAI_API_KEY`
  - `INTERNAL_TOKEN`
  - `EMBEDDINGS_PROVIDER`, `EMBEDDINGS_MODEL`, `EMBEDDINGS_DIMENSIONS`
  - `LLM_PROVIDER`, `LLM_MODEL`, `LLM_TEMPERATURE`
  - `NEXT_PUBLIC_API_URL`
- Notes:
  - Real staging should NOT set `PAGERDUTY_EVENTS_URL` (local-only smoke override). The deploy workflow now strips it on deploy to avoid accidental non-production forwarding.
- How to obtain: copy `infra/staging/.env.staging.example` and replace placeholders with real values
- Safe handling: keep this file only on the staging host; do not commit it

## Alert routing endpoint for telemetry
- What is needed: internal alert routing to the in-app `alert-receiver`; external destinations are optional
- Why: Alertmanager routes into the BartenderAI `alert-receiver`, which provides in-app/internal alert handling and optional forwarding to Slack/PagerDuty/webhooks.
- Config keys (runtime env vars for `infra/alert_receiver`):
  - `SLACK_WEBHOOK_URL` (optional Slack Incoming Webhook URL)
  - `PAGERDUTY_ROUTING_KEY` (optional PagerDuty Events v2 routing key)
  - `PAGERDUTY_EVENTS_URL` (optional override for smoke testing; leave unset in real staging/prod)
  - `FORWARD_WEBHOOK_URLS` (optional comma-separated list of generic webhook URLs to forward the raw Alertmanager payload)
  - `ALERT_RECEIVER_SHARED_SECRET` (optional: require `X-Alert-Receiver-Token` header on `/alerts`)
  - `ALERT_RECEIVER_CONFIRM_TOKEN` (optional: require bearer token on `/smoke/confirm`)
- Config keys (staging compose):
  - `ALERT_WEBHOOK_URL` in `infra/staging/.env.staging` (usually `http://alert-receiver:5001/alerts` inside the compose network)
  - GitHub Actions: `STAGING_ALERT_WEBHOOK_URL`, `STAGING_ALERT_RECEIVER_CONFIRM_TOKEN` (optional), plus `STAGING_*` deploy secrets
- How to obtain:
  - Internal-only mode: keep forwarding keys empty; set `ALERT_WEBHOOK_URL` to the in-cluster receiver endpoint.
  - Slack: create an Incoming Webhook for the target channel.
  - PagerDuty: create/choose a service and copy its Events v2 integration key.
  - Webhook: provide your incident system endpoint URL(s).
- Safe handling: treat Slack webhook URLs and PagerDuty routing keys as secrets; store them in GitHub Actions secrets and/or host secret stores, never in git.

## Staging traffic window for threshold calibration
- What is needed: at least one meaningful staging crawl run per approved domain (target: `>= 20` jobs/domain)
- Why: alert threshold calibration now computes recommendations from observed domain telemetry and skips low-sample domains
- Config keys: calibration endpoint parameters `min_jobs` and `buffer_multiplier`
- How to obtain:
  - Queue volume: `infra/staging/boost_crawl_volume.py`
  - Drain pending jobs: `infra/staging/drain_pending_jobs.py`
  - Calibrate/apply: `infra/staging/calibrate_alert_thresholds.sh`
- Safe handling: no secrets beyond `INTERNAL_TOKEN`

## Pilot ops drill inputs
- What is needed: staging API URL plus a valid internal token
- Why: the new end-to-end ops drill script validates calibration, runbook readiness, and optional load gates; alert routing checks run when Alertmanager is configured
- Config keys: `API_BASE_URL` (or `STAGING_BASE_URL`), `INTERNAL_TOKEN`, optional `ALERTMANAGER_URL`, optional `APPLY_CALIBRATION`, optional `RUN_LOAD_PROFILE`
- Optional confirmation keys: `ALERT_CONFIRM_URL`, `ALERT_CONFIRM_TOKEN`
- How to obtain: use your staging endpoints and internal token, then run `infra/staging/pilot_ops_drill.sh`
- Safe handling: store token and endpoint secrets in environment variables or secret manager; never commit them
