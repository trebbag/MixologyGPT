import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, ShieldCheck } from 'lucide-react'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type Recipe = {
  id: string
  canonical_name: string
  review_status?: string | null
  quality_label?: string | null
  ingredients?: Array<{ name: string; quantity: number; unit: string; note?: string | null }> | null
}

type Moderation = {
  id: string
  recipe_id: string
  reviewer_id: string
  status: string
  quality_label?: string | null
  notes?: string | null
  overrides?: Record<string, unknown> | null
  created_at?: string | null
}

function statusBadge(status?: string | null): { label: string; className: string } {
  const normalized = (status || 'pending').toLowerCase()
  if (normalized === 'approved') return { label: 'Approved', className: 'bg-green-500/20 text-green-300 border-green-500/30' }
  if (normalized === 'rejected') return { label: 'Rejected', className: 'bg-red-500/20 text-red-300 border-red-500/30' }
  return { label: 'Pending', className: 'bg-yellow-500/20 text-yellow-200 border-yellow-500/30' }
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ''
  }
}

const DEFAULT_OVERRIDES_EXAMPLE = `{
  "canonical_name": "Example Drink Name",
  "ingredient_rows": [
    { "name": "Gin", "quantity": 2, "unit": "oz" },
    { "name": "Lemon juice", "quantity": 0.75, "unit": "oz" }
  ],
  "instructions": [
    "Shake with ice",
    "Strain into coupe"
  ]
}`

export function RecipesModerationView() {
  const [query, setQuery] = useState('')

  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [recipesLoading, setRecipesLoading] = useState(false)
  const [recipesError, setRecipesError] = useState('')

  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('')
  const selectedRecipe = useMemo(
    () => recipes.find((r) => r.id === selectedRecipeId) ?? null,
    [recipes, selectedRecipeId],
  )

  const [moderations, setModerations] = useState<Moderation[]>([])
  const [modsLoading, setModsLoading] = useState(false)
  const [modsError, setModsError] = useState('')

  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [qualityLabel, setQualityLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [overridesText, setOverridesText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    let active = true
    const handle = window.setTimeout(async () => {
      setRecipesLoading(true)
      setRecipesError('')
      try {
        const q = query.trim()
        const url = q ? `/v1/recipes?q=${encodeURIComponent(q)}` : '/v1/recipes'
        const data = await apiJson<Recipe[]>(url)
        if (!active) return
        setRecipes(data)
        if (data.length && !selectedRecipeId) setSelectedRecipeId(data[0]?.id ?? '')
      } catch (err) {
        if (!active) return
        setRecipesError(err instanceof Error ? err.message : 'Failed to load recipes.')
        setRecipes([])
      } finally {
        if (active) setRecipesLoading(false)
      }
    }, 220)
    return () => {
      active = false
      window.clearTimeout(handle)
    }
  }, [query, selectedRecipeId])

  const loadModerations = async (recipeId: string) => {
    if (!recipeId) return
    setModsLoading(true)
    setModsError('')
    try {
      const data = await apiJson<Moderation[]>(`/v1/reviews/recipes/${encodeURIComponent(recipeId)}/moderations`)
      setModerations(data)
    } catch (err) {
      setModsError(err instanceof Error ? err.message : 'Failed to load moderations.')
      setModerations([])
    } finally {
      setModsLoading(false)
    }
  }

  useEffect(() => {
    void loadModerations(selectedRecipeId)
  }, [selectedRecipeId])

  const overridesParseError = useMemo(() => {
    const raw = overridesText.trim()
    if (!raw) return ''
    try {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'Overrides must be a JSON object.'
      return ''
    } catch {
      return 'Overrides must be valid JSON.'
    }
  }, [overridesText])

  const submit = async () => {
    if (!selectedRecipeId) return
    setSaving(true)
    setSaveError('')
    try {
      if (overridesParseError) throw new Error(overridesParseError)
      const overrides = overridesText.trim() ? JSON.parse(overridesText.trim()) : undefined
      await apiJson(`/v1/reviews/recipes/${encodeURIComponent(selectedRecipeId)}/moderations`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          quality_label: qualityLabel.trim() || undefined,
          notes: notes.trim() || undefined,
          overrides,
        }),
      })
      setNotes('')
      setOverridesText('')
      await loadModerations(selectedRecipeId)
      // Refresh the recipe list so status/label changes reflect.
      const q = query.trim()
      const url = q ? `/v1/recipes?q=${encodeURIComponent(q)}` : '/v1/recipes'
      setRecipes(await apiJson<Recipe[]>(url))
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to create moderation.')
    } finally {
      setSaving(false)
    }
  }

  const selectedBadge = statusBadge(selectedRecipe?.review_status)

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">Recipe Moderation</h2>
            <p className="text-sm text-gray-400 mt-1">
              Approve, reject, and override extracted recipes. Overrides apply to recommendations and exports.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                className="w-[320px] max-w-[75vw] rounded-xl bg-white/10 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-purple-500/40"
                placeholder="Search recipes…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>
        </div>

        {recipesLoading ? <LoadState tone="loading" title="Loading recipes" message="Fetching recipes for moderation." /> : null}
        {recipesError ? (
          <LoadState
            tone="error"
            title="Recipes error"
            message={recipesError}
            actionLabel="Retry"
            onAction={() => setQuery((prev) => prev + '')}
          />
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-5">
            <div className="flex items-baseline justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Recipes</h3>
                <p className="text-sm text-gray-400 mt-1">Select a recipe to view moderation history.</p>
              </div>
              <p className="text-sm text-gray-300">{recipes.length}</p>
            </div>

            <div className="mt-4 space-y-2">
              {!recipesLoading && !recipesError && recipes.length === 0 ? (
                <LoadState
                  tone="empty"
                  title="No recipes"
                  message="Ingest or harvest recipes first, then return here to approve or override."
                />
              ) : null}
              {recipes.map((recipe) => {
                const isSelected = recipe.id === selectedRecipeId
                const badge = statusBadge(recipe.review_status)
                return (
                  <button
                    key={recipe.id}
                    type="button"
                    onClick={() => setSelectedRecipeId(recipe.id)}
                    className={[
                      'w-full text-left rounded-xl border px-4 py-3 transition-colors',
                      isSelected ? 'border-purple-500/40 bg-purple-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-white font-medium truncate">{recipe.canonical_name}</p>
                        <p className="text-xs text-gray-400 mt-1 truncate">{recipe.quality_label || 'No label'}</p>
                      </div>
                      <span className={`shrink-0 px-2 py-1 rounded-full text-[11px] border ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="lg:col-span-7 space-y-6">
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
              <div className="flex items-start justify-between gap-6 flex-wrap">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-white">
                      {selectedRecipe ? selectedRecipe.canonical_name : 'Select a recipe'}
                    </h3>
                    {selectedRecipe ? (
                      <span className={`px-2 py-1 rounded-full text-[11px] border ${selectedBadge.className}`}>
                        {selectedBadge.label}
                      </span>
                    ) : null}
                  </div>
                  {selectedRecipe ? (
                    <p className="text-sm text-gray-400 mt-1">
                      Recipe ID: <span className="text-gray-300">{selectedRecipe.id}</span>
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 mt-1">Pick a recipe from the left.</p>
                  )}
                </div>
                {selectedRecipe ? (
                  <a
                    href={`/recipes/${selectedRecipe.id}`}
                    className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white flex items-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" aria-hidden="true" />
                    View details
                  </a>
                ) : null}
              </div>

              {modsLoading ? <div className="mt-4"><LoadState tone="loading" title="Loading moderations" message="Fetching moderation history." /></div> : null}
              {modsError ? <div className="mt-4"><LoadState tone="error" title="Moderation error" message={modsError} actionLabel="Retry" onAction={() => loadModerations(selectedRecipeId)} /></div> : null}
              {!modsLoading && !modsError && selectedRecipeId && moderations.length === 0 ? (
                <div className="mt-4">
                  <LoadState tone="empty" title="No moderations yet" message="Create the first moderation decision below." />
                </div>
              ) : null}

              {!modsLoading && !modsError && moderations.length ? (
                <div className="mt-4 space-y-3">
                  {moderations.map((mod) => {
                    const badge = statusBadge(mod.status)
                    return (
                      <div key={mod.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-white font-semibold flex items-center gap-2">
                              <ShieldCheck className="w-4 h-4 text-purple-300" aria-hidden="true" />
                              {mod.status}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">{mod.quality_label || 'No label'}</p>
                          </div>
                          <span className={`shrink-0 px-2 py-1 rounded-full text-[11px] border ${badge.className}`}>
                            {badge.label}
                          </span>
                        </div>
                        {mod.notes ? <p className="mt-3 text-sm text-gray-200 whitespace-pre-wrap">{mod.notes}</p> : null}
                        {mod.overrides ? (
                          <details className="mt-3">
                            <summary className="text-xs text-gray-300 cursor-pointer">Overrides JSON</summary>
                            <pre className="mt-2 text-xs text-gray-200 bg-black/40 border border-white/10 rounded-xl p-3 overflow-auto">
                              {safeJsonStringify(mod.overrides)}
                            </pre>
                          </details>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>

            <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-white">New moderation</h3>
                <p className="text-sm text-gray-400 mt-1">Status and overrides apply immediately.</p>
              </div>

              {!selectedRecipeId ? (
                <LoadState tone="empty" title="Pick a recipe first" message="Select a recipe from the list to create a moderation decision." />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <label className="text-xs text-gray-400">Status</label>
                    <select
                      className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                      value={status}
                      onChange={(event) => setStatus(event.target.value as any)}
                    >
                      <option value="pending">pending</option>
                      <option value="approved">approved</option>
                      <option value="rejected">rejected</option>
                    </select>
                    <label className="text-xs text-gray-400">Quality label (optional)</label>
                    <input
                      className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                      placeholder="e.g. auto-approved, needs-review, premium"
                      value={qualityLabel}
                      onChange={(event) => setQualityLabel(event.target.value)}
                    />
                    <label className="text-xs text-gray-400">Notes (optional)</label>
                    <textarea
                      className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500 min-h-[92px]"
                      placeholder="Explain why you approved/rejected or what you changed."
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-gray-400">Overrides JSON (optional)</label>
                      <button
                        type="button"
                        className="text-xs text-purple-300 hover:text-purple-200"
                        onClick={() => setOverridesText(DEFAULT_OVERRIDES_EXAMPLE)}
                      >
                        Insert example
                      </button>
                    </div>
                    <textarea
                      className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-xs text-white placeholder:text-gray-500 min-h-[260px] font-mono"
                      placeholder={DEFAULT_OVERRIDES_EXAMPLE}
                      value={overridesText}
                      onChange={(event) => setOverridesText(event.target.value)}
                    />
                    {overridesParseError ? (
                      <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                        {overridesParseError}
                      </div>
                    ) : null}
                    {saveError ? (
                      <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-xl p-3">{saveError}</div>
                    ) : null}
                    <button
                      type="button"
                      onClick={submit}
                      disabled={saving || !!overridesParseError}
                      className="px-5 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium disabled:opacity-60"
                    >
                      {saving ? 'Saving…' : 'Save moderation'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

