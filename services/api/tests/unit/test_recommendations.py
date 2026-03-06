import asyncio
import uuid

from app.api.routes import recommendations as recommendations_route
from app.db.models.review import RecipeModeration, Review, ReviewSignal
from app.db.models.user import User


class _FakeScalarResult:
    def __init__(self, values):
        self._values = list(values)

    def all(self):
        return list(self._values)


class _FakeExecuteResult:
    def __init__(self, *, rows=None, scalars=None):
        self._rows = list(rows or [])
        self._scalars = list(scalars or [])

    def all(self):
        return list(self._rows)

    def scalars(self):
        return _FakeScalarResult(self._scalars)


class _MaterializeDB:
    def __init__(self):
        self.calls: list[str] = []
        self.recipe_one_id = uuid.uuid4()
        self.recipe_two_id = uuid.uuid4()

    async def execute(self, statement):
        sql = str(statement).lower()
        self.calls.append(sql)
        if "from recipe_ingredients" in sql:
            return _FakeExecuteResult(
                rows=[
                    (self.recipe_one_id, "Gin", 2.0, "oz"),
                    (self.recipe_one_id, "Campari", 1.0, "oz"),
                    (self.recipe_two_id, "Rum", 2.0, "oz"),
                ]
            )
        if "from recipe_moderations" in sql:
            return _FakeExecuteResult(
                scalars=[
                    RecipeModeration(
                        recipe_id=self.recipe_two_id,
                        reviewer_id=uuid.uuid4(),
                        status="approved",
                        overrides={"canonical_name": "House Daiquiri"},
                    )
                ]
            )
        raise AssertionError(f"Unexpected query: {sql}")


class _SubstitutionDB:
    async def execute(self, statement):
        sql = str(statement).lower()
        if "from ingredient_equivalencies" in sql:
            return _FakeExecuteResult(rows=[(1.0, "swap freely", "Campari", "Aperol")])
        if "from review_signals" in sql:
            return _FakeExecuteResult(
                rows=[
                    (
                        ReviewSignal(review_id=uuid.uuid4(), signal_type="swap", value="Lime -> Lemon"),
                        Review(user_id=uuid.uuid4(), recipe_id=uuid.uuid4(), rating=5),
                    )
                ]
            )
        raise AssertionError(f"Unexpected query: {sql}")


class _RouteDB:
    async def execute(self, statement):
        sql = str(statement).lower()
        if "from recipes" in sql:
            return _FakeExecuteResult(rows=[(uuid.uuid4(), "Recipe One"), (uuid.uuid4(), "Recipe Two")])
        raise AssertionError(f"Unexpected query: {sql}")


def _user() -> User:
    return User(
        id=uuid.uuid4(),
        email="tester@example.com",
        hashed_password="hashed",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        role="user",
    )


def test_materialize_recipe_payloads_batches_recipe_ingredient_lookup_and_applies_overrides():
    fake_db = _MaterializeDB()
    payloads = asyncio.run(
        recommendations_route._materialize_recipe_payloads(
            fake_db,
            [
                (fake_db.recipe_one_id, "Negroni"),
                (fake_db.recipe_two_id, "Daiquiri"),
            ],
        )
    )

    assert len(payloads) == 2
    assert payloads[0]["ingredients"][0]["name"] == "Gin"
    assert payloads[1]["name"] == "House Daiquiri"
    assert sum("from recipe_ingredients" in call for call in fake_db.calls) == 1


def test_build_substitution_map_uses_batched_name_lookup_and_review_signals():
    substitutions = asyncio.run(recommendations_route._build_substitution_map(_SubstitutionDB(), _user()))

    assert substitutions["campari"][0]["name"] == "Aperol"
    assert substitutions["lime"][0]["name"] == "Lemon"


def test_missing_one_preserves_payload_shape_and_substitutions(monkeypatch):
    async def _fake_inventory(_db, _user):
        return ["Gin", "Campari"], {"gin": 60.0, "campari": 30.0}

    async def _fake_substitutions(_db, _user):
        return {"Sweet Vermouth".lower(): [{"name": "Punt e Mes", "ratio": 1.0, "notes": "Close match"}]}

    async def _fake_materialize(_db, _rows):
        return [
            {
                "id": "recipe-1",
                "name": "Negroni",
                "ingredients": [
                    {"name": "Gin", "quantity": 1.0, "unit": "oz"},
                    {"name": "Campari", "quantity": 1.0, "unit": "oz"},
                    {"name": "Sweet Vermouth", "quantity": 1.0, "unit": "oz"},
                ],
            }
        ]

    monkeypatch.setattr(recommendations_route, "_inventory_availability", _fake_inventory)
    monkeypatch.setattr(recommendations_route, "_build_substitution_map", _fake_substitutions)
    monkeypatch.setattr(recommendations_route, "_materialize_recipe_payloads", _fake_materialize)

    payload = asyncio.run(recommendations_route.missing_one(db=_RouteDB(), user=_user()))

    assert payload[0]["id"] == "recipe-1"
    assert payload[0]["missing"][0]["name"] == "Sweet Vermouth"
    assert payload[0]["missing"][0]["substitutions"][0]["name"] == "Punt e Mes"


def test_unlock_score_preserves_response_shape(monkeypatch):
    async def _fake_inventory(_db, _user):
        return ["Gin"], {"gin": 120.0}

    async def _fake_review_weights(_db, _user):
        return {"sweet vermouth": 1.5}

    async def _fake_usage_weights(_db, _user):
        return {"campari": 0.2}

    async def _fake_materialize(_db, _rows):
        return [
            {
                "id": "recipe-1",
                "name": "Gin Martini",
                "ingredients": [{"name": "Gin", "quantity": 2.0, "unit": "oz"}],
            },
            {
                "id": "recipe-2",
                "name": "Negroni",
                "ingredients": [
                    {"name": "Gin", "quantity": 1.0, "unit": "oz"},
                    {"name": "Sweet Vermouth", "quantity": 1.0, "unit": "oz"},
                ],
            },
        ]

    monkeypatch.setattr(recommendations_route, "_inventory_availability", _fake_inventory)
    monkeypatch.setattr(recommendations_route, "_review_signal_weights", _fake_review_weights)
    monkeypatch.setattr(recommendations_route, "_usage_weights", _fake_usage_weights)
    monkeypatch.setattr(recommendations_route, "_materialize_recipe_payloads", _fake_materialize)

    payload = asyncio.run(recommendations_route.unlock_score(db=_RouteDB(), user=_user()))

    assert payload.unlock_score == 1.0
    assert payload.make_now_count == 1
    assert payload.missing_one_count == 1
    assert payload.total_recipes == 2
    assert payload.suggestions[0].ingredient == "Sweet Vermouth"
