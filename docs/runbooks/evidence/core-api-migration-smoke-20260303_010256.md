# Core API Migration Smoke (Clean DB)

- Run timestamp (UTC): `2026-03-03 01:02:56`
- Runner: local CLI
- Database: ephemeral Docker Postgres `pgvector/pgvector:pg16` on `localhost:55432`
- Command context: `/Users/gregorygabbert/Documents/GitHub/BartenderAI/services/api`

## Commands

```bash
docker run -d --name bartenderai_migration_smoke_pg \
  -e POSTGRES_USER=bartender \
  -e POSTGRES_PASSWORD=bartender \
  -e POSTGRES_DB=bartenderai \
  -p 55432:5432 pgvector/pgvector:pg16

DATABASE_URL=postgresql+asyncpg://bartender:bartender@localhost:55432/bartenderai \
PYTHONPATH=. alembic upgrade head
```

## Results

- `alembic_rows=1`
- `alembic_head=0018_update_punch_seed_urls`
- `public_tables=42`

## Verdict

- Status: `PASS`
- Clean database migration smoke completed with a single Alembic head row.
