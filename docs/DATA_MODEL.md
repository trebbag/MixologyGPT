# BartenderAI Data Model (Core Notes)

This document extracts the core data model requirements from `docs/SPEC.md` and normalizes them into a concise, implementation‑ready reference. It is not exhaustive; it focuses on tables that must exist for the Phase 1–3 build and establishes common fields and relations.

## Conventions
- All IDs are UUIDs.
- `created_at`, `updated_at` exist on all primary tables.
- Soft delete is represented by `deleted_at` where applicable.
- Many `*_id` columns are FK references to the table named by the prefix.

## Users & Access
- **users**: id, email, hashed_password, is_active, is_verified, role
- **refresh_sessions**: id, user_id, token_hash, user_agent, ip_address, expires_at, revoked_at, last_used_at, replaced_by_session_id
- **roles**: id, name, permissions (json)

## Ingredients & Ontology
- **ingredients**: id, canonical_name, category, subcategory, description, abv, is_alcoholic, is_perishable
- **ingredient_aliases**: id, ingredient_id, alias
- **ingredient_equivalencies**: id, ingredient_id, equivalent_ingredient_id, ratio, notes
- **ingredient_embeddings**: id, ingredient_id, embedding (vector), model

## Inventory
- **inventory_items**: id, user_id, ingredient_id, display_name, unit, preferred_unit
- **inventory_lots**: id, inventory_item_id, quantity, unit, abv, purchase_date, expiry_date, location, lot_notes
- **inventory_events**: id, inventory_item_id, event_type, delta_quantity, unit, note

## Equipment & Glassware
- **equipment**: id, user_id, name, type, notes
- **glassware**: id, user_id, name, type, capacity_ml, notes

## Syrup Maker
- **syrup_recipes**: id, name, ratio, base_sugar, base_liquid, notes
- **syrup_lots**: id, syrup_recipe_id, inventory_item_id, made_at, expiry_date, quantity, unit
- **expiry_rules**: id, ingredient_id, days, notes

## Recipes
- **recipes**: id, canonical_name, description, instructions, glassware_id, ice_style, tags (json)
- **recipe_sources**: id, recipe_id, url, source_type, author, published_at, credibility_score
- **recipe_source_policies**: id, name, domain, metric_type, min_rating_count, min_rating_value, review_policy, is_active, seed_urls (json), crawl_depth, max_pages, max_recipes, crawl_interval_minutes, respect_robots
- **recipe_harvest_jobs**: id, user_id, source_url, source_type, raw_text, canonical_name, rating_value, rating_count, like_count, share_count, status, error, attempt_count, last_attempt_at, next_retry_at, recipe_id, duplicate, quality_score
- **recipe_variants**: id, recipe_id, variant_of_recipe_id, similarity_score, notes
- **recipe_badges**: id, recipe_id, badge_type, label
- **recipe_blurbs**: id, recipe_id, blurb
- **recipe_embeddings**: id, recipe_id, embedding (vector), model

## Studio
- **studio_sessions**: id, user_id, status, started_at, ended_at
- **studio_constraints**: id, studio_session_id, constraints (json)
- **studio_versions**: id, studio_session_id, version, snapshot (json)
- **studio_diffs**: id, studio_version_id, diff (json)

## Reviews
- **reviews**: id, user_id, recipe_id, rating, notes
- **review_signals**: id, review_id, signal_type, value
- **fix_suggestions**: id, review_id, suggestions (json)

## Recommendations & Party Features
- **recommendations**: id, user_id, type, payload (json)
- **tonight_flights**: id, user_id, payload (json)
- **party_menus**: id, user_id, payload (json)
- **batch_plans**: id, party_menu_id, payload (json)

## Media
- **media_assets**: id, owner_id, url, media_type, metadata (json)

## Notifications
- **notifications**: id, user_id, type, payload (json), status, deliver_at

## Indexing & Constraints
- Vector columns use pgvector and are indexed with IVF or HNSW.
- Recipe dedup thresholds are configurable by recipe family.
- Inventory lot quantity must not drop below zero; constraint enforced at write.
