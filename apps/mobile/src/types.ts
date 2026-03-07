export type Ingredient = {
  id: string
  canonical_name: string
}

export type InventoryItem = {
  id: string
  ingredient_id: string
  unit: string
  preferred_unit?: string
  unit_to_ml?: number
}

export type InventoryBatchUploadRow = {
  row_number: number
  source_name: string
  status: 'ready' | 'partial' | 'duplicate' | 'skipped'
  import_action: string
  confidence?: number | null
  notes: string[]
  missing_fields: string[]
  import_result?: string | null
  source_refs: Array<{ label: string; url?: string | null }>
  resolved: {
    canonical_name: string
    display_name?: string | null
    category?: string | null
    subcategory?: string | null
    description?: string | null
    abv?: number | null
    is_alcoholic: boolean
    is_perishable: boolean
    unit: string
    preferred_unit?: string | null
    quantity?: number | null
    lot_unit?: string | null
    location?: string | null
  }
}

export type InventoryBatchUploadResponse = {
  filename: string
  applied: boolean
  summary: {
    total_rows: number
    ready_rows: number
    partial_rows: number
    duplicate_rows: number
    importable_rows: number
    skipped_rows: number
    pending_review_rows: number
    created_ingredients: number
    reused_ingredients: number
    created_items: number
    reused_items: number
    created_lots: number
  }
  lookup_telemetry: {
    cache_hits: number
    cache_misses: number
    cocktaildb_requests: number
    cocktaildb_failures: number
    openai_requests: number
    openai_failures: number
    openai_input_tokens: number
    openai_output_tokens: number
    openai_total_tokens: number
  }
  rows: InventoryBatchUploadRow[]
}

export type Recipe = {
  id: string
  canonical_name: string
  review_status?: string
  quality_label?: string
}

export type HarvestJob = {
  id: string
  source_url: string
  source_type: string
  status: string
  error?: string
  attempt_count?: number
  parse_strategy?: string
  compliance_reasons?: string[]
  next_retry_at?: string | null
  created_at?: string
  updated_at?: string
}

export type RecipeModeration = {
  id: string
  recipe_id: string
  status: string
  quality_label?: string
  notes?: string
  created_at?: string
}

export type StudioSession = {
  id: string
  status: string
}

export type StudioVersion = {
  id: string
  version_number: number
  recipe_snapshot?: {
    canonical_name?: string
  }
}

export type StudioGuidedStep = {
  label: string
  seconds: number
}

export type StudioDiffResult = {
  from_version_id: string
  to_version_id: string
  diff: any
}

export type SectionState = {
  loading: boolean
  error: string
}
