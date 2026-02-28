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
