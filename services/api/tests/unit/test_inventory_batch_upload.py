import uuid

from app.db.models.ingredient import Ingredient
from app.db.models.inventory import InventoryItem, InventoryLot
from app.db.models.inventory_batch_upload_audit import InventoryBatchUploadAudit
from app.db.models.user import User
from app.domain import inventory_batch_upload


class _FakeScalarResult:
    def __init__(self, values):
        self._values = list(values)

    def all(self):
        return list(self._values)

    def first(self):
        return self._values[0] if self._values else None


class _FakeExecuteResult:
    def __init__(self, values):
        self._values = list(values)

    def scalars(self):
        return _FakeScalarResult(self._values)

    def all(self):
        return list(self._values)


class _FakeApplyDB:
    def __init__(self):
        self.ingredients = {}
        self.items = {}
        self.lots = {}
        self.audits = {}
        self.added = []
        self.committed = False

    async def get(self, model, key):
        if model.__name__ == 'Ingredient':
            return self.ingredients.get(str(key))
        if model.__name__ == 'InventoryItem':
            return self.items.get(str(key))
        if model.__name__ == 'InventoryLot':
            return self.lots.get(str(key))
        if model.__name__ == 'InventoryBatchUploadAudit':
            return self.audits.get(str(key))
        return None

    def add(self, obj):
        self.added.append(obj)
        if isinstance(obj, Ingredient):
            self.ingredients[str(obj.id)] = obj
        elif isinstance(obj, InventoryItem):
            self.items[str(obj.id)] = obj
        elif isinstance(obj, InventoryLot):
            self.lots[str(obj.id)] = obj
        elif isinstance(obj, InventoryBatchUploadAudit):
            self.audits[str(obj.id)] = obj

    async def execute(self, statement):
        sql = str(statement).lower()
        if 'from expiry_rules' in sql:
            return _FakeExecuteResult([])
        return _FakeExecuteResult([])

    async def commit(self):
        self.committed = True



def _seed_user() -> User:
    return User(
        id=uuid.uuid4(),
        email='tester@example.com',
        hashed_password='hashed',
        is_active=True,
        is_superuser=False,
        is_verified=True,
        role='user',
        mfa_enabled=False,
        mfa_secret=None,
    )


async def _fake_preview(_db, _user, filename, content, **_kwargs):
    assert filename == 'batch.txt'
    assert 'Falernum' in content
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
                'source_name': 'Falernum',
                'status': 'ready',
                'import_action': 'create_ingredient_and_item',
                'confidence': 0.88,
                'notes': [],
                'missing_fields': [],
                'source_refs': [{'label': 'TheCocktailDB ingredient reference', 'url': 'https://www.thecocktaildb.com/api.php'}],
                'resolved': {
                    'canonical_name': 'Falernum',
                    'display_name': None,
                    'category': 'Syrup',
                    'subcategory': 'Spiced syrup',
                    'description': 'A lime and spice syrup used in tiki drinks.',
                    'abv': 11.0,
                    'is_alcoholic': True,
                    'is_perishable': False,
                    'unit': 'oz',
                    'preferred_unit': 'oz',
                    'quantity': 8.0,
                    'lot_unit': 'oz',
                    'location': 'Fridge',
                },
            }
        ],
    }


async def _fake_cocktaildb_lookup(name, telemetry):
    telemetry.cocktaildb_requests += 1
    return (
        {
            'category': 'Modifier',
            'subcategory': 'Amaro',
            'description': 'Bitter aperitif.',
            'abv': 24.0,
            'is_alcoholic': True,
            'is_perishable': False,
            'unit': 'oz',
            'preferred_unit': 'oz',
            'confidence': 0.8,
        },
        [],
        [],
    )


async def _unexpected_web_lookup(*_args, **_kwargs):
    raise AssertionError('Web lookup should not be called when CocktailDB data is complete.')


async def _unexpected_cocktaildb_lookup(*_args, **_kwargs):
    raise AssertionError('Cached enrichment should prevent a second provider lookup.')



def test_parse_batch_upload_supports_plain_text_lists():
    rows = inventory_batch_upload.parse_batch_upload('ingredients.txt', 'London Dry Gin\nCampari\nFresh Lime Juice\n')

    assert [row.source_name for row in rows] == ['London Dry Gin', 'Campari', 'Fresh Lime Juice']
    assert rows[0].row_number == 1


def test_parse_batch_upload_supports_csv_with_optional_fields():
    rows = inventory_batch_upload.parse_batch_upload(
        'ingredients.csv',
        'name,category,unit,quantity\nFalernum,Syrup,oz,8\nAngostura Bitters,Bitters,dash,12\n',
    )

    assert len(rows) == 2
    assert rows[0].category == 'Syrup'
    assert rows[0].unit == 'oz'
    assert rows[0].quantity == 8.0
    assert rows[1].unit == 'dash'


def test_build_row_result_marks_existing_inventory_duplicates_and_infers_missing_fields():
    ingredient = Ingredient(
        id=uuid.uuid4(),
        canonical_name='Campari',
        category='Modifier',
        subcategory='Amaro',
        description='A bitter red aperitif.',
        abv=24.0,
        is_alcoholic=True,
        is_perishable=False,
    )
    item = InventoryItem(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        ingredient_id=ingredient.id,
        display_name=None,
        unit='oz',
        preferred_unit='oz',
        unit_to_ml=None,
    )
    row = inventory_batch_upload.BatchUploadRow(row_number=3, source_name='Campari')

    result = inventory_batch_upload._build_row_result(
        row,
        existing_ingredient=ingredient,
        existing_items=[item],
        cocktaildb_values={},
        cocktaildb_refs=[],
        cocktaildb_notes=[],
        web_values={},
        web_refs=[],
        web_notes=[],
    )

    assert result.status == 'duplicate'
    assert result.import_action == 'reuse_item'
    assert result.unit == 'oz'
    assert result.category == 'Modifier'
    assert result.is_alcoholic is True


def test_enrich_row_uses_cached_lookup_results(monkeypatch):
    row = inventory_batch_upload.BatchUploadRow(row_number=1, source_name='Campari')
    telemetry = inventory_batch_upload.BatchUploadLookupTelemetry()
    inventory_batch_upload._enrichment_cache.clear()
    monkeypatch.setattr(inventory_batch_upload, '_lookup_cocktaildb_ingredient', _fake_cocktaildb_lookup)
    monkeypatch.setattr(inventory_batch_upload, '_lookup_openai_web_details', _unexpected_web_lookup)

    async def _run():
        first_result = await inventory_batch_upload._enrich_row(
            row,
            existing_ingredient=None,
            existing_items=[],
            safety_identifier='safety-id',
            semaphore=inventory_batch_upload.asyncio.Semaphore(1),
            telemetry=telemetry,
        )
        monkeypatch.setattr(inventory_batch_upload, '_lookup_cocktaildb_ingredient', _unexpected_cocktaildb_lookup)
        second_result = await inventory_batch_upload._enrich_row(
            row,
            existing_ingredient=None,
            existing_items=[],
            safety_identifier='safety-id',
            semaphore=inventory_batch_upload.asyncio.Semaphore(1),
            telemetry=telemetry,
        )
        return first_result, second_result

    first, second = inventory_batch_upload.asyncio.run(_run())

    assert first.canonical_name == 'Campari'
    assert second.canonical_name == 'Campari'
    assert telemetry.cache_hits == 1
    assert telemetry.cache_misses == 1
    assert telemetry.cocktaildb_requests == 1


def test_apply_inventory_batch_upload_creates_inventory_records_and_audit(monkeypatch):
    fake_db = _FakeApplyDB()
    user = _seed_user()
    monkeypatch.setattr(inventory_batch_upload, 'preview_inventory_batch_upload', _fake_preview)

    result = inventory_batch_upload.asyncio.run(
        inventory_batch_upload.apply_inventory_batch_upload(fake_db, user, 'batch.txt', 'Falernum')
    )

    assert result['applied'] is True
    assert result['summary']['created_ingredients'] == 1
    assert result['summary']['created_items'] == 1
    assert result['summary']['created_lots'] == 1
    assert result['summary']['pending_review_rows'] == 1
    assert fake_db.committed is True
    assert len(fake_db.ingredients) == 1
    assert len(fake_db.items) == 1
    assert len(fake_db.lots) == 1
    assert len(fake_db.audits) == 1
    audit = next(iter(fake_db.audits.values()))
    assert audit.review_status == 'pending'
    assert audit.user_email == user.email
    assert audit.canonical_name == 'Falernum'
