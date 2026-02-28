# Staging Readiness Run staging_readiness_20260213_145401

- API base: \
- Alertmanager: \
- Confirm endpoint: \
- Target domains: \
- Min jobs: \
- Run load profile: \
== Alert forwarding smoke ==
Triggering alertmanager smoke
Posting synthetic alert to http://localhost:9093
Checking alert groups
[{"alerts":[{"annotations":{"description":"Synthetic alert for alert routing validation","summary":"Local alert delivery smoke test"},"endsAt":"2026-02-13T19:59:01.144Z","fingerprint":"3db7bc9388a03b5b","receivers":[{"name":"default"}],"startsAt":"2026-02-13T19:54:01.144Z","status":{"inhibitedBy":[],"silencedBy":[],"state":"active"},"updatedAt":"2026-02-13T19:54:01.144Z","labels":{"alertname":"StagingExternalSmokeAlert","run_id":"1771012441","service":"bartenderai","severity":"warning"}}],"labels":{"alertname":"StagingExternalSmokeAlert","run_id":"1771012441"},"receiver":{"name":"default"}}]
Alert smoke test posted. Confirm receiver endpoint delivery in your alert destination.
Polling external receiver confirmation endpoint
External confirmation succeeded with HTTP 200.
{"status":"ok","window_seconds":120,"latest":{"alertname":"StagingExternalSmokeAlert","run_id":"1771012441","severity":"warning","status":"firing","received_at":"2026-02-13T19:54:31.159059+00:00","age_seconds":0.19},"recent_count":1}Polling downstream forward confirmation endpoint
Downstream forward confirmation succeeded with HTTP 200.
{"status":"ok","window_seconds":120,"latest":{"alertname":"StagingExternalSmokeAlert","run_id":"1771012441","destination":"slack","target":"http://alert-receiver:5001","ok":true,"status_code":200,"error":"","attempted_at":"2026-02-13T19:54:31.179327+00:00","age_seconds":0.2},"recent_count":1}Expected downstream forward target to start with 'https://hooks.slack.com', got 'http://alert-receiver:5001'
