# Staging Readiness Run pilot_readiness_local_20260214b

- API base: `http://localhost:8000`
- Alertmanager: `http://localhost:9093`
- Confirm endpoint: `http://localhost:5001/smoke/confirm?alertname=StagingExternalSmokeAlert`
- Target domains: `bbcgoodfood.com,diffordsguide.com,imbibemagazine.com,punchdrink.com`
- Min jobs: `20`
- Run load profile: `true`
== Alert forwarding smoke ==
Triggering alertmanager smoke
Posting synthetic alert to http://localhost:9093
Checking alert groups
[{"alerts":[{"annotations":{"description":"Synthetic alert for alert routing validation","summary":"Local alert delivery smoke test"},"endsAt":"2026-02-14T00:40:46.823Z","fingerprint":"c16ee983a930d02d","receivers":[{"name":"default"}],"startsAt":"2026-02-14T00:35:46.823Z","status":{"inhibitedBy":[],"silencedBy":[],"state":"active"},"updatedAt":"2026-02-14T00:35:46.823Z","labels":{"alertname":"StagingExternalSmokeAlert","run_id":"1771029346","service":"bartenderai","severity":"warning"}}],"labels":{"alertname":"StagingExternalSmokeAlert","run_id":"1771029346"},"receiver":{"name":"default"}},{"alerts":[{"annotations":{"description":"Synthetic alert for alert routing validation","summary":"Local alert delivery smoke test"},"endsAt":"2026-02-14T00:41:24.389Z","fingerprint":"e5b39acaeb0aad0f","receivers":[{"name":"default"}],"startsAt":"2026-02-14T00:36:24.389Z","status":{"inhibitedBy":[],"silencedBy":[],"state":"active"},"updatedAt":"2026-02-14T00:36:24.389Z","labels":{"alertname":"StagingExternalSmokeAlert","run_id":"1771029384","service":"bartenderai","severity":"warning"}}],"labels":{"alertname":"StagingExternalSmokeAlert","run_id":"1771029384"},"receiver":{"name":"default"}}]
Alert smoke test posted. Confirm receiver endpoint delivery in your alert destination.
Polling external receiver confirmation endpoint
External confirmation succeeded with HTTP 200.
{"status":"ok","window_seconds":120,"latest":{"alertname":"StagingExternalSmokeAlert","run_id":"1771029384","severity":"warning","status":"firing","received_at":"2026-02-14T00:36:54.396953+00:00","age_seconds":0.18},"recent_count":1}Polling downstream forward confirmation endpoint
Downstream forward confirmation succeeded with HTTP 200.
{"status":"ok","window_seconds":120,"latest":{"alertname":"StagingExternalSmokeAlert","run_id":"1771029384","destination":"slack","target":"http://alert-receiver:5001","ok":true,"status_code":200,"error":"","attempted_at":"2026-02-14T00:36:54.408454+00:00","age_seconds":0.19},"recent_count":1}Expected downstream forward target to start with 'https://hooks.slack.com', got 'http://alert-receiver:5001'
