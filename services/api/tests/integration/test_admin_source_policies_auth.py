import uuid

from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.models.recipe import RecipeSourcePolicy
from app.db.session import get_db
from app.main import app


class _FakeScalarResult:
    def __init__(self, values):
        self._values = values

    def all(self):
        return list(self._values)


class _FakeExecuteResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return _FakeScalarResult(self._values)


class _FakePolicyDB:
    def __init__(self):
        self.policies: list[RecipeSourcePolicy] = []

    async def execute(self, statement):
        sql = str(statement).lower()
        if "from recipe_source_policies" in sql:
            ordered = sorted(self.policies, key=lambda policy: policy.name)
            return _FakeExecuteResult(ordered)
        return _FakeExecuteResult([])

    def add(self, obj):
        if isinstance(obj, RecipeSourcePolicy):
            if not obj.id:
                obj.id = uuid.uuid4()
            self.policies.append(obj)

    async def commit(self):
        return None

    async def refresh(self, _obj):
        return None


def test_admin_source_policies_list_accepts_internal_token():
    fake_db = _FakePolicyDB()
    fake_db.policies.append(
        RecipeSourcePolicy(
            id=uuid.uuid4(),
            name="TheCocktailDB",
            domain="thecocktaildb.com",
            metric_type="pervasiveness",
            min_rating_count=0,
            min_rating_value=0.0,
            review_policy="manual",
            is_active=True,
            seed_urls=["https://www.thecocktaildb.com/"],
            crawl_depth=2,
            max_pages=40,
            max_recipes=20,
            crawl_interval_minutes=240,
            respect_robots=True,
            parser_settings={"source_provider": "cocktaildb_api"},
            alert_settings={},
        )
    )

    async def _override_db():
        return fake_db

    app.dependency_overrides[get_db] = _override_db
    try:
        client = TestClient(app)
        response = client.get(
            "/v1/admin/source-policies",
            headers={"X-Internal-Token": settings.internal_token},
        )
        assert response.status_code == 200
        payload = response.json()
        assert len(payload) == 1
        assert payload[0]["domain"] == "thecocktaildb.com"
    finally:
        app.dependency_overrides.clear()


def test_admin_source_policies_list_without_internal_token_or_admin_is_forbidden():
    fake_db = _FakePolicyDB()

    async def _override_db():
        return fake_db

    app.dependency_overrides[get_db] = _override_db
    try:
        client = TestClient(app)
        response = client.get("/v1/admin/source-policies")
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_admin_source_policies_create_accepts_internal_token():
    fake_db = _FakePolicyDB()

    async def _override_db():
        return fake_db

    app.dependency_overrides[get_db] = _override_db
    try:
        client = TestClient(app)
        response = client.post(
            "/v1/admin/source-policies",
            headers={"X-Internal-Token": settings.internal_token},
            json={
                "name": "TheCocktailDB",
                "domain": "thecocktaildb.com",
                "metric_type": "pervasiveness",
                "min_rating_count": 0,
                "min_rating_value": 0,
                "review_policy": "manual",
                "is_active": True,
                "seed_urls": ["https://www.thecocktaildb.com/"],
                "crawl_depth": 2,
                "max_pages": 40,
                "max_recipes": 20,
                "crawl_interval_minutes": 240,
                "respect_robots": True,
                "parser_settings": {"source_provider": "cocktaildb_api"},
                "alert_settings": {},
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["domain"] == "thecocktaildb.com"
        assert payload["parser_settings"]["source_provider"] == "cocktaildb_api"
    finally:
        app.dependency_overrides.clear()
