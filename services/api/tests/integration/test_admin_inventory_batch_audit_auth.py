import uuid
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.models.inventory_batch_upload_audit import InventoryBatchUploadAudit
from app.db.session import get_db
from app.main import app


class _FakeScalarResult:
    def __init__(self, values):
        self._values = list(values)

    def all(self):
        return list(self._values)


class _FakeExecuteResult:
    def __init__(self, values):
        self._values = list(values)

    def scalars(self):
        return _FakeScalarResult(self._values)


class _FakeAuditDB:
    def __init__(self):
        self.rows: list[InventoryBatchUploadAudit] = []

    async def execute(self, statement):
        sql = str(statement).lower()
        rows = list(self.rows)
        if "where inventory_batch_upload_audits.review_status =" in sql:
            if "'pending'" in sql:
                rows = [row for row in rows if row.review_status == "pending"]
            elif "'approved'" in sql:
                rows = [row for row in rows if row.review_status == "approved"]
            elif "'rejected'" in sql:
                rows = [row for row in rows if row.review_status == "rejected"]
        rows.sort(key=lambda row: row.created_at, reverse=True)
        return _FakeExecuteResult(rows)

    async def get(self, model, key):
        if model.__name__ != "InventoryBatchUploadAudit":
            return None
        for row in self.rows:
            if str(row.id) == str(key):
                return row
        return None

    async def commit(self):
        return None

    async def refresh(self, _obj):
        return None


def _seed_audit(review_status: str = "pending") -> InventoryBatchUploadAudit:
    return InventoryBatchUploadAudit(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        user_email="inventory@example.com",
        ingredient_id=uuid.uuid4(),
        inventory_item_id=uuid.uuid4(),
        inventory_lot_id=None,
        reviewed_by_user_id=None,
        reviewed_at=None,
        filename="batch.txt",
        source_name="Campari",
        canonical_name="Campari",
        row_status="ready",
        import_action="create_ingredient_and_item",
        import_result="created_ingredient, created_item",
        review_status=review_status,
        review_notes=None,
        confidence=0.74,
        missing_fields=[],
        notes=["AI lookup filled missing category."],
        source_refs=[{"label": "TheCocktailDB", "url": "https://www.thecocktaildb.com/api.php"}],
        resolved_payload={
            "canonical_name": "Campari",
            "display_name": None,
            "category": "Modifier",
            "subcategory": "Amaro",
            "description": "Bitter red aperitif.",
            "abv": 24.0,
            "is_alcoholic": True,
            "is_perishable": False,
            "unit": "oz",
            "preferred_unit": "oz",
            "quantity": None,
            "lot_unit": None,
            "location": None,
        },
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


def test_admin_inventory_batch_audits_list_accepts_internal_token():
    fake_db = _FakeAuditDB()
    fake_db.rows.append(_seed_audit())

    async def _override_db():
        return fake_db

    app.dependency_overrides[get_db] = _override_db
    try:
        client = TestClient(app)
        response = client.get(
            "/v1/admin/inventory-batch-audits?review_status=pending",
            headers={"X-Internal-Token": settings.internal_token},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["counts"]["pending"] == 1
        assert payload["rows"][0]["canonical_name"] == "Campari"
        assert payload["rows"][0]["resolved"]["category"] == "Modifier"
    finally:
        app.dependency_overrides.clear()


def test_admin_inventory_batch_audit_review_accepts_internal_token():
    fake_db = _FakeAuditDB()
    audit = _seed_audit()
    fake_db.rows.append(audit)

    async def _override_db():
        return fake_db

    app.dependency_overrides[get_db] = _override_db
    try:
        client = TestClient(app)
        response = client.patch(
            f"/v1/admin/inventory-batch-audits/{audit.id}/review",
            headers={"X-Internal-Token": settings.internal_token},
            json={"review_status": "approved", "review_notes": "Canonical metadata looks correct."},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["review_status"] == "approved"
        assert payload["review_notes"] == "Canonical metadata looks correct."
    finally:
        app.dependency_overrides.clear()


def test_admin_inventory_batch_audits_without_auth_is_forbidden():
    fake_db = _FakeAuditDB()

    async def _override_db():
        return fake_db

    app.dependency_overrides[get_db] = _override_db
    try:
        client = TestClient(app)
        response = client.get("/v1/admin/inventory-batch-audits")
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()
