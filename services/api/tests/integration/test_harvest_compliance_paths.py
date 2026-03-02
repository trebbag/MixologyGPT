import uuid

import pytest
from fastapi.testclient import TestClient

from app.api.routes import recipes as recipes_route
from app.core.config import settings
from app.db.models.recipe import RecipeHarvestJob
from app.db.models.user import User
from app.domain.harvester import DEFAULT_POLICIES, SourcePolicy
from app.domain.harvester_pipeline import CrawlResult, ParsedRecipe
from app.main import app
from app.db.session import get_db


class _FakeDB:
    def __init__(self, job: RecipeHarvestJob):
        self.job = job

    async def get(self, _model, job_id):
        if str(self.job.id) == str(job_id):
            return self.job
        return None

    async def commit(self):
        return None

    async def refresh(self, _obj):
        return None


class _FakeScalarResult:
    def __init__(self, values):
        self._values = values

    def first(self):
        return self._values[0] if self._values else None

    def all(self):
        return self._values


class _FakeExecuteResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return _FakeScalarResult(self._values)


class _FakeAutoHarvestDB:
    def __init__(self):
        self.admin_user = User(
            id=uuid.uuid4(),
            email="admin@example.com",
            hashed_password="not-used",
            is_active=True,
            is_superuser=True,
            is_verified=True,
            role="admin",
        )
        self.jobs: list[RecipeHarvestJob] = []

    async def get(self, _model, job_id):
        for job in self.jobs:
            if str(job.id) == str(job_id):
                return job
        return None

    def add(self, obj):
        if isinstance(obj, RecipeHarvestJob):
            self.jobs.append(obj)

    async def flush(self):
        for job in self.jobs:
            if not job.id:
                job.id = uuid.uuid4()

    async def execute(self, statement):
        sql = str(statement).lower()
        if "from users" in sql:
            return _FakeExecuteResult([self.admin_user])
        if "from recipe_sources" in sql:
            return _FakeExecuteResult([])
        if "from recipe_harvest_jobs" in sql:
            return _FakeExecuteResult([])
        return _FakeExecuteResult([])

    async def commit(self):
        return None

    async def refresh(self, _obj):
        return None


def _build_policy(domain: str) -> SourcePolicy:
    return SourcePolicy(
        name=domain,
        domain=domain,
        metric_type="ratings",
        min_rating_count=0,
        min_rating_value=0.0,
        review_policy="manual",
        is_active=True,
        parser_settings={},
        alert_settings={},
    )


@pytest.mark.parametrize("domain", [policy.domain for policy in DEFAULT_POLICIES])
def test_run_harvest_job_compliance_rejection_for_approved_domains(monkeypatch: pytest.MonkeyPatch, domain: str):
    job = RecipeHarvestJob(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        source_url=f"https://www.{domain}/privacy-policy",
        source_type="web",
        raw_text="",
        status="pending",
        attempt_count=0,
    )
    fake_db = _FakeDB(job)

    async def _override_db():
        return fake_db

    async def _fake_load_policies(_db, include_inactive: bool):
        return [_build_policy(domain)]

    async def _fake_fetch_html(_url, client=None):
        return """
        <html>
          <head>
            <title>Privacy Policy</title>
            <meta name="robots" content="noindex,nofollow" />
          </head>
          <body>Not a recipe page.</body>
        </html>
        """

    app.dependency_overrides[get_db] = _override_db
    monkeypatch.setattr(recipes_route, "_load_source_policies", _fake_load_policies)
    monkeypatch.setattr(recipes_route, "fetch_html", _fake_fetch_html)

    try:
        client = TestClient(app)
        response = client.post(
            f"/v1/recipes/harvest/jobs/{job.id}/run",
            headers={"X-Internal-Token": settings.internal_token},
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "failed"
        assert "robots-meta-blocked" in (payload.get("compliance_reasons") or [])
        assert "non-recipe-page" in (payload.get("compliance_reasons") or [])
        assert payload.get("next_retry_at") is not None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("domain", [policy.domain for policy in DEFAULT_POLICIES])
def test_run_harvest_job_rejects_canonical_mismatch_and_paywall(
    monkeypatch: pytest.MonkeyPatch, domain: str
):
    job = RecipeHarvestJob(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        source_url=f"https://www.{domain}/recipes/member-only",
        source_type="web",
        raw_text="",
        status="pending",
        attempt_count=0,
    )
    fake_db = _FakeDB(job)

    async def _override_db():
        return fake_db

    async def _fake_load_policies(_db, include_inactive: bool):
        return [_build_policy(domain)]

    async def _fake_fetch_html(_url, client=None):
        return f"""
        <html>
          <head>
            <title>Exclusive Cocktail Recipe</title>
            <link rel=\"canonical\" href=\"https://content-gate.invalid/member-only\" />
          </head>
          <body>
            <h1>Members-only drink</h1>
            <p>Subscribe to continue reading this recipe.</p>
          </body>
        </html>
        """

    app.dependency_overrides[get_db] = _override_db
    monkeypatch.setattr(recipes_route, "_load_source_policies", _fake_load_policies)
    monkeypatch.setattr(recipes_route, "fetch_html", _fake_fetch_html)

    try:
        client = TestClient(app)
        response = client.post(
            f"/v1/recipes/harvest/jobs/{job.id}/run",
            headers={"X-Internal-Token": settings.internal_token},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "failed"
        reasons = payload.get("compliance_reasons") or []
        assert "canonical-host-mismatch" in reasons
        assert "paywall-detected" in reasons
        assert payload.get("next_retry_at") is not None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("domain", [policy.domain for policy in DEFAULT_POLICIES])
def test_run_harvest_job_tracks_instruction_structure_parse_failure(
    monkeypatch: pytest.MonkeyPatch, domain: str
):
    job = RecipeHarvestJob(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        source_url=f"https://www.{domain}/recipes/mismatch",
        source_type="web",
        raw_text="",
        status="pending",
        attempt_count=0,
    )
    fake_db = _FakeDB(job)

    async def _override_db():
        return fake_db

    async def _fake_load_policies(_db, include_inactive: bool):
        return [_build_policy(domain)]

    async def _fake_fetch_html(_url, client=None):
        return """
        <html>
          <head><title>Mismatch recipe</title></head>
          <body>
            <h1>Mismatch recipe</h1>
            <ul id="mntl-structured-ingredients_1-0">
              <li>2 oz gin</li>
              <li>1 oz lemon juice</li>
            </ul>
            <p>No directions section available.</p>
          </body>
        </html>
        """

    app.dependency_overrides[get_db] = _override_db
    monkeypatch.setattr(recipes_route, "_load_source_policies", _fake_load_policies)
    monkeypatch.setattr(recipes_route, "fetch_html", _fake_fetch_html)

    try:
        client = TestClient(app)
        response = client.post(
            f"/v1/recipes/harvest/jobs/{job.id}/run",
            headers={"X-Internal-Token": settings.internal_token},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "failed"
        parse_strategy = payload.get("parse_strategy")
        if parse_strategy:
            assert parse_strategy.startswith("parse_failed:")
        assert payload.get("next_retry_at") is not None
    finally:
        app.dependency_overrides.clear()


def test_run_harvest_job_recovers_from_selector_mismatch(monkeypatch: pytest.MonkeyPatch):
    domain = "allrecipes.com"
    job = RecipeHarvestJob(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        source_url=f"https://www.{domain}/recipe/123/recovery-candidate",
        source_type="web",
        raw_text="",
        status="pending",
        attempt_count=0,
    )
    fake_db = _FakeDB(job)

    async def _override_db():
        return fake_db

    async def _fake_load_policies(_db, include_inactive: bool):
        return [
            SourcePolicy(
                name=domain,
                domain=domain,
                metric_type="ratings",
                min_rating_count=0,
                min_rating_value=0.0,
                review_policy="manual",
                is_active=True,
                parser_settings={
                    "enable_jsonld": False,
                    "enable_domain_dom": False,
                    "enable_microdata": False,
                    "enable_dom_fallback": False,
                },
                alert_settings={},
            )
        ]

    async def _fake_fetch_html(_url, client=None):
        return """
        <html>
          <body>
            <h1>Recovery Candidate</h1>
            <h2>Ingredients</h2>
            <div class="ingredients">
              <ul>
                <li>2 oz gin</li>
                <li>1 oz lemon juice</li>
                <li>0.75 oz syrup</li>
              </ul>
            </div>
            <h2>Directions</h2>
            <div class="directions">
              <ol>
                <li>Shake with ice.</li>
                <li>Strain into a coupe.</li>
              </ol>
            </div>
          </body>
        </html>
        """

    class _FakeResult:
        status = "ok"
        recipe_id = uuid.uuid4()
        duplicate = False
        quality_score = 3.2

    async def _fake_perform_harvest_parsed(**kwargs):
        return _FakeResult()

    app.dependency_overrides[get_db] = _override_db
    monkeypatch.setattr(recipes_route, "_load_source_policies", _fake_load_policies)
    monkeypatch.setattr(recipes_route, "fetch_html", _fake_fetch_html)
    monkeypatch.setattr(recipes_route, "_perform_harvest_parsed", _fake_perform_harvest_parsed)

    try:
        client = TestClient(app)
        response = client.post(
            f"/v1/recipes/harvest/jobs/{job.id}/run",
            headers={"X-Internal-Token": settings.internal_token},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "succeeded"
        assert str(payload.get("parse_strategy") or "").startswith("recovery:")
    finally:
        app.dependency_overrides.clear()


def test_cocktaildb_auto_harvest_enqueues_job_and_run_succeeds(monkeypatch: pytest.MonkeyPatch):
    fake_db = _FakeAutoHarvestDB()
    captured_parse_strategies: list[str] = []

    async def _override_db():
        return fake_db

    async def _fake_load_policies(_db, include_inactive: bool):
        return [
            SourcePolicy(
                name="TheCocktailDB",
                domain="thecocktaildb.com",
                metric_type="pervasiveness",
                review_policy="manual",
                is_active=True,
                seed_urls=["https://www.thecocktaildb.com/"],
                parser_settings={
                    "source_provider": "cocktaildb_api",
                    "cocktaildb_filters": ["c=Cocktail", "c=Ordinary_Drink"],
                },
                alert_settings={},
            )
        ]

    async def _fake_crawl_source(*_args, **_kwargs):
        return CrawlResult(
            discovered_urls=["https://www.thecocktaildb.com/drink/11000"],
            parsed_recipes=[
                ParsedRecipe(
                    canonical_name="Mojito",
                    description="Classic mojito",
                    ingredients=[
                        {"name": "White Rum", "amount": 2.0, "unit": "oz"},
                        {"name": "Lime Juice", "amount": 1.0, "unit": "oz"},
                    ],
                    instructions=["Shake with ice.", "Strain and serve."],
                    author=None,
                    rating_value=None,
                    rating_count=None,
                    like_count=None,
                    share_count=None,
                    source_url="https://www.thecocktaildb.com/drink/11000",
                    tags=["Cocktail"],
                    parser_used="cocktaildb_api",
                    extraction_confidence=0.9,
                )
            ],
            parser_stats={"cocktaildb_api": 1},
            confidence_buckets={"high": 1},
            fallback_class_counts={},
            parse_failure_counts={},
            compliance_rejections=0,
            compliance_reason_counts={},
            errors=[],
        )

    class _FakeHarvestResult:
        status = "ok"
        recipe_id = uuid.uuid4()
        duplicate = False
        quality_score = 3.8

    async def _fake_perform_harvest(_payload, _db):
        return _FakeHarvestResult()

    def _capture_metrics(**kwargs):
        captured_parse_strategies.append(str(kwargs.get("parse_strategy") or ""))

    app.dependency_overrides[get_db] = _override_db
    monkeypatch.setattr(recipes_route, "_load_source_policies", _fake_load_policies)
    monkeypatch.setattr(recipes_route, "crawl_source", _fake_crawl_source)
    monkeypatch.setattr(recipes_route, "_perform_harvest", _fake_perform_harvest)
    monkeypatch.setattr(recipes_route, "record_harvest_job_metrics", _capture_metrics)

    try:
        client = TestClient(app)
        auto_response = client.post(
            "/v1/recipes/harvest/auto",
            headers={"X-Internal-Token": settings.internal_token},
            json={
                "source_url": "https://www.thecocktaildb.com/",
                "source_type": "web",
                "max_links": 10,
                "max_pages": 20,
                "max_recipes": 10,
                "crawl_depth": 2,
                "respect_robots": True,
                "enqueue": True,
            },
        )
        assert auto_response.status_code == 200
        auto_payload = auto_response.json()
        assert len(auto_payload["queued_job_ids"]) == 1

        job_id = auto_payload["queued_job_ids"][0]
        run_response = client.post(
            f"/v1/recipes/harvest/jobs/{job_id}/run",
            headers={"X-Internal-Token": settings.internal_token},
        )
        assert run_response.status_code == 200
        run_payload = run_response.json()
        assert run_payload["status"] == "succeeded"
        assert str(run_payload.get("parse_strategy") or "").startswith("cocktaildb_api@")
        assert any(strategy.startswith("cocktaildb_api@") for strategy in captured_parse_strategies)
    finally:
        app.dependency_overrides.clear()
