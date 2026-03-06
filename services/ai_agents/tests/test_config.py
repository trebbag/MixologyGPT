import unittest

from common.config import DEFAULT_API_URL, Settings


class SettingsRuntimeValidationTests(unittest.TestCase):
    def test_local_environment_allows_local_defaults(self) -> None:
        settings = Settings(environment="local", api_url=DEFAULT_API_URL, auth_token=None)
        settings.validate_runtime()

    def test_non_local_environment_requires_non_local_api_url_and_auth_token(self) -> None:
        settings = Settings(environment="staging", api_url=DEFAULT_API_URL, auth_token=" ")

        with self.assertRaisesRegex(RuntimeError, "API_URL must be set to a non-local value"):
            settings.validate_runtime()

    def test_non_local_environment_requires_auth_token(self) -> None:
        settings = Settings(environment="staging", api_url="https://mixologygpt.onrender.com", auth_token="")

        with self.assertRaisesRegex(RuntimeError, "AUTH_TOKEN must be set outside local development"):
            settings.validate_runtime()

    def test_non_local_environment_accepts_explicit_api_url_and_token(self) -> None:
        settings = Settings(
            environment="staging",
            api_url="https://mixologygpt.onrender.com",
            auth_token="token-123",
        )

        settings.validate_runtime()
