# Staging Readiness Run staging_readiness_20260213_212637

- API base: `http://localhost:8000`
- Alertmanager: `http://localhost:9093`
- Confirm endpoint: `http://localhost:5001/smoke/confirm?alertname=StagingExternalSmokeAlert`
- Target domains: `bbcgoodfood.com,diffordsguide.com,imbibemagazine.com,punchdrink.com`
- Min jobs: `20`
- Run load profile: `false`
== Alert forwarding smoke ==
Triggering alertmanager smoke
Posting synthetic alert to http://localhost:9093
Checking alert groups
[{"alerts":[{"annotations":{"description":"Synthetic alert for alert routing validation","summary":"Local alert delivery smoke test"},"endsAt":"2026-02-14T02:31:37.137Z","fingerprint":"bea72c9ff0247392","receivers":[{"name":"default"}],"startsAt":"2026-02-14T02:26:37.137Z","status":{"inhibitedBy":[],"silencedBy":[],"state":"active"},"updatedAt":"2026-02-14T02:26:37.137Z","labels":{"alertname":"StagingExternalSmokeAlert","run_id":"1771035997","service":"bartenderai","severity":"warning"}}],"labels":{"alertname":"StagingExternalSmokeAlert","run_id":"1771035997"},"receiver":{"name":"default"}}]
Alert smoke test posted. Confirm receiver endpoint delivery in your alert destination.
Polling external receiver confirmation endpoint
External confirmation succeeded with HTTP 200.
{"status":"ok","window_seconds":120,"latest":{"alertname":"StagingExternalSmokeAlert","run_id":"1771035997","severity":"warning","status":"firing","received_at":"2026-02-14T02:27:07.145885+00:00","age_seconds":0.16},"recent_count":1}Polling downstream forward confirmation endpoint
Downstream forward confirmation succeeded with HTTP 200.
{"status":"ok","window_seconds":120,"latest":{"alertname":"StagingExternalSmokeAlert","run_id":"1771035997","destination":"slack","target":"http://alert-receiver:5001","ok":true,"status_code":200,"error":"","attempted_at":"2026-02-14T02:27:07.156268+00:00","age_seconds":0.17},"recent_count":1}Expected downstream forward target to start with 'https://hooks.slack.com', got 'http://alert-receiver:5001'
