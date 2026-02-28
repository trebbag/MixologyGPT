# AI Agents

This folder contains agent service clients:
- `inventory_steward`
- `recipe_harvester`
- `mixology_creator`
- `balance_engine`

Each client:
1. Validates input payloads with shared JSON Schemas.
2. Calls the API orchestration endpoint under `/v1/agents/*`.
3. Validates the response against the corresponding output schema.

## Configuration
- `API_URL` (default: `http://localhost:8000`)
- `AUTH_TOKEN` (optional bearer token for agent calls)
