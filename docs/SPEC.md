Technical Specification
Home Bar Inventory + Verified Recipe Library + AI Mixology Creator Studio

Target implementation driver: Codex 5.3
Document version: 1.0
Last updated: 2026-02-06
Audience: Engineering (full‑stack), ML/AI engineering, product/UX, QA

0) Executive Summary

This system is a home bartending OS composed of:

A strict, canonical Inventory Brain that tracks all alcohol, mixers, ingredients, perishables, equipment, and glassware; issues restock/expiry reminders; supports ingredient equivalency and conversions; and includes Syrup Maker Mode with shelf-life tracking.

A Verified Recipe Library continuously refreshed by an AI Recipe Harvester Agent that scans the internet and social media, applies a multi-stage pipeline for extraction/normalization, deduplication, and quality validation, then stores recipes with visible provenance via credibility badges and short “why this works” blurbs. The library supports deep filters, ingredient-centric exploration, taste-alike suggestions, and a curated “Tonight’s Flight.”

A separate Mixology Creator Studio powered by a dedicated Mixology Creator Agent using:

full inventory context (via structured tool access to inventory + embeddings)

mixology books/science knowledge base (licensed + chunked)

proven recipe “templates” (sour/Negroni/old fashioned/Collins)

interactive constraint inputs (drag-and-drop ingredients, constraint sliders, flavor wheel)

recipe version control (v1/v2/v3 with diff and revert)

balance checker + “fix buttons” that create v2 automatically from user feedback

AI co-pilot high-signal questions (“crisp vs rich”, “bitterness subtle vs present”)

Guided Making Mode (timers + steps), plus glassware & ice recommendations.

Party features: menu builder + batching (shopping list, prep schedule, dilution calculations), inventory-aware “serve 8 people,” and cocktail draft picks.

A dedicated Inventory Steward Agent strictly manages the inventory database and continuously develops and refreshes embeddings (ingredient, role, flavor, user preference) to improve Studio retrieval/substitution and overall recommendations.

1) Goals and Non‑Goals
1.1 Goals (MUST)

Maintain a complete and accurate inventory of owned alcohol, mixers, ingredients, syrups, perishables, garnishes, tools, and glassware.

Provide restock reminders, expiry alerts, and “use-up-soon” suggestions.

Recommend new purchases optimized to enhance inventory and unlock new recipes (Unlock Score).

Continuously ingest and validate recipes from the internet/social media via an AI agent, while ensuring:

strong deduplication and variant clustering

quality control to avoid nonsense/awful recipes

validation based on source trust and/or reviews/social proof

Maintain a high-quality recipe database with:

credibility badges

“why this works” blurbs

deep filters

taste-alike and ingredient-centric navigation

“Tonight’s Flight”

Provide a separate Studio workflow for recipe creation with:

drag-and-drop ingredient constraints

build-from-template mode

constraint sliders

flavor wheel interface

co-pilot questions

recipe version control with diff & revert

balance checker + fix buttons that create v2

guided review process to improve future outputs

naming + photo + initial review saved and added to recipe database

Ensure the Mixology Creator always has full context of inventory and can reliably map constraints to available ingredients and substitutions using embeddings.

1.2 Non‑Goals (explicitly NOT required for v1 unless stated otherwise)

Alcohol delivery purchasing, payments, or retailer checkout.

Medical advice or intoxication monitoring beyond basic informational prompts.

Video recognition of recipes from video frames (text caption extraction only in v1 unless later added).

Full web scraping of sites that disallow it; ingestion must respect access methods and compliance constraints.

2) High-Level System Architecture
2.1 Components

Client Apps

Mobile app (iOS/Android) for consumers

Web app (optional) for richer Studio work and curator/admin console

Backend Services

API Gateway / App Backend (authentication, CRUD, orchestration)

Inventory Service (inventory items, lots, conversions, syrup maker)

Recipe Library Service (recipes, variants, tags, badges, filters)

Recommendation Service (make-now, missing-one, unlock, tonight’s flight)

Studio Service (sessions, constraints, generation orchestration, version control)

Review Service (guided review, balance feedback, learning signals)

Media Service (photos, recipe images)

Notification Service (restock/expiry/personalized reminders)

AI/Agent Services

Inventory Steward Agent Service (canonicalization + embeddings lifecycle)

Recipe Harvester Agent Service (scan → parse → normalize → dedup → quality score → store)

Mixology Creator Agent Service (RAG + templates + constraints + generation + validation)

Balance & Fix Engine (rule-based + learned heuristics)

Knowledge Base Service (licensed mixology books/science chunks + embeddings + citations)

Data Stores

PostgreSQL (core relational data)

Vector store (pgvector extension in Postgres OR separate Qdrant; spec supports either)

Object storage (S3-compatible) for photos

Redis (cache, rate limits, queues)

Queue/workflow system (Celery/RQ/Temporal/Sidekiq equivalent) for background jobs

2.2 Recommended Implementation Stack (Codex-friendly defaults)

Backend: Python + FastAPI

Workers: Python + Celery + Redis

DB: PostgreSQL + pgvector

Mobile: React Native (Expo) OR Flutter (choose one; spec below references React Native patterns)

Web: Next.js

Infra: Docker + Terraform + CI/CD (GitHub Actions)

If a different stack is chosen, all APIs and data model constraints in this spec remain binding.

3) Domain Model and Data Specifications
3.1 Canonical Ingredient Ontology

Ingredients MUST be represented with a canonical identity and classification:

Ingredient

ingredient_id (UUID)

canonical_name (string)

category (enum): SPIRIT, LIQUEUR, FORTIFIED_WINE, BITTERS, SYRUP, JUICE, SODA, PANTRY, HERB, FRUIT, DAIRY, EGG, SPICE, OTHER

subcategories (array of tags): e.g., GIN_LONDON_DRY, AMARO_BITTER, RUM_AGED

functional_roles (array enum):

BASE_SPIRIT

MODIFIER

SWEETENER

ACID

BITTERING_AGENT

AROMATIC

TEXTURE

LENGTHENER (soda, tonic, etc.)

GARNISH

flavor_tags (array of tags): CITRUS, HERBAL, SMOKY, TROPICAL, SPICY, FLORAL, BITTER, NUTTY, COCOA, etc.

abv (float nullable) for alcoholic ingredients

sugar_brix_estimate (float nullable) for syrups/juices (used in balance estimation)

acidity_estimate (float nullable) for acids/juices (citric/malic equivalents)

default_unit (enum): OZ, ML, G, DASH, DROP, TSP, TBSP, PIECE

aliases (array string)

substitution_group_id (UUID nullable) linking to equivalency group(s)

created_at, updated_at

IngredientSubstitutionGroup

group_id (UUID)

name (string) e.g., “Orange Liqueur”

description (string)

members (many-to-many with Ingredient)

substitution_rules (JSON) describing constraints (e.g., “curaçao tends sweeter than Cointreau; scale down sweetener”)

3.2 Inventory Model (Strict + Lot-based)

Inventory MUST support multiple bottles/lots per ingredient and track perishability.

InventoryItem (user-owned entry per ingredient/brand/variant)

inventory_item_id (UUID)

user_id

ingredient_id (canonical)

display_name (string) (e.g., “Campari”)

brand (string nullable)

variant_notes (string nullable) (“overproof”, “barrel-aged”)

abv_override (float nullable)

storage_location (enum): BAR, FRIDGE, FREEZER, PANTRY, OTHER

active (bool)

created_at, updated_at

InventoryLot (represents a specific bottle/batch; enables opened/sealed and depletion)

lot_id (UUID)

inventory_item_id

purchase_date (date nullable)

opened_date (date nullable)

container_size_ml (int nullable)

remaining_ml (int nullable) OR remaining_percent (float nullable) (support both; normalize internally)

sealed (bool)

expiration_date (date nullable)

shelf_life_days (int nullable, computed or user-set)

par_level_ml (int nullable)

low_threshold_ml (int nullable)

cost (decimal nullable)

notes

created_at, updated_at

PerishabilityRules (system-defined per category/subcategory)

rule_id (UUID)

applies_to_category/subcategory/tags

default_shelf_life_days_opened

default_shelf_life_days_unopened

requires_fridge (bool)

quality_decay_curve (JSON) (optional; used for suggestion ranking)

3.3 Syrup Maker Mode Model

Syrups created by the user MUST become inventory items with ratio metadata and shelf-life.

SyrupRecipeTemplate (system templates)

template_id

name (e.g., “Simple Syrup 1:1”)

ratio (JSON) (e.g., sugar:water = 1:1 by weight)

steps (JSON array)

expected_yield_ml

shelf_life_days

storage_location_recommended

UserSyrupBatch

batch_id

user_id

template_id (nullable if custom)

custom_name (nullable)

created_at

yield_ml

ingredient_inputs (JSON) (what was consumed)

inventory_lot_output_id (lot_id created in InventoryLot)

shelf_life_days

expires_at

ratio_metadata (JSON) (must include sweetness strength / brix estimate)

3.4 Recipe Model (Library + Studio + Versioning)

Recipe (canonical recipe record)

recipe_id (UUID)

canonical_title

description (short)

glassware (enum)

method (enum): SHAKE, STIR, BUILD, BLEND, SWIZZLE, ROLL, OTHER

ice_style (enum): NONE, CUBES, LARGE_CUBE, CRUSHED, PEBBLE, OTHER

garnish (string nullable)

instructions (JSON array of steps)

tags (array) (style + flavor)

estimated_abv (float nullable)

estimated_sugar (float nullable)

estimated_acidity (float nullable)

source_type (enum): HARVESTED, BOOK, USER_CREATED, EDITORIAL

visibility (enum): PRIVATE, UNLISTED, PUBLIC (default private for user-created)

created_at, updated_at

RecipeIngredientLine

line_id

recipe_id

ingredient_id (canonical)

quantity (decimal)

unit (enum)

preparation_note (nullable) (“freshly squeezed”, “2 dashes”)

optional (bool)

sequence (int)

RecipeSource

source_id

recipe_id

source_name (e.g., “Book Title”, “Bar Name”, “Creator Handle”)

source_url_or_reference (string nullable; may store reference token rather than raw url)

source_trust_tier (enum): TIER_1, TIER_2, TIER_3, UNKNOWN

ingested_at

license_status (enum): OK, RESTRICTED, UNKNOWN

attribution_text (string) (must be short)

CredibilityBadges (many-to-many)

badge_id (enum):

BOOK_SOURCED

AWARD_WINNING_BAR

COMMUNITY_VERIFIED

HIGH_SIMILARITY_TO_CLASSIC

TESTED_BY_YOU

recipe_id

computed_at

evidence (JSON) (e.g., similarity score, review count, trusted source id)

RecipeWhyItWorksBlurb

recipe_id

blurb_text (max 280 chars)

generated_at

inputs_snapshot_hash (hash of inventory/taste context used)

3.5 Studio: Recipe Version Control Model

StudioProject

project_id

user_id

title_working (string)

status (enum): DRAFT, TESTED, PROMOTED_TO_LIBRARY, ARCHIVED

created_at, updated_at

StudioRecipeVersion

version_id

project_id

version_number (int; 1..n)

parent_version_id (nullable) (supports branching)

recipe_snapshot (JSON) (full recipe: ingredients+instructions+metadata)

diff_from_parent (JSON) (computed)

generation_context_snapshot (JSON) (constraints, sliders, flavor wheel state, co-pilot answers)

created_by (enum): AI, USER

created_at

StudioDiff Algorithm Requirements

Must compute changes in:

ingredient additions/removals

ingredient quantity/unit changes

instruction step edits

method/glassware/ice changes

Must output a human-readable diff list used by UI:

“+0.25 oz Lemon Juice”

“-0.25 oz Simple Syrup”

“Method changed: Stir → Shake”

3.6 Reviews and Feedback Model

RecipeReview

review_id

user_id

recipe_id (or studio_version_id before promotion)

overall_rating (1–10)

would_make_again (bool)

Balance sliders (0–100 normalized):

sweetness

sourness

bitterness

strength

dilution

aroma_rating (0–100)

texture_rating (0–100)

descriptor_tags (array)

freeform_notes (text)

photo_asset_id (nullable)

created_at

FixSuggestionLog

fix_id

studio_version_id

trigger (e.g., “too sweet”)

suggestions (JSON array)

applied_suggestion_id (nullable)

created_at

3.7 Media Storage

MediaAsset

asset_id

user_id

asset_type (enum): RECIPE_PHOTO, BOTTLE_PHOTO, OTHER

storage_key

mime_type

width, height

created_at

4) AI Agents and Pipelines (Detailed)
4.1 Inventory Steward Agent (Strict Inventory Manager + Embeddings Lifecycle)
4.1.1 Responsibilities (MUST)

Canonicalize and validate inventory entries:

map user text to ingredient_id

ensure category/tags/roles are correct

detect duplicates (same ingredient + brand) and propose merge

Manage ingredient equivalency and substitution sets:

maintain IngredientSubstitutionGroup membership and rules

incorporate user feedback (“this is not a valid substitute for me”)

Drive ingredient conversions and update inventory when conversions are executed:

“superfine sugar → simple syrup”

update consumed inputs and create output lots

Continuously develop and refresh embeddings:

ingredient embeddings

recipe embeddings

role embeddings

flavor embeddings

user preference embeddings

Provide structured tools to Studio and recommendations.

4.1.2 Embeddings: Data and Storage

EmbeddingRecord

embedding_id

entity_type (enum): INGREDIENT, RECIPE, SUBSTITUTION_GROUP, USER_PREFERENCE, KNOWLEDGE_CHUNK

entity_id

embedding_vector (vector)

embedding_model (string)

embedding_version (int)

created_at

4.1.3 Embeddings Update Triggers

On creation/update of:

ingredient aliases / canonical name changes

new recipe ingestion

new user review

new studio session completion

new substitutions accepted/rejected

Scheduled refresh:

nightly for all new/changed entities

weekly full consistency check (optional)

4.1.4 Retrieval Strategy Requirements (MUST)

Studio must never rely on a “prompt dump” of inventory. It MUST use structured retrieval:

Start with get_inventory_summary() (small, stable)

Fetch focused subsets with find_inventory_items(...) based on template/constraints

Fetch on demand when missing ingredient arises

4.1.5 Inventory Steward API (internal)

POST /internal/inventory/canonicalize

POST /internal/embeddings/recompute

POST /internal/substitutions/update

POST /internal/conversions/plan

POST /internal/conversions/execute

4.2 Recipe Harvester Agent (Scan → Extract → Normalize → Dedup → Validate)
4.2.1 Inputs

Allowed sources (implementation must be compliant):

API-based feeds

RSS feeds

curated list of sites with permitted access

creator feeds where text captions are available

Each source is configured with:

source_id

crawl frequency

trust tier

extraction method adapter

4.2.2 Pipeline Stages (MUST)

Stage A: Candidate Discovery

Pull new posts/pages/items since last run.

Store minimal metadata in HarvestCandidate table:

text snippet

author/source

timestamp

engagement stats if available

reference token/link

Stage B: Recipe Extraction

Extract structured data:

ingredients list

quantities/units

method

glassware

garnish

instructions (if available)

Extraction may be:

rule-based + regex + unit parsing

LLM-assisted extraction with strict schema output (JSON)

Stage C: Normalization

Canonicalize ingredient names → ingredient_id via Inventory Steward ontology

Normalize units to canonical internal format

Standardize method/glass/ice enums

Create a “normalized recipe snapshot” used for fingerprinting and embeddings

Stage D: Deduplication & Variant Clustering
Multi-layer dedup MUST be applied:

Canonical fingerprint

Create a fingerprint from:

sorted ingredient IDs

normalized ratios (relative quantities)

method + glass + ice

Exact/near-exact fingerprint match → duplicate candidate.

Embedding similarity

Compute recipe embedding and find nearest neighbors in vector store.

If similarity > threshold, treat as potential duplicate/variant.

Determine:

DUPLICATE (identical or trivial edits)

VARIANT (meaningful changes: base spirit swap, bitters change, ratio shift beyond tolerance)

Variant graph

Store in RecipeVariantCluster:

cluster_id

canonical_recipe_id

variant_recipe_ids[]

relationship_types (e.g., “swap base”, “sweetener ratio”, “bitters change”)

Stage E: Quality Control (Avoid nonsense/awful recipes)
Compute a Quality Score from:

Source Trust Score (tiered)

Social Proof Score (ratings/reviews/engagement; sentiment if available)

Plausibility Score (hard constraints)

Structure Fit Score (matches known drink families/templates)

Hard rejection filters MUST include (non-exhaustive):

missing core structure (no base/modifier in a way that forms any recognized family) unless source is Tier 1

absurd total volume (configurable by drink family)

unsafe or non-food ingredients

method mismatch (egg white stirred without justification)

extreme sugar/acid ratio outside plausible bounds

Stage F: Storage

Approved → create Recipe, RecipeIngredientLine, RecipeSource, badges, and embedding.

Uncertain → quarantine queue for curator console.

Rejected → store rejection reason (for audit and tuning).

4.2.3 Credibility Badges Computation

BOOK_SOURCED: source_type BOOK + license OK

AWARD_WINNING_BAR: source in trusted award list (config)

COMMUNITY_VERIFIED: review count >= N and average rating >= threshold

HIGH_SIMILARITY_TO_CLASSIC: similarity to canonical classic cluster >= threshold

TESTED_BY_YOU: user has review record

4.2.4 “Why this works” Blurb Generation

Generated when:

recipe appears in recommendations

recipe is new to user

Inputs:

user taste profile summary

inventory capability summary

recipe family/template classification

Output: <= 280 chars

4.3 Mixology Creator Agent (Studio)
4.3.1 Inputs (MUST)

Inventory context via tool calls (not raw dump)

User taste profile embedding + summary

Known recipe templates and structures

Verified recipe corpus embeddings and metadata

Knowledge base chunks (mixology books/science), with citations metadata

4.3.2 Studio Workflow Modes (MUST)

Drag-and-drop constraints
User selects ingredients (hard constraints) and roles (optional).

Build-from-template mode
Choose template scaffold and fill constraints.

Constraint sliders
Targets: ABV, sweetness, bitterness tolerance, spirit-forward↔refreshing, tropical↔herbal

Flavor wheel interface
Multidimensional flavor steering.

AI co-pilot questions
Crisp vs rich, bitterness subtle vs present (and optionally others, but must remain “few and high-signal”).

4.3.3 Output (MUST)

Generate 1 recommended recipe + 2–5 alternates (configurable)

Each recipe must include:

ingredient lines (with quantities + units)

method and step-by-step instructions

glassware + ice recommendation

garnish recommendation (optional)

estimated ABV and balance metrics

substitution options for any missing items (unless “only what I own” is strict, in which case missing is disallowed)

Must run validation checks before presenting.

4.3.4 Validation Checks (MUST)

Structural sanity by template family:

sour: base + acid + sweet, ratio within bounds

Negroni: base + bitter + fortified, ratio within bounds

old fashioned: base + sweet + bitters

Collins: base + acid + sweet + lengthener

Plausibility checks:

total volume range

method and ingredient compatibility

alcohol balance with target ABV constraints

Inventory feasibility:

all required ingredients available if strict mode

if not strict, missing items must be clearly labeled

4.3.5 Recipe Version Control Requirements (MUST)

Every AI generation produces a new StudioRecipeVersion

Any manual edit produces a new version

Diff must be computed and stored

UI must support:

list of versions

diff view for any version

revert (create a new version identical to reverted snapshot)

4.3.6 Balance Checker + Fix Buttons (MUST)

When user review indicates imbalance (explicit or inferred), system generates fix suggestions:

too sweet → reduce syrup X% OR increase acid OR add bitters OR lengthen with soda

too sour → reduce acid OR increase sweetener OR add lengthener

too bitter → reduce bitter component OR increase sweetener OR adjust dilution

too strong → lengthen with soda OR adjust base quantity OR increase dilution

too watery → reduce dilution by technique guidance OR adjust ice/method

One-tap Apply MUST:

create v(n+1) with the modification applied

record suggestion and acceptance in FixSuggestionLog

4.3.7 Knowledge Base Usage (mixology books and science)

Knowledge base chunks must be stored as:

short paraphrased summaries

citations metadata

embeddings for retrieval

Output should not reproduce long verbatim book content; it should use principles to guide recipes.

5) Recommendation Engine Specifications
5.1 “Make Now” and “Missing One”

Make Now: all required ingredients present above thresholds; perishable freshness OK.

Missing One: missing exactly one ingredient (or one substitution group member).

5.2 Unlock Score (New Ingredient Purchase Suggestions)

For each candidate ingredient not owned, compute:

recipes_unlocked_count

weighted_unlock_value (weights by:

user taste alignment

credibility badges

recipe rating)

synergy_score (overlap with owned ingredients)

practicality_penalty (perishability, cost, niche, storage)

net_unlock_score = (weighted_unlock_value + synergy_score) - practicality_penalty

Recommendation list MUST include:

top N ingredients

explanation: “unlocks X recipes including A/B/C”

optional cheaper alternatives and substitution group options

5.3 Taste-alike Suggestions

Given a liked recipe:

retrieve similar recipes by:

template family

embedding similarity

shared ingredient roles

rerank by:

user taste profile

credibility

inventory feasibility

5.4 Ingredient-centric Exploration Panel

Given ingredient:

show:

make now recipes

missing-one recipes

studio prompts and templates best suited

substitution guidance (from substitution group rules)

“unlock companions” (classic partners)

5.5 Tonight’s Flight

Generate a 3-drink progression:

aperitif: lower ABV, bitter/refreshing preference aware

main: strongest aligned with taste and inventory

digestif: amaro/liqueur-forward or spirit-forward based on preference

Constraints:

avoid repeating base spirit in all three unless user likes it

consider perishables

ensure total alcohol pacing guidance is displayed

6) Guided Making Mode + Glassware/Ice Recommendations
6.1 Guided Making Mode (MUST)

Recipe execution view includes:

step-by-step checklist

optional timers:

shake 10–12s default; recipe-specific override allowed

stir 25–35s default; recipe-specific override allowed

strain guidance: fine strain vs standard

context hints (e.g., “dry shake first” for egg)

6.2 Glassware & Ice Recommendations (MUST)

For each recipe/template, store recommended:

glassware

ice style

chilling instructions
Examples:

“Use a big cube to slow dilution”

“Chill the coupe 5 minutes”

Recommendations should adapt to:

user equipment inventory

“mess tolerance” filter (optional)

7) Party Features
7.1 Menu Builder + Batching (MUST)

Input:

number of guests

time window

preferences (low ABV, bitter, tropical, etc.)

allowed complexity
Output:

3–6 drink menu

shopping list

prep schedule (“make syrups day before”)

batch quantities

dilution calculations

Batch math requirements

scale ingredient quantities linearly

compute expected dilution based on method:

stirred dilution approx range

shaken dilution approx range

provide a “pre-dilute amount” for freezer batches if applicable

include storage guidance and shelf life warnings for fresh juice batches

7.2 Inventory-aware “Serve 8 People” (MUST)

When generating a menu or batch plan:

compute required amounts

ensure not consuming:

below par levels (if configured)

last ounces of rare items (configurable)

if shortage, propose:

substitutions from inventory

alternative recipes

purchase list additions

7.3 Cocktail Draft Picks (MUST)

Party game mode:

guests choose preferences (spirit, bitterness tolerance, sweet/sour)

system generates a lineup of candidate drinks

draft order assigns drinks to “rounds” (aperitif/main/digestif optional)

output includes recipe cards + scaled quantities

8) UI/UX Specification (Key Screens and Interactions)
8.1 Navigation Tabs (Minimum)

Home

Inventory

Library

Studio

Party

Profile/Settings

8.2 Inventory UI

Add item (search + scan + quick add)

View by category

Item detail:

lots list (opened vs sealed)

remaining slider

opened date

expiry countdown

storage location

Restock list

Expiring soon list

8.3 Syrup Maker Mode UI

Templates list (1:1, 2:1, honey, ginger, cinnamon, oleo)

Template detail:

steps

make amount selector

“Log as made” button

On completion:

creates inventory lot with expires_at

updates consumed inputs

8.4 Library UI

Filters panel:

deep filters listed in requirements

Recipe list with badges

Recipe detail:

“why this works” blurb

“make now / missing-one / substitutions”

guided making mode entry

Ingredient-centric exploration:

ingredient detail panel with the required views

8.5 Studio UI (Separate Workflow)

Must include:

Workbench with drag-and-drop ingredients into:

required tray

optional tray

avoid tray

role slots (base/modifier/sweet/acid/bitter/aroma/texture/lengthener/garnish)

Build-from-template selector (sour, Negroni, old fashioned, Collins)

Constraint sliders

ABV range

sweetness target

bitterness tolerance

spirit-forward ↔ refreshing

tropical ↔ herbal

Flavor wheel

interactive radial or 2D/3D mapping; must output normalized flavor vector

Co-pilot questions modal (minimal, high-signal)

Generate button → shows recommended + alternates

Version history panel:

version list (v1, v2…)

diff view

revert

Balance fix buttons appear after review or on demand

8.6 Review Flow UI

Guided prompts:

overall rating 1–10

would make again yes/no

balance sliders (sweet/sour/bitter/strength/dilution)

aroma/texture

descriptors

notes

photo upload

“Apply fix as v2” options (if Studio)

8.7 Tonight’s Flight UI

shows 3 drinks with:

role labels (aperitif/main/digestif)

pacing guidance

“make now” status and substitutions

8.8 Party UI

menu builder wizard

generated menu view (cards)

batch plan view (scaled quantities + dilution)

shopping list export

draft picks mode

9) API Specification (External App Backend)
9.1 Auth

POST /auth/register

POST /auth/login

POST /auth/refresh

JWT access token + refresh token

9.2 Inventory

GET /inventory/items

POST /inventory/items

GET /inventory/items/{id}

PATCH /inventory/items/{id}

POST /inventory/items/{id}/lots

PATCH /inventory/lots/{lot_id}

GET /inventory/restock

GET /inventory/expiring

9.3 Conversions and Syrup Maker

POST /conversions/plan

input: source ingredient + target (e.g., “simple syrup 1:1”) + desired yield

output: steps + required inputs + inventory impact preview

POST /conversions/execute

commits inventory changes

GET /syrups/templates

POST /syrups/batches

9.4 Recipes (Library)

GET /recipes

supports filters: deep filters, tags, make-now, missing-one, etc.

GET /recipes/{id}

POST /recipes/{id}/reviews

GET /ingredients/{id}/explore (ingredient-centric exploration)

9.5 Recommendations

GET /recommendations/make-now

GET /recommendations/missing-one

GET /recommendations/unlock

GET /recommendations/tonights-flight

9.6 Studio

POST /studio/projects

GET /studio/projects/{id}

POST /studio/projects/{id}/generate

input: constraints (ingredients, template, sliders, flavor vector, co-pilot answers)

output: recommended + alternates, each as recipe snapshot

POST /studio/projects/{id}/versions

create new version (manual edits or AI output)

GET /studio/projects/{id}/versions

GET /studio/versions/{version_id}/diff

POST /studio/versions/{version_id}/revert

POST /studio/versions/{version_id}/review

triggers balance checker and fix suggestions

POST /studio/versions/{version_id}/apply-fix

creates v(n+1)

9.7 Party

POST /party/menu/generate

POST /party/menu/batch-plan

POST /party/draft/generate

9.8 Media

POST /media/upload-url (returns signed upload URL)

POST /media/confirm

GET /media/{asset_id}

10) Internal Services and Job Specs
10.1 Background Jobs

job_inventory_embedding_refresh

job_recipe_harvest_source_{source_id}

job_recipe_normalize_and_dedup

job_recipe_quality_score_and_badges

job_generate_why_it_works_blurbs

job_recommendation_cache_refresh

job_expiry_notifications

10.2 Rate Limits and Quotas

Studio generation requests: configurable per user/day

Harvester per source: configurable per hour/day

Embedding recompute: bounded to avoid runaway cost

11) Security, Privacy, and Compliance
11.1 Security Requirements

JWT auth with refresh rotation

Encryption in transit (TLS)

Encryption at rest for DB and object storage

Least privilege for services

Audit logs for:

recipe ingestion approvals/rejections

user content changes

embedding refresh and model versions

11.2 Privacy Requirements

User’s inventory and private recipes are private by default

Any public sharing requires explicit opt-in

PII minimal collection

11.3 Content Compliance (Recipe Harvester)

Respect source terms and permitted access

Store attribution and reference tokens

Quarantine questionable license items

Do not store long verbatim text from copyrighted sources without licensing

12) Observability and Analytics
12.1 Metrics

Inventory completeness score

Recipe recommendation CTR

Studio success metrics:

generation → made → reviewed funnel

average rating of Studio recipes over time

fix button usage and impact

Harvester quality metrics:

acceptance rate

rejection reasons distribution

duplicate rate

12.2 Logging

Structured logs per request

Trace ID propagation through API → worker → AI services

13) Testing Strategy
13.1 Unit Tests

Unit parsing and normalization

Conversions and syrup maker inventory impacts

ABV and balance estimation

Diff computation

Unlock score computation

13.2 Integration Tests

End-to-end Studio generation (mock AI) with tool calls for inventory retrieval

Recipe ingestion pipeline with dedup + quality scoring

Party batch plan calculations

13.3 E2E Tests (Mobile/Web)

Add inventory item → make syrup → inventory updated

Select template + sliders + flavor wheel → generate → create v1 → review → apply fix → create v2 → revert

13.4 Model/Agent Evaluation

Gold set of known recipes:

verify dedup clustering correctness

verify quality score rejects nonsense

Studio: evaluate:

inventory feasibility rate

constraint satisfaction rate

average predicted balance vs user feedback

14) Acceptance Criteria (Feature-by-Feature)
Inventory Steward + Embeddings

Studio generation uses inventory tools; no raw full inventory prompt injection.

Embeddings recompute triggers fire on review creation and recipe ingestion.

Substitution suggestions improve after user feedback (measurable by acceptance rate).

Ingredient Equivalency & Conversions

“I have superfine sugar but not syrup” produces a conversion plan and updates inventory on execute.

Conversions create output inventory lots with shelf-life metadata.

Syrup Maker Mode

Templates present: 1:1, 2:1, honey, ginger, cinnamon, oleo saccharum.

Making a syrup creates a tracked inventory lot with expiry.

Recipe Harvester (dedup + quality)

Duplicate recipes are clustered; variants preserved.

Low-quality/nonsense recipes are rejected with logged reasons.

Approved recipes receive credibility badges where applicable.

Credibility Badges + Why This Works

Badges visible on recipe cards.

Blurb is generated and shown on recipe detail and recommendation surfaces.

Deep Filters

All filters listed are implemented and affect results deterministically.

Taste-alike + Ingredient-centric exploration

Liked recipe yields taste-alikes within 1 second.

Ingredient exploration shows “make now,” “missing one,” studio prompts, substitutions.

Tonight’s Flight

Generates a 3-drink progression with pacing guidance and inventory feasibility.

Studio

Drag-and-drop constraints enforce ingredient inclusion/exclusion.

Constraint sliders steer outputs measurably (ABV and sweetness estimates shift accordingly).

Build-from-template mode produces structurally valid recipes.

Flavor wheel changes outputs along the intended axes.

Co-pilot questions appear only when needed and improve satisfaction metrics.

Version Control + Diff + Revert

Every change creates a new version.

Diff is human-readable and accurate.

Revert creates a new version identical to target snapshot.

Balance Checker + Fix Buttons

A “too sweet” review yields fix suggestions and one-tap apply creates v2.

Fix logs are stored.

Guided Making Mode + Glass/Ice

Timers available and default to 10–12s shake, 25–35s stir where applicable.

Glassware and ice suggestions appear and adapt to equipment inventory.

Party Features

Menu builder outputs shopping list, prep schedule, batch plan with dilution calculations.

Serve-8 mode avoids consuming last ounces / below par levels.

Draft picks mode generates a fun lineup based on guest preferences.

15) Repository Layout (Codex 5.3 Implementation Blueprint)

A monorepo layout is recommended:

repo/
  apps/
    mobile/                 # React Native app
    web/                    # Next.js web app (optional but recommended)
  services/
    api/                    # FastAPI gateway + domain modules
    workers/                # Celery workers, scheduled jobs
    ai_agents/
      inventory_steward/    # canonicalization, embeddings, substitutions
      recipe_harvester/     # ingestion pipeline
      mixology_creator/     # studio generation orchestration
      balance_engine/       # balance metrics + fix suggestions
    knowledge_base/         # chunk store + embedding + citations
  packages/
    shared_types/           # JSON schemas, enums, contracts
    ui_components/          # cross-app UI components
  infra/
    docker/
    terraform/
  docs/
    SPEC.md                 # this document
    API.md
    DATA_MODEL.md

16) Schemas and Contracts (Strict JSON Schemas)

All agent outputs and internal tool responses MUST be validated against JSON Schema to prevent malformed data from entering the system.
Codex should implement:

schemas/recipe_extraction.json

schemas/studio_generation_request.json

schemas/studio_recipe_snapshot.json

schemas/review.json

schemas/conversion_plan.json

17) Key Algorithms (Implementation Requirements)
17.1 ABV Estimation

For each alcoholic ingredient:

compute ethanol volume = quantity_ml * (abv/100)

Sum ethanol volume; divide by total volume including dilution estimate.

Dilution estimate depends on method and ice:

stir: default dilution 20–30%

shake: default dilution 25–40%

build: minimal unless specified

17.2 Balance Metrics

Compute approximate indices:

SweetnessIndex = Σ(sugar_equivalents)

AcidityIndex = Σ(acid_equivalents)

BitternessIndex = Σ(bitters/amaro weighting)
Use these for:

constraint satisfaction

fix suggestion sizing

17.3 Fix Suggestion Sizing (example rule set)

If user indicates “too sweet”:

if SweetnessIndex high relative to AcidityIndex:

reduce sweetener by 10–25% (based on delta)

OR increase acid by 5–15%

OR add 1–2 dashes bitters (if compatible)

OR lengthen with soda 2–4 oz (if user wants refreshing)

Fix engine must output multiple options and explain expected effect in one short line each.

17.4 Dedup Thresholds

Fingerprint match: exact duplicate

Embedding similarity:

0.95: duplicate candidate

0.88–0.95: variant candidate
Thresholds must be configurable per recipe family.

18) Implementation Notes for Codex 5.3 (Operational Guidance)

Treat agents as services with strict tool interfaces; avoid “freeform” LLM logic writing directly to DB.

Enforce:

JSON schema validation

database constraints

idempotency for ingest jobs

Prefer deterministic rules for:

conversions

syrup maker inventory effects

diff computations

party batch math
Use AI primarily for:

extraction from messy text

creative generation within constraints

short “why it works” blurbs

optional ingredient mapping suggestions (with human‑verifiable confidence score)