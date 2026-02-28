# Staging Readiness Run staging_readiness_20260213_151819

- API base: `http://localhost:8000`
- Alertmanager: `http://localhost:9093`
- Confirm endpoint: `http://localhost:5001/smoke/confirm?alertname=staging_readiness`
- Target domains: `bbcgoodfood.com,diffordsguide.com,imbibemagazine.com,punchdrink.com`
- Min jobs: `20`
- Run load profile: `true`
== Alert forwarding smoke ==
Triggering alertmanager smoke
Posting synthetic alert to http://localhost:9093
Checking alert groups
[{"alerts":[{"annotations":{"description":"Synthetic alert for alert routing validation","summary":"Local alert delivery smoke test"},"endsAt":"2026-02-13T20:22:44.516Z","fingerprint":"7f66489346c7f963","receivers":[{"name":"default"}],"startsAt":"2026-02-13T20:17:44.516Z","status":{"inhibitedBy":[],"silencedBy":[],"state":"active"},"updatedAt":"2026-02-13T20:17:44.516Z","labels":{"alertname":"StagingExternalSmokeAlert","run_id":"1771013864","service":"bartenderai","severity":"warning"}}],"labels":{"alertname":"StagingExternalSmokeAlert","run_id":"1771013864"},"receiver":{"name":"default"}},{"alerts":[{"annotations":{"description":"Synthetic alert for alert routing validation","summary":"Local alert delivery smoke test"},"endsAt":"2026-02-13T20:23:19.071Z","fingerprint":"4459d164a49e9e33","receivers":[{"name":"default"}],"startsAt":"2026-02-13T20:18:19.071Z","status":{"inhibitedBy":[],"silencedBy":[],"state":"active"},"updatedAt":"2026-02-13T20:18:19.071Z","labels":{"alertname":"StagingExternalSmokeAlert","run_id":"1771013899","service":"bartenderai","severity":"warning"}}],"labels":{"alertname":"StagingExternalSmokeAlert","run_id":"1771013899"},"receiver":{"name":"default"}}]
Alert smoke test posted. Confirm receiver endpoint delivery in your alert destination.
Polling external receiver confirmation endpoint
External confirmation succeeded with HTTP 200.
{"status":"ok","window_seconds":120,"latest":{"alertname":"StagingExternalSmokeAlert","run_id":"1771013899","severity":"warning","status":"firing","received_at":"2026-02-13T20:18:49.081260+00:00","age_seconds":0.19},"recent_count":1}Polling downstream forward confirmation endpoint
Downstream forward confirmation succeeded with HTTP 200.
{"status":"ok","window_seconds":120,"latest":{"alertname":"StagingExternalSmokeAlert","run_id":"1771013899","destination":"slack","target":"http://alert-receiver:5001","ok":true,"status_code":200,"error":"","attempted_at":"2026-02-13T20:18:49.092817+00:00","age_seconds":0.2},"recent_count":1}Expected downstream forward target to start with 'https://hooks.slack.com', got 'http://alert-receiver:5001'
