# Staging Readiness Run staging_readiness_20260213_170232

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
[{"alerts":[{"annotations":{"description":"Synthetic alert for alert routing validation","summary":"Local alert delivery smoke test"},"endsAt":"2026-02-13T22:07:32.208Z","fingerprint":"5dcc4e59da2c126b","receivers":[{"name":"default"}],"startsAt":"2026-02-13T22:02:32.208Z","status":{"inhibitedBy":[],"silencedBy":[],"state":"active"},"updatedAt":"2026-02-13T22:02:32.208Z","labels":{"alertname":"StagingExternalSmokeAlert","run_id":"1771020152","service":"bartenderai","severity":"warning"}}],"labels":{"alertname":"StagingExternalSmokeAlert","run_id":"1771020152"},"receiver":{"name":"default"}}]
Alert smoke test posted. Confirm receiver endpoint delivery in your alert destination.
Polling external receiver confirmation endpoint
External confirmation succeeded with HTTP 200.
{"status":"ok","window_seconds":120,"latest":{"alertname":"StagingExternalSmokeAlert","run_id":"1771020152","severity":"warning","status":"firing","received_at":"2026-02-13T22:03:02.217929+00:00","age_seconds":0.17},"recent_count":1}Polling downstream forward confirmation endpoint
Downstream forward confirmation succeeded with HTTP 200.
{"status":"ok","window_seconds":120,"latest":{"alertname":"StagingExternalSmokeAlert","run_id":"1771020152","destination":"slack","target":"http://alert-receiver:5001","ok":true,"status_code":200,"error":"","attempted_at":"2026-02-13T22:03:02.240633+00:00","age_seconds":0.17},"recent_count":1}Expected downstream forward target to start with 'https://hooks.slack.com', got 'http://alert-receiver:5001'
