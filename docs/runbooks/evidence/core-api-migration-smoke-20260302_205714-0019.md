# Core API Migration Smoke (20260302_205714)

- Scope: validate migration head after adding studio/search performance indexes.
- Database: ephemeral local Postgres (`pgvector/pgvector:pg16`) on `localhost:55433`.
- Command: `PYTHONPATH=. alembic upgrade head`

## Result
- `alembic_head=0019_add_studio_perf_indexes`
- Expected indexes present:
  - `ix_studio_versions_session_version`
  - `ix_studio_constraints_session_created_at`
  - `ix_recipes_canonical_name_lower`

## Status
- PASS
