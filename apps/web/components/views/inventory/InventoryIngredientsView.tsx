import { useEffect, useMemo, useState } from 'react'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type Ingredient = {
  id: string
  canonical_name: string
  category?: string | null
  subcategory?: string | null
  description?: string | null
  abv?: number | null
  is_alcoholic: boolean
  is_perishable: boolean
}

export function InventoryIngredientsView({ role }: { role: string }) {
  const canEdit = role === 'admin'
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [query, setQuery] = useState('')
  const [createName, setCreateName] = useState('')
  const [createCategory, setCreateCategory] = useState('')
  const [createSubcategory, setCreateSubcategory] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createIsAlcoholic, setCreateIsAlcoholic] = useState(false)
  const [createIsPerishable, setCreateIsPerishable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await apiJson<Ingredient[]>('/v1/inventory/ingredients')
      setIngredients(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ingredients.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ingredients
    return ingredients.filter((ing) => ing.canonical_name.toLowerCase().includes(q))
  }, [ingredients, query])

  const createIngredient = async () => {
    setSaving(true)
    setSaveError('')
    try {
      if (!canEdit) throw new Error('Only admins can create ingredients.')
      if (!createName.trim()) throw new Error('Canonical name is required.')
      await apiJson('/v1/inventory/ingredients', {
        method: 'POST',
        body: JSON.stringify({
          canonical_name: createName.trim(),
          category: createCategory.trim() || undefined,
          subcategory: createSubcategory.trim() || undefined,
          description: createDescription.trim() || undefined,
          is_alcoholic: createIsAlcoholic,
          is_perishable: createIsPerishable,
        }),
      })
      setCreateName('')
      setCreateCategory('')
      setCreateSubcategory('')
      setCreateDescription('')
      setCreateIsAlcoholic(false)
      setCreateIsPerishable(false)
      await load()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to create ingredient.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">Ingredients</h2>
            <p className="text-sm text-gray-400 mt-1">
              Canonical ingredient ontology used across inventory, recipes, and substitutions.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white"
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        {loading ? <LoadState tone="loading" title="Loading ingredients" message="Fetching ingredient ontology." /> : null}
        {error ? <LoadState tone="error" title="Ingredient error" message={error} actionLabel="Retry" onAction={load} /> : null}

        <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
          <h3 className="text-lg font-semibold text-white">Search</h3>
          <div className="mt-3 flex flex-col md:flex-row gap-3">
            <input
              className="flex-1 rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
              placeholder="Search canonical names…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="text-sm text-gray-400 px-2 py-2">
              Showing <span className="text-white font-semibold">{filtered.length}</span> of{' '}
              <span className="text-white font-semibold">{ingredients.length}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
            <h3 className="text-lg font-semibold text-white">Create Ingredient</h3>
            <p className="text-sm text-gray-400 mt-1">Admin-only. Use for stable, canonical naming.</p>
            <div className="mt-4 space-y-3">
              <input
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                placeholder="Canonical name (e.g., London Dry Gin)"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                disabled={!canEdit}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                  placeholder="Category (optional)"
                  value={createCategory}
                  onChange={(event) => setCreateCategory(event.target.value)}
                  disabled={!canEdit}
                />
                <input
                  className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                  placeholder="Subcategory (optional)"
                  value={createSubcategory}
                  onChange={(event) => setCreateSubcategory(event.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <textarea
                className="w-full min-h-[90px] rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                placeholder="Description (optional)"
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                disabled={!canEdit}
              />
              <div className="flex items-center gap-4 flex-wrap text-sm text-gray-300">
                <label className={`flex items-center gap-2 ${!canEdit ? 'opacity-60' : ''}`}>
                  <input
                    type="checkbox"
                    checked={createIsAlcoholic}
                    onChange={(event) => setCreateIsAlcoholic(event.target.checked)}
                    disabled={!canEdit}
                  />
                  Alcoholic
                </label>
                <label className={`flex items-center gap-2 ${!canEdit ? 'opacity-60' : ''}`}>
                  <input
                    type="checkbox"
                    checked={createIsPerishable}
                    onChange={(event) => setCreateIsPerishable(event.target.checked)}
                    disabled={!canEdit}
                  />
                  Perishable
                </label>
              </div>
              {saveError ? (
                <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                  {saveError}
                </div>
              ) : null}
              {!canEdit ? (
                <div className="text-sm text-amber-100 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                  Ingredient management is admin-only. Log in as an admin to add/edit ontology entries.
                </div>
              ) : null}
              <button
                type="button"
                onClick={createIngredient}
                className="px-5 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium disabled:opacity-60"
                disabled={!canEdit || saving}
              >
                {saving ? 'Saving…' : 'Create'}
              </button>
            </div>
          </div>

          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
            <h3 className="text-lg font-semibold text-white">Ingredient List</h3>
            <p className="text-sm text-gray-400 mt-1">Canonical names, categories, and flags.</p>
            <div className="mt-4 space-y-3">
              {!loading && !error && filtered.length === 0 ? (
                <LoadState tone="empty" title="No matches" message="Try a different search query." />
              ) : null}
              {filtered.slice(0, 60).map((ing) => (
                <div key={ing.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-white font-semibold">{ing.canonical_name}</p>
                      <p className="text-xs text-gray-400">
                        {ing.category || 'uncategorized'}
                        {ing.subcategory ? ` · ${ing.subcategory}` : ''}
                      </p>
                      {ing.description ? <p className="text-xs text-gray-500 mt-2">{ing.description}</p> : null}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      {ing.is_alcoholic ? (
                        <span className="px-2 py-1 rounded bg-purple-500/20 border border-purple-500/30 text-purple-200">
                          alcoholic
                        </span>
                      ) : null}
                      {ing.is_perishable ? (
                        <span className="px-2 py-1 rounded bg-pink-500/20 border border-pink-500/30 text-pink-200">
                          perishable
                        </span>
                      ) : null}
                      {typeof ing.abv === 'number' ? (
                        <span className="px-2 py-1 rounded bg-white/10 border border-white/10 text-gray-200">
                          abv {ing.abv}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-gray-500">id: {ing.id}</p>
                </div>
              ))}
              {filtered.length > 60 ? (
                <p className="text-xs text-gray-500">Showing first 60 results. Refine search to narrow further.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

