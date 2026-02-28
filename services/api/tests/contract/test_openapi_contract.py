from app.main import app


def test_openapi_contains_harvest_auto():
    schema = app.openapi()
    paths = schema.get("paths", {})
    assert "/v1/auth/jwt/login" in paths
    assert "/v1/auth/jwt/refresh" in paths
    assert "/v1/auth/jwt/logout" in paths
    assert "/v1/auth/sessions" in paths
    assert "/v1/recipes/harvest/auto" in paths
    assert "/v1/recipes/harvest/jobs" in paths
    assert "/v1/admin/source-policies" in paths
    assert "/v1/admin/source-policies/{policy_id}/parser-settings/suggest-recovery" in paths
    assert "/v1/inventory/events" in paths
    assert "/v1/notifications/{notification_id}" in paths
    assert "/v1/notifications/{notification_id}/read" in paths
