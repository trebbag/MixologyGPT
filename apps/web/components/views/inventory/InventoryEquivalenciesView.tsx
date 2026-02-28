import { useCallback, useEffect, useMemo, useState } from 'react'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type Ingredient = {
  id: string
  canonical_name: string
  category?: string | null
  subcategory?: string | null
}

type Equivalency = {
  id: string
  ingredient_id: string
  equivalent_ingredient_id: string
  ratio: number
  notes?: string | null
}

export function InventoryEquivalenciesView() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [equivalencies, setEquivalencies] = useState<Equivalency[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [ingredientId, setIngredientId] = useState('')
  const [equivalentId, setEquivalentId] = useState('')
  const [ratio, setRatio] = useState('1')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const ingredientById = useMemo(() => {
    const map: Record<string, Ingredient> = {}
    for (const ing of ingredients) map[ing.id] = ing
    return map
  }, [ingredients])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ingredientsRes, equivalenciesRes] = await Promise.all([
        apiJson<Ingredient[]>('/v1/inventory/ingredients'),
        apiJson<Equivalency[]>('/v1/inventory/equivalencies'),
      ])
      setIngredients(ingredientsRes)
      setEquivalencies(equivalenciesRes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load equivalencies.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const create = async () => {
    setSaving(true)
    setSaveError('')
    try {
      if (!ingredientId) throw new Error('Choose an ingredient.')
      if (!equivalentId) throw new Error('Choose an equivalent ingredient.')
      if (ingredientId === equivalentId) throw new Error('Choose two different ingredients.')
      const parsedRatio = Number(ratio)
      if (!Number.isFinite(parsedRatio) || parsedRatio <= 0) throw new Error('Ratio must be a positive number.')

      await apiJson('/v1/inventory/equivalencies', {
        method: 'POST',
        body: JSON.stringify({
          ingredient_id: ingredientId,
          equivalent_ingredient_id: equivalentId,
          ratio: parsedRatio,
          notes: notes.trim() || null,
        }),
      })
      setIngredientId('')
      setEquivalentId('')
      setRatio('1')
      setNotes('')
      await load()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to create equivalency.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">Ingredient Equivalencies</h2>
            <p className="text-sm text-gray-400 mt-1">
              Define substitutions and ratios for the steward and recommendation engine.
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

        {loading ? (
          <LoadState tone="loading" title="Loading equivalencies" message="Fetching ingredients and equivalency rules." />
        ) : null}
        {error ? <LoadState tone="error" title="Equivalencies error" message={error} actionLabel="Retry" onAction={load} /> : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Add Equivalency</h3>
            {saveError ? <LoadState tone="error" title="Save error" message={saveError} /> : null}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">Ingredient</label>
                <select
                  className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                  value={ingredientId}
                  onChange={(e) => setIngredientId(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.canonical_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">Equivalent Ingredient</label>
                <select
                  className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                  value={equivalentId}
                  onChange={(e) => setEquivalentId(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.canonical_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">Ratio</label>
                <input
                  value={ratio}
                  onChange={(e) => setRatio(e.target.value)}
                  className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                  placeholder="1"
                />
                <p className="mt-1 text-xs text-gray-500">1.0 means 1:1 substitution.</p>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">Notes (optional)</label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-gray-500"
                  placeholder="Only for stirred drinks"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={create}
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium disabled:opacity-60"
              disabled={saving || loading}
            >
              {saving ? 'Saving…' : 'Create Equivalency'}
            </button>
            <p className="text-xs text-gray-500">
              Deleting/updating equivalencies is not wired yet (MVP scope). Create a new record to supersede a prior one.
            </p>
          </div>

          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Rules</h3>
            {!loading && !error && equivalencies.length === 0 ? (
              <LoadState
                tone="empty"
                title="No equivalencies yet"
                message="Create your first substitution rule to improve recommendations and studio fixes."
              />
            ) : null}
            <div className="space-y-3">
              {equivalencies.map((eq) => {
                const left = ingredientById[eq.ingredient_id]?.canonical_name || eq.ingredient_id
                const right = ingredientById[eq.equivalent_ingredient_id]?.canonical_name || eq.equivalent_ingredient_id
                return (
                  <div key={eq.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <p className="text-white font-semibold">
                          {left} → {right}
                        </p>
                        {eq.notes ? <p className="text-xs text-gray-400 mt-1">{eq.notes}</p> : null}
                      </div>
                      <div className="text-right">
                        <p className="text-purple-200 font-semibold">{eq.ratio.toFixed(2)}x</p>
                        <p className="text-xs text-gray-500">ratio</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

