import os

import httpx
import pytest


pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
    not os.getenv("RUN_INTEGRATION_TESTS"),
    reason="Integration tests require RUN_INTEGRATION_TESTS=1 and a running API",
    ),
]


def test_health_endpoint():
    res = httpx.get("http://localhost:8000/health", timeout=5.0)
    assert res.status_code == 200
