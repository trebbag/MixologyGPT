# BartenderAI API

FastAPI backend with PostgreSQL + pgvector.

## Local dev
```bash
python3 -m venv .venv && source .venv/bin/activate
python3 -m pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

## Auth Flow
- Login: `POST /v1/auth/jwt/login` with JSON `{ "email", "password", "mfa_token?" }`
- Refresh: `POST /v1/auth/jwt/refresh` with JSON `{ "refresh_token" }`
- Logout: `POST /v1/auth/jwt/logout` with JSON `{ "refresh_token" }`
- Session management: `GET /v1/auth/sessions`, `DELETE /v1/auth/sessions/{session_id}`

## Embeddings
- Default provider: OpenAI embeddings.
- To use hash-based embeddings (no external API), set:
  - `EMBEDDINGS_PROVIDER=hash`
  - `EMBEDDINGS_DIMENSIONS=1536`
- For OpenAI embeddings, set:
  - `EMBEDDINGS_PROVIDER=openai`
  - `EMBEDDINGS_MODEL=text-embedding-3-small`
  - `OPENAI_API_KEY=...`

## Rate limits
Tune per-endpoint limits with:
- `RATE_LIMIT_INGEST_PER_MINUTE`
- `RATE_LIMIT_HARVEST_PER_MINUTE`
- `RATE_LIMIT_AUTO_HARVEST_PER_MINUTE`
- `RATE_LIMIT_AGENT_*`

## Harvest retries
- `HARVEST_MAX_ATTEMPTS` (default 3)
- `HARVEST_RETRY_BASE_SECONDS` (default 300)
- `HARVEST_RETRY_MAX_SECONDS` (default 3600)
