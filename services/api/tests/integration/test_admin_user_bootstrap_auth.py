import uuid

from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.models.user import User
from app.db.session import get_db
from app.main import app


class _FakeScalarResult:
    def __init__(self, values):
        self._values = list(values)

    def all(self):
        return list(self._values)

    def first(self):
        return self._values[0] if self._values else None


class _FakeExecuteResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return _FakeScalarResult(self._values)


class _FakeUserDB:
    def __init__(self):
        self.users: list[User] = []

    async def execute(self, statement):
        sql = str(statement).lower()
        if "from users" not in sql:
            return _FakeExecuteResult([])

        params = getattr(statement.compile(), "params", {})
        email = str(next(iter(params.values()), "")).lower()
        matched = [u for u in self.users if (u.email or "").lower() == email]
        return _FakeExecuteResult(matched)

    async def commit(self):
        return None

    async def refresh(self, _obj):
        return None


def _seed_user(email: str, role: str = "user") -> User:
    return User(
        id=uuid.uuid4(),
        email=email,
        hashed_password="hashed",
        is_active=False,
        is_superuser=False,
        is_verified=False,
        role=role,
        mfa_enabled=False,
        mfa_secret=None,
    )


def test_bootstrap_role_by_email_accepts_internal_token():
    fake_db = _FakeUserDB()
    fake_db.users.append(_seed_user("staging.e2e@example.com", role="user"))

    async def _override_db():
        return fake_db

    app.dependency_overrides[get_db] = _override_db
    try:
        client = TestClient(app)
        response = client.post(
            "/v1/admin/users/bootstrap-role-by-email",
            headers={"X-Internal-Token": settings.internal_token},
            json={"email": "staging.e2e@example.com", "role": "power", "is_active": True, "is_verified": True},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["role"] == "power"
        assert payload["is_active"] is True
        assert payload["is_verified"] is True
    finally:
        app.dependency_overrides.clear()


def test_bootstrap_role_by_email_forbidden_without_internal_or_admin():
    fake_db = _FakeUserDB()
    fake_db.users.append(_seed_user("staging.e2e@example.com", role="user"))

    async def _override_db():
        return fake_db

    app.dependency_overrides[get_db] = _override_db
    try:
        client = TestClient(app)
        response = client.post(
            "/v1/admin/users/bootstrap-role-by-email",
            json={"email": "staging.e2e@example.com", "role": "power"},
        )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()
