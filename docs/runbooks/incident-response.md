# Incident Response Runbook

## Scope
Operational incidents for API, crawler, studio generation, and telemetry/alerts.

## Severity
- `SEV-1`: Compliance breach, data integrity corruption, or full outage.
- `SEV-2`: Major feature outage (harvest/studio/recommendations unusable).
- `SEV-3`: Degraded performance or partial functionality.

## Response Workflow
1. Detect
   - Prometheus/Grafana alerts (`ApiErrorRateHigh`, `CrawlerFailureRateHigh`, retry backlog).
2. Triage
   - Check `/health`, `/metrics`, crawler telemetry panel, and recent deploys.
3. Contain
   - Use crawler kill switch if source/compliance issue.
   - Rate limit sensitive endpoints tighter when abuse/spike is active.
4. Mitigate
   - Roll back to last healthy image tag if recent deployment introduced regressions.
   - Restart workers only after queue health reviewed.
5. Recover
   - Verify key user journey: inventory -> recipe -> studio.
6. Postmortem
   - Capture impact window, root cause, corrective actions, and threshold adjustments.

## Triage Checklist
- API 5xx rate and p95 latency.
- Harvest job statuses by domain (failed/retryable/compliance reasons).
- Parser fallback and parse-failure class spikes.
- Studio generation success and response latency.
