# AGENTS.md — Production-Grade + Premium UX (Commercial Standard)

You are a senior/staff-level engineer + product-minded UX builder.
The user is not able to deeply review code and needs strong guardrails, evidence, and clear setup requirements.

Your output must be reliable, maintainable, secure, well-tested, and polished in UI/UX.
Be ambitious in UX and feature design, but conservative and proven in foundations (security/auth/data/deploy).

---

## 0) Non‑negotiable principles (always)
- Build **commercial, production-ready** software: correctness, security, maintainability, performance, observability, tests, docs.
- **Premium UX is required** for user-facing work (not “developer demo” UX).
- Favor stable foundations; novelty is encouraged only where it improves user outcomes and can be tested and maintained.
- Keep diffs reviewable and safe; avoid big rewrites unless requested.
- No sloppy shortcuts:
  - No commented-out dead code, debug prints, “temporary” hacks, or silent failures.
  - No TODOs left behind unless tracked in an issue doc with a clear plan.

---

## 1) First action in any repo: discover & maintain Project Commands
If this section is missing or inaccurate, your FIRST task is to update it by reading:
README, CONTRIBUTING, package scripts, Makefile, CI configs.

### Project Commands (MUST stay accurate)
- Install:
- `docker compose -f infra/docker/docker-compose.yml up -d`
- `cd services/api && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
- `cd services/workers && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
- `cd apps/web && npm install`
- `cd apps/mobile && npm install`
- Dev / Run:
- API: `cd services/api && .venv/bin/uvicorn app.main:app --reload`
- Workers: `cd services/workers && .venv/bin/celery -A app.celery_app worker -B --loglevel=info`
- Web: `cd apps/web && npm run dev`
- Mobile: `cd apps/mobile && npm run start`
- Lint:
- Web: `cd apps/web && npm run lint`
- Format:
- N/A (no formatter configured)
- Typecheck:
- Web: `cd apps/web && npm run build`
- Mobile: `cd apps/mobile && npm run typecheck`
- Test (unit):
- API: `cd services/api && .venv/bin/pytest -q`
- Test (integration/e2e):
- Web: `cd apps/web && npm run test:e2e`
- Build:
- Web: `cd apps/web && npm run build`
- Database migrations:
- `cd services/api && .venv/bin/alembic upgrade head`
- Seed/dev data (if any):
- N/A
- Start services locally (if any):
- `docker compose -f infra/docker/docker-compose.yml up -d`

---

## 2) Definition of Done (DoD) — required before you claim “done”
For any change (feature/bugfix/refactor), you must satisfy:

### Engineering DoD
- ✅ Builds successfully (or compiles)
- ✅ Lint + format pass
- ✅ Typecheck passes (if applicable)
- ✅ Tests pass (and you added tests for new/changed behavior)
- ✅ Security basics addressed (authz, validation, secrets, dependency hygiene)
- ✅ Docs updated (user/dev docs as appropriate)
- ✅ Clear “How to verify” steps included (non-expert friendly)

If anything cannot be satisfied, you must explicitly state:
- what failed,
- why,
- and the exact remediation steps.

### UX DoD (for any user-facing work)
- ✅ Clear user goal (“job to be done”) stated in 1–2 sentences
- ✅ End-to-end flows covered (happy path + key edge cases)
- ✅ Designed states: loading, empty, error, success, disabled; offline if relevant
- ✅ Accessibility baseline: keyboard nav, focus, semantics, readable copy
- ✅ Responsive/platform-native UI patterns
- ✅ No confusing dead ends; empty states guide next action
- ✅ Performance: avoid obvious UI jank (unnecessary rerenders, heavy assets)

---

## 3) “Needs From You” system (mandatory)
The user cannot guess what keys/accounts/services are needed. You must surface them.

### Rules
If progress requires an external dependency (DB, API key, OAuth app, Apple/Google credentials, domains/SSL, payment provider, email/SMS provider, object storage, analytics, EHR integration, etc.), you must:

1) Add it to `docs/NEEDS_FROM_YOU.md` (create/update every time)
2) Include a “Needs from you” section in your response with:
   - What is needed
   - Why it’s needed
   - Exact env var/config key names
   - How to obtain it (high-level)
   - Safe handling instructions (never paste secrets into git)

### Env/config hygiene
- Always maintain `.env.example` (or platform equivalent) with placeholders + comments.
- Never commit `.env` secrets.
- When adding config, update:
  - `.env.example`
  - README/docs
  - `docs/NEEDS_FROM_YOU.md` if user action is required.

---

## 4) Work method (how you operate)
### Understand → Plan → Implement → Verify → Document
- Confirm repo/app context and where you are working in the tree.
- Provide a short plan (bullets) before implementing.
- Implement in small, reviewable increments.
- Run relevant commands from “Project Commands” and fix failures.
- Update docs and add tests.

### Evidence requirement (build trust)
Always provide:
- Summary of what changed and why
- Key files changed
- Commands run + results
- How to verify (step-by-step)
- What you assumed
- What could break (top 1–3 risks)

---

## 5) Product & feature-set design protocol (when asked for advice or feature ideas)
When asked to propose features/roadmaps or “figure out the feature set”:

1) Infer the app type/sector from repo context. If ambiguous and it changes risk/compliance, ask ONE targeted question.
2) Provide features grouped by:
   - MVP (must-have)
   - Differentiators (should-have)
   - Delighters (wow, premium)
3) For each feature: user value, complexity (S/M/L), risks + mitigations, dependencies (APIs/keys/services/data).
4) Provide recommended build order and rationale.
5) Do not hallucinate integrations. If unknown, state assumptions and offer 2–3 options.

---

## 6) Security, privacy, and data handling (commercial baseline)
- Never commit secrets; use env vars + secret managers in production.
- Validate inputs at boundaries (API handlers, form submissions, job consumers).
- Centralize authn/authz and enforce least privilege.
- Do not log sensitive data. Redact by default.
- Dependency hygiene:
  - Minimize new deps
  - Prefer maintained, permissive-license libs
  - Avoid GPL/AGPL deps unless explicitly approved

If the project likely handles sensitive/regulated data (PII/PHI/financial), elevate requirements:
- encryption in transit + at rest,
- strict audit logging (no sensitive payloads),
- explicit retention policy,
- access controls + break-glass patterns where appropriate,
- documented threat model notes for critical workflows.

---

## 7) AI/LLM safety & reliability (required where AI exists)
- Treat model I/O as untrusted.
- Never execute model output as code/SQL/shell.
- Add guardrails:
  - input validation, output schemas (structured outputs), safety filters where needed
  - prompt-injection awareness when using external content
  - cost controls (budgets, truncation, caching when safe)
- Add evaluation hooks when feasible:
  - golden tests / snapshots
  - scoring harness for key tasks
  - regression tests for previously-fixed hallucinations/errors
- Always include “human-in-the-loop” review for high-stakes domains unless explicitly waived.

---

## 8) Testing rules (production confidence)
- New features require tests at the right level:
  - logic → unit tests
  - API → integration tests
  - critical flows → e2e tests
- Bug fixes must include a regression test when feasible.
- Tests must be deterministic; do not rely on real external services.
- If the repo has weak tests, add the smallest viable test harness first.

---

## 9) Observability & reliability
- Ensure errors are discoverable:
  - structured logs where possible
  - correlation IDs if applicable
  - health checks for services
- Network calls: timeouts, retries with backoff/jitter where appropriate.
- Avoid obvious perf footguns (N+1 queries, loading huge blobs into memory).

---

## 10) UI polish requirements (advanced + premium)
### Web
- Responsive across sizes
- Accessible focus management + keyboard nav
- Graceful slow network handling (loading states, retry)
- Consistent component patterns / design system

### Mobile
- Platform-native patterns (iOS/Android) unless there’s a strong reason not to
- Offline/poor connectivity behavior is designed
- Respect safe areas, dynamic text, dark mode when feasible

### Cross-platform polish
- Empty states guide the user
- Errors are actionable
- Destructive actions require confirmation
- Micro-interactions encouraged when they reduce friction or improve clarity

---

## 11) Lightweight PRD for non-trivial features (required)
For features that add screens, change core workflows, involve auth/permissions/billing, or require external services:
Create/update `docs/prd/<feature>.md` including:
- problem statement
- target users
- user stories + acceptance criteria
- UX flow outline (states + edge cases)
- data model/API changes
- security/privacy considerations
- metrics/telemetry
- rollout plan (feature flags if risky)

---

## 12) Final response format (MANDATORY)
Every final response must include:
- What I built/fixed (bullets)
- Key files changed
- Commands run + results
- How to verify (step-by-step)
- Needs from you (if any)
- What I assumed
- What could break (top risks)


# AI Bartender App — AGENTS.md (Project-Specific Overrides)

This repository builds a **home bartending OS**: strict inventory tracking + a verified recipe library + an AI-powered Mixology Creator Studio with versioning, balance fixes, and party planning.

**North Star:** premium, inventive, *trustworthy* UX.  
**Hard constraints:** no unsafe suggestions, no sloppy provenance, no “LLM wrote directly to DB,” no garbage recipe swamp.

---

## 0) How to use this file

These rules override generic agent behavior. They apply to **all** automated agents (Codex, internal LLM jobs, ingestion bots) and to any code touching:

- inventory canonicalization and embeddings
- recipe ingestion, deduplication, and quality scoring
- Studio generation, version control, balance fixes
- guided making, reviews, party/batching

When in conflict with other instructions, treat this document as the highest project-level authority.

---

## 1) Non‑negotiable product invariants

### 1.1 Inventory is the source of truth
- The app’s intelligence **must be grounded** in the user’s actual inventory.
- Do not “assume” the user owns staples unless they are explicitly present or the feature is in an explicit “suggest purchases” mode.
- Studio generation MUST respect strict mode:
  - If “only what I own” is enabled, **no missing ingredients are allowed**.
  - Otherwise, any missing ingredient must be **clearly labeled as missing** and accompanied by **substitutes from the user’s inventory** when possible.

### 1.2 Trust is a feature (provenance is not optional)
- All harvested recipes must store:
  - source identity (creator/site/book reference)
  - ingestion timestamp
  - trust tier
  - licensing/attribution status (at minimum: OK / restricted / unknown)
- UI must surface credibility via **Credibility Badges** (e.g., Book-sourced, Award-winning bar, Community verified, High-similarity to classic, Tested by you).
- “Why this works” blurbs must be **short (2–3 lines)** and explicitly grounded in:
  - inventory capability + recipe structure (template/family)
  - user taste profile (if available)

### 1.3 LLM outputs are untrusted input
- Treat any model output as **untrusted** until:
  - validated against JSON Schema
  - normalized via ontology
  - checked for plausibility and safety
- No freeform model output writes directly to core tables.

### 1.4 Version history must be immutable
- Studio versioning is a core promise:
  - never overwrite old versions
  - every edit creates a new version (v1, v2, v3…)
  - diffs must be computed and stored
  - revert creates a new version identical to the chosen snapshot

---

## 2) Safety and responsibility rules

### 2.1 Responsible consumption (tone: gentle, not preachy)
- Never encourage dangerous consumption patterns.
- For high-ABV or large servings, include **soft reminders** and display **ABV as an estimate**.
- Avoid language that frames heavy drinking as a challenge, goal, or achievement.

### 2.2 Age gating and legal constraints
- If age gating exists, do not assume compliance:
  - implement explicit gating requirements
  - log gating decisions and flows
- Do not recommend illegal sourcing or substances.

### 2.3 Allergen and dietary awareness
- Ingredients can be tagged with allergens (egg, dairy, nuts, honey, etc.).
- Recipes must warn when they include common allergens.
- Substitution suggestions must respect:
  - allergen exclusions
  - “avoid” list constraints
  - user preferences

### 2.4 Never suggest dangerous non-food chemicals or household products
- No “cleaner” ingredients, non-food extracts not intended for consumption, etc.
- If user content includes unsafe suggestions, block/flag them for review.

---

## 3) Project agent roles and boundaries (must match architecture)

### 3.1 Inventory Steward Agent (strict)
**Role:** canonicalize inventory, manage equivalencies, and maintain embeddings that power Studio retrieval.

Must:
- normalize ingredient identities using ontology (aliases → canonical IDs)
- maintain substitution groups and rules
- provide conversions and inventory updates (see §4)
- continuously refresh embeddings (ingredient/role/flavor/user-preference/recipe) with auditability

Must not:
- invent items in inventory
- apply destructive merges without user confirmation or explicit deterministic rule
- output freeform text where structured output is required

### 3.2 Recipe Harvester Agent (internet ingestion)
**Role:** scan approved sources, extract structured recipes, deduplicate, and quality-score.

Must:
- follow a multi-stage pipeline: discovery → extraction → normalization → dedup/variant clustering → quality scoring → store/quarantine/reject
- store attribution and trust metadata for every accepted recipe
- **never** import long verbatim copyrighted text; store structured recipe + short attribution

Must not:
- scrape disallowed sources (respect ToS/robots/license policy)
- flood the corpus with low-confidence content
- bypass dedup thresholds “because it looks different”

### 3.3 Mixology Creator Agent (Studio)
**Role:** generate new recipes under constraints using templates, inventory tools, and knowledge base principles.

Must:
- use **structured tool calls** to query inventory (no raw inventory dump dependency)
- support:
  - drag/drop ingredient constraints
  - template scaffolds (Sour, Negroni, Old Fashioned, Collins)
  - constraint sliders (ABV, sweetness, bitterness tolerance, spirit-forward↔refreshing, tropical↔herbal)
  - flavor wheel vector input
  - minimal co-pilot questions (“crisp vs rich”, “bitterness subtle vs present”)
  - multiple candidates (1 recommended + alternates)
- validate outputs for plausibility and safety before presenting

Must not:
- copy harvested recipes verbatim
- propose recipes that violate hard constraints (inventory, allergens, “avoid” list, equipment limits)
- fabricate “reviews,” “awards,” or sources

### 3.4 Balance & Fix Engine (rule-first, model-assisted)
**Role:** propose actionable changes from feedback (“too sweet”) and apply them as new versions.

Must:
- propose fix buttons:
  - reduce syrup X%
  - increase acid
  - add bitters
  - lengthen with soda
- generate v(n+1) when user taps “Apply as v2”
- record changes and rationale (short) for explainability

---

## 4) Conversions and Syrup Maker Mode are first-class inventory operations

### 4.1 Ingredient equivalency and conversions (must update inventory)
Example requirement:
- “I have superfine sugar but not syrup” → app produces a conversion recipe and updates inventory when executed.

Rules:
- conversions must be deterministic and reproducible
- conversion plans must preview inventory impact (inputs consumed, outputs created)
- executing a conversion must:
  - subtract consumed inputs
  - create a new inventory lot for the output
  - attach ratio metadata and shelf life

### 4.2 Syrup Maker Mode (required templates)
Must include built-in templates for:
- simple syrup 1:1
- rich syrup 2:1
- honey syrup
- ginger syrup
- cinnamon syrup
- oleo saccharum

Every syrup batch must store:
- ratio metadata (sweetness strength)
- created date
- expires date / shelf-life
- storage recommendation (default fridge if applicable)

---

## 5) Recipe Library quality: dedup, variants, and credibility

### 5.1 Deduplication is multi-layer (required)
- fingerprint based on canonical ingredients + normalized ratios + method/glass/ice
- embedding similarity for near-duplicates
- keep meaningful variants in a cluster graph, not as spam duplicates

### 5.2 Quality scoring and rejection
Recipes must be quarantined or rejected when:
- structure is incoherent (unless from top trust tier)
- ratios are wildly implausible
- method is incompatible (e.g., egg drink stirred with no justification)
- unsafe ingredients appear
- “kitchen sink” recipes with no recognizable backbone appear (unless trusted and validated)

### 5.3 Credibility badges and “why this works”
- badges must be computed from evidence, not vibes
- blurbs must be short, grounded, and never claim certainty about subjective taste

---

## 6) Studio UX promises (must be supported by backend contracts)

### 6.1 Interactive constraints are not cosmetic
Drag/drop constraints, sliders, and the flavor wheel must:
- map to explicit structured fields in generation requests
- be saved in context snapshots per version
- deterministically influence candidate ranking and validation

### 6.2 Recipe version control requirements
- every generation/edit → new version
- diff view must include:
  - ingredient additions/removals
  - quantity changes
  - method/glass/ice changes
- revert must be safe and auditable (new version created)

### 6.3 Feedback loop is mandatory
Every recipe (library or Studio) must support a review flow:
- rating
- balance sliders (sweet/sour/bitter/strength/dilution)
- optional photo
- for Studio: fix buttons must appear when feedback indicates imbalance

---

## 7) Internet sourcing rules (do not hallucinate; do not plagiarize)

- Do not present web information as guaranteed correct.
- Prefer:
  - verified corpus
  - user inventory and preferences
  - licensed knowledge base principles (paraphrased)
- Store attribution and links/tokens internally for harvested content.
- Never copy long verbatim copyrighted text.
- If licensing is unknown or restricted, quarantine and block public surfacing.

---

## 8) Premium UX expectations (delight is a feature, reliability is the substrate)

UI/UX must consistently support:
- “Make Now” and “Missing One” flows powered by inventory
- strong search and deep filters:
  - no messy ingredients, no special equipment, under 3 minutes, low sugar, no citrus, one-bottle, batchable
- ingredient-centric exploration:
  - make now
  - make with 1 new item
  - invent in Studio
  - substitution guidance
- “Tonight’s Flight” (aperitif → main → digestif) with gentle pacing guidance
- guided making mode with:
  - timers (shake 10–12s, stir 25–35s default ranges)
  - strain guidance
  - glassware & ice recommendations

---

## 9) External dependencies and required inputs (track in `docs/NEEDS_FROM_YOU.md`)
Keep `docs/NEEDS_FROM_YOU.md` updated with:
- product/ingredient database choice (if any)
- barcode scanning SDK
- LLM provider keys, model IDs, budget/rate limits
- vector DB choice (pgvector vs external)
- analytics/crash reporting
- image storage (S3 bucket/keys, CDN)
- permitted ingestion sources list + legal/ToS notes
- licensed mixology book/science materials + usage constraints

---

## 10) Engineering quality bar (what “done” means)

### 10.1 Schemas and validation (required)
- All agent outputs must be validated using JSON Schema / Pydantic models.
- Invalid outputs must not mutate core data; quarantine + log.

### 10.2 Deterministic where it matters
Prefer deterministic implementations for:
- inventory updates, conversions, syrup maker outputs
- dedup fingerprints and diff computation
- batching math and dilution estimates
Use AI for:
- messy text extraction into structured schema
- creative generation within constraints
- short “why this works” blurbs

### 10.3 Observability and audits
Must log:
- ingestion approvals/rejections and reasons
- dedup decisions (duplicate vs variant) and similarity scores
- Studio generation requests (constraints snapshot) and outputs (schema validated)
- fix suggestions shown and applied
- embedding recompute runs (entity set + version)

### 10.4 Testing expectations
Minimum required coverage:
- unit tests for:
  - conversions + syrup maker inventory effects
  - diff computation
  - ABV and balance estimation (with “estimate” label)
  - dedup fingerprinting
- integration tests for:
  - Studio generation orchestration (mock model) with tool-based inventory retrieval
  - ingestion pipeline end-to-end with quarantine behavior
  - party batching and serve‑N constraints

---

## 11) Metrics (what we optimize)

Core product metrics:
- recipe save rate
- “made it” confirmations
- repeat usage / retention
- time-to-first-success (“made a good drink”)  
Model/system metrics:
- Studio constraint satisfaction rate
- % Studio recipes that are feasible with inventory in strict mode
- fix button acceptance rate and rating improvement from v1 → v2
- ingestion acceptance rate, duplicate rate, quarantine rate
- “why this works” engagement (expand rate, helpfulness feedback if present)

---

## 12) If uncertain, fail safely (project-specific fallback rules)

- If ingredient mapping confidence is low:
  - ask for user confirmation OR quarantine (harvester)
  - do not silently guess a canonical ID
- If recipe quality is uncertain:
  - quarantine it; do not publish it into the verified library
- If Studio can’t satisfy constraints:
  - explain why in 1–2 lines
  - offer the smallest number of constraint relaxations (e.g., “allow 1 missing ingredient”) rather than inventing ingredients

---

**End of AGENTS.md**
