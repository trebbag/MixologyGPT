import unittest
from unittest.mock import patch

from app.config import Settings
from app.internal_api import InternalApiError, InternalApiResponse
from app.tasks import harvester, notifications


class WorkerTaskTests(unittest.TestCase):
    def test_process_harvest_job_reports_warning_for_failed_payload(self):
        with patch.object(
            harvester,
            "request_internal",
            return_value=InternalApiResponse(status_code=200, payload={"status": "failed", "error": "parse failed"}, text=""),
        ) as request_mock, patch.object(harvester, "report_job_status") as report_mock:
            result = harvester.process_harvest_job.run("job-123")

        request_mock.assert_called_once()
        report_mock.assert_called_once_with("process_harvest_job", "warning", "job job-123: parse failed")
        self.assertEqual(result["status"], "warning")

    def test_process_harvest_job_raises_on_internal_api_failure(self):
        with patch.object(
            harvester,
            "request_internal",
            side_effect=InternalApiError("POST", "/v1/recipes/harvest/jobs/job-123/run", 502, "upstream failed"),
        ), patch.object(harvester, "report_job_status") as report_mock:
            with self.assertRaises(InternalApiError):
                harvester.process_harvest_job.run("job-123")

        report_mock.assert_called_once()
        self.assertIn("upstream failed", report_mock.call_args.args[2])

    def test_send_expiry_reminders_raises_on_refresh_failure(self):
        with patch.object(
            notifications,
            "request_internal",
            side_effect=InternalApiError("POST", "/v1/notifications/refresh", 503, "notifications down"),
        ), patch.object(notifications, "report_job_status") as report_mock:
            with self.assertRaises(InternalApiError):
                notifications.send_expiry_reminders.run()

        report_mock.assert_called_once_with("send_expiry_reminders", "error", "POST /v1/notifications/refresh failed (503): notifications down")

    def test_sweep_source_policies_reports_calibrated_telemetry_alerts(self):
        responses = [
            InternalApiResponse(
                status_code=200,
                payload=[
                    {
                        "domain": "example.com",
                        "seed_urls": ["https://example.com/drinks"],
                        "max_pages": 5,
                        "max_recipes": 2,
                        "crawl_depth": 1,
                        "respect_robots": True,
                        "alert_settings": {
                            "max_parser_fallback_rate": 0.6,
                            "max_compliance_rejections": 5,
                            "max_parse_failure_rate": 0.3,
                        },
                    }
                ],
                text="",
            ),
            InternalApiResponse(
                status_code=200,
                payload={"queued_job_ids": ["job-1"], "parsed_count": 1, "parser_stats": {}, "parse_failure_counts": {}},
                text="",
            ),
            InternalApiResponse(
                status_code=200,
                payload={
                    "alerts": [
                        {
                            "domain": "example.com",
                            "metric": "failure_rate",
                            "actual": 0.41,
                            "threshold": 0.35,
                        }
                    ]
                },
                text="",
            ),
        ]

        with patch.object(harvester, "request_internal", side_effect=responses) as request_mock, patch.object(
            harvester, "report_job_status"
        ) as report_mock:
            result = harvester.sweep_source_policies.run(limit=10)

        self.assertEqual(request_mock.call_count, 3)
        self.assertEqual(result["status"], "warning")
        self.assertEqual(result["telemetry_alerts"], ["example.com:failure_rate=0.41>0.35"])
        report_mock.assert_called_once()
        self.assertIn("telemetry_alerts 1", report_mock.call_args.args[2])


class WorkerConfigTests(unittest.TestCase):
    def test_validate_runtime_rejects_non_local_defaults(self):
        settings = Settings(environment="staging", api_url="http://localhost:8000", internal_token="dev-internal")
        with self.assertRaises(RuntimeError):
            settings.validate_runtime()

    def test_validate_runtime_allows_local_defaults(self):
        settings = Settings(environment="local")
        settings.validate_runtime()


if __name__ == "__main__":
    unittest.main()
