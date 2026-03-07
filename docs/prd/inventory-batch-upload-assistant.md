# Inventory Batch Upload Assistant

## Problem Statement
Adding a home-bar inventory one ingredient at a time is too slow for first-time setup and restocks. Users need a fast way to upload a plain ingredient list or CSV and have BartenderAI fill in the missing ontology and inventory details before import.

## Target Users
- New users onboarding a bar inventory from a spreadsheet, notes app, or exported shopping list.
- Existing users bulk-importing a restock list after a shopping run.

## User Stories
- As a user, I can upload a CSV/TSV/TXT file or paste one ingredient per line.
- As a mobile user, I can either paste a list on-device or pick a local text/CSV file and preview/import it without switching to desktop.
- As a user, I can preview what BartenderAI resolved before import.
- As a user, I can reuse existing ingredients/items instead of creating duplicates.
- As a user, I can import quantity-bearing rows as lots and quantity-free rows as base inventory items.
- As an admin, I can review imported ontology entries that were newly created, partial, or low-confidence.

## Acceptance Criteria
- The web inventory overview includes an AI batch upload entry point.
- The mobile inventory screen includes both paste-first and native file-picker AI batch upload flows.
- The backend accepts a filename + raw file contents and supports preview plus import endpoints.
- Plain-text uploads treat each non-empty line as one ingredient.
- Headered CSV/TSV uploads support at least: `name`, `canonical_name`, `display_name`, `category`, `subcategory`, `description`, `abv`, `is_alcoholic`, `is_perishable`, `unit`, `preferred_unit`, `quantity`, `lot_unit`, `location`.
- Missing fields are filled from TheCocktailDB first, then OpenAI web search if still incomplete.
- Existing inventory items are reused when the upload clearly matches one already tracked.
- Importing does not create duplicate items when the uploaded row matches an existing tracked item and no new lot is requested.
- Quantity-bearing rows create lots; quantity-free rows create or reuse the inventory item only.
- Preview and import responses include row-by-row status, notes, and source references.
- Preview and import responses include lookup telemetry (cache hits, provider requests, token totals).
- Imports write audit/moderation rows for ontology-impacting entries so admins can approve or reject them later.

## UX Flow Outline
1. User opens `Inventory -> Overview` on web or mobile.
2. User uploads a file (web) or pastes ingredient text (web/mobile).
3. User requests a preview.
4. UI shows row statuses: `ready`, `partial`, `duplicate`, or `skipped`.
5. User imports the previewed rows.
6. Inventory overview refreshes and surfaces imported items/lots.
7. Any new or uncertain ontology rows appear in `Admin -> Inventory Audit`.

### States
- Loading: preview/import in progress.
- Empty: no file selected and no pasted content yet.
- Error: invalid file shape, oversized batch, or network error.
- Success: import summary with created/reused counts.
- Success: import summary includes pending-review count and lookup telemetry.
- Disabled/offline: upload actions disabled when inventory writes are unavailable.

## Data / API Changes
- New endpoints:
  - `POST /v1/inventory/batch-upload/preview`
  - `POST /v1/inventory/batch-upload/import`
  - `GET /v1/admin/inventory-batch-audits`
  - `PATCH /v1/admin/inventory-batch-audits/{audit_id}/review`
- New database table:
  - `inventory_batch_upload_audits`
- Import writes affect `ingredients`, `ingredient_aliases`, `inventory_items`, `inventory_lots`, and `inventory_batch_upload_audits`.

## Security / Privacy Considerations
- The upload stays server-side as raw text and is not written directly to the database until the import endpoint is called.
- OpenAI web lookups are `store=false` and use a hashed safety identifier.
- AI output is parsed as JSON and validated before use.
- Existing ingredients are only backfilled for empty fields or false-to-true safety flags.

## Metrics / Telemetry
- Preview count
- Import count
- Rows imported per batch
- Duplicate reuse rate
- Partial-row rate
- Online lookup fallback rate
- Lookup cache hit/miss rate
- OpenAI token usage for enrichment
- Pending-review queue size / approval throughput

## Rollout Plan
1. Ship backend preview/import endpoints, web/mobile inventory UI, and admin audit queue.
2. Apply migration `0020_add_inventory_batch_upload_audits`.
3. Validate with unit, contract, integration, mobile E2E, and web lint/build checks.
4. Monitor lookup latency, cache effectiveness, and review-queue volume; adjust row limits if needed.
