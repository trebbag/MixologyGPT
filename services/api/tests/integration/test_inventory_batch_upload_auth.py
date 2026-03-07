import uuid

from fastapi.testclient import TestClient

from app.core.deps import current_active_user
from app.db.models.user import User
from app.db.session import get_db
from app.main import app


class _FakeDB:
    async def execute(self, _statement):
        return None


async def _override_db():
    return _FakeDB()


async def _override_user() -> User:
    return User(
        id=uuid.uuid4(),
        email='inventory@example.com',
        hashed_password='hashed',
        is_active=True,
        is_superuser=False,
        is_verified=True,
        role='user',
        mfa_enabled=False,
        mfa_secret=None,
    )


async def _fake_preview(_db, _user, filename: str, content: str):
    return {
        'filename': filename,
        'applied': False,
        'summary': {
            'total_rows': 1,
            'ready_rows': 1,
            'partial_rows': 0,
            'duplicate_rows': 0,
            'importable_rows': 1,
            'skipped_rows': 0,
            'pending_review_rows': 1,
            'created_ingredients': 0,
            'reused_ingredients': 0,
            'created_items': 0,
            'reused_items': 0,
            'created_lots': 0,
        },
        'lookup_telemetry': {
            'cache_hits': 0,
            'cache_misses': 1,
            'cocktaildb_requests': 1,
            'cocktaildb_failures': 0,
            'openai_requests': 0,
            'openai_failures': 0,
            'openai_input_tokens': 0,
            'openai_output_tokens': 0,
            'openai_total_tokens': 0,
        },
        'rows': [
            {
                'row_number': 1,
                'source_name': 'Campari',
                'status': 'ready',
                'import_action': 'create_ingredient_and_item',
                'confidence': 0.9,
                'notes': [],
                'missing_fields': [],
                'source_refs': [],
                'resolved': {
                    'canonical_name': 'Campari',
                    'display_name': None,
                    'category': 'Modifier',
                    'subcategory': 'Amaro',
                    'description': 'Bitter red aperitif.',
                    'abv': 24.0,
                    'is_alcoholic': True,
                    'is_perishable': False,
                    'unit': 'oz',
                    'preferred_unit': 'oz',
                    'quantity': None,
                    'lot_unit': None,
                    'location': None,
                },
            }
        ],
    }


async def _fake_apply(_db, _user, filename: str, content: str):
    payload = await _fake_preview(_db, _user, filename, content)
    payload['applied'] = True
    payload['summary']['created_ingredients'] = 1
    payload['summary']['created_items'] = 1
    return payload


def test_inventory_batch_preview_accepts_authenticated_user(monkeypatch):
    from app.api.routes import inventory as inventory_route

    monkeypatch.setattr(inventory_route, 'preview_inventory_batch_upload', _fake_preview)
    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[current_active_user] = _override_user
    try:
        client = TestClient(app)
        response = client.post('/v1/inventory/batch-upload/preview', json={'filename': 'batch.txt', 'content': 'Campari'})
        assert response.status_code == 200
        payload = response.json()
        assert payload['rows'][0]['resolved']['canonical_name'] == 'Campari'
        assert payload['summary']['importable_rows'] == 1
    finally:
        app.dependency_overrides.clear()


def test_inventory_batch_import_accepts_authenticated_user(monkeypatch):
    from app.api.routes import inventory as inventory_route

    monkeypatch.setattr(inventory_route, 'apply_inventory_batch_upload', _fake_apply)
    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[current_active_user] = _override_user
    try:
        client = TestClient(app)
        response = client.post('/v1/inventory/batch-upload/import', json={'filename': 'batch.txt', 'content': 'Campari'})
        assert response.status_code == 200
        payload = response.json()
        assert payload['applied'] is True
        assert payload['summary']['created_ingredients'] == 1
        assert payload['summary']['created_items'] == 1
    finally:
        app.dependency_overrides.clear()
