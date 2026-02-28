import { useCallback, useEffect, useMemo, useState } from 'react'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type Ingredient = {
  id: string
  canonical_name: string
  category?: string | null
  subcategory?: string | null
}

type ExpiryRule = {
  id: string
  ingredient_id?: string | null
  category?: string | null
  subcategory?: string | null
  days: number
  notes?: string | null
}

type Mode = 'ingredient' | 'category'

function normalizeOptionalString(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function ExpiryRulesView() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [rules, setRules] = useState<ExpiryRule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [mode, setMode] = useState<Mode>('category')
  const [ingredientId, setIngredientId] = useState('')
  const [category, setCategory] = useState('')
  const [subcategory, setSubcategory] = useState('')
  const [days, setDays] = useState('30')
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
      const [ingredientsRes, rulesRes] = await Promise.all([
        apiJson<Ingredient[]>('/v1/inventory/ingredients'),
        apiJson<ExpiryRule[]>('/v1/inventory/expiry-rules'),
      ])
      setIngredients(ingredientsRes)
      setRules(rulesRes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load expiry rules.')
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
      const parsedDays = Number(days)
      if (!Number.isFinite(parsedDays) || parsedDays <= 0) throw new Error('Days must be a positive number.')

      if (mode === 'ingredient') {
        if (!ingredientId) throw new Error('Choose an ingredient.')
        await apiJson('/v1/inventory/expiry-rules', {
          method: 'POST',
          body: JSON.stringify({
            ingredient_id: ingredientId,
            days: parsedDays,
            notes: normalizeOptionalString(notes),
          }),
        })
      } else {
        const categoryValue = category.trim()
        if (!categoryValue) throw new Error('Category is required.')
        await apiJson('/v1/inventory/expiry-rules', {
          method: 'POST',
          body: JSON.stringify({
            category: categoryValue,
            subcategory: normalizeOptionalString(subcategory),
            days: parsedDays,
            notes: normalizeOptionalString(notes),
          }),
        })
      }

      setIngredientId('')
      setCategory('')
      setSubcategory('')
      setDays('30')
      setNotes('')
      await load()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to create rule.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">Expiry Rules</h2>
            <p className="text-sm text-gray-400 mt-1">
              Define expiry defaults by ingredient or category to auto-populate lot expiry dates.
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

        {loading ? <LoadState tone="loading" title="Loading expiry rules" message="Fetching rules and ingredient ontology." /> : null}
        {error ? <LoadState tone="error" title="Expiry rules error" message={error} actionLabel="Retry" onAction={load} /> : null}
        {saveError ? <LoadState tone="error" title="Save error" message={saveError} /> : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Create Rule</h3>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setMode('category')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'category' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                Category Rule
              </button>
              <button
                type="button"
                onClick={() => setMode('ingredient')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'ingredient' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                Ingredient Rule
              </button>
            </div>

            {mode === 'ingredient' ? (
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
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Category</label>
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-gray-500"
                    placeholder="spirit"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Subcategory (optional)</label>
                  <input
                    value={subcategory}
                    onChange={(e) => setSubcategory(e.target.value)}
                    className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-gray-500"
                    placeholder="vermouth"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">Days</label>
                <input
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                  placeholder="30"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">Notes (optional)</label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-gray-500"
                  placeholder="Refrigerate after opening"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={create}
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium disabled:opacity-60"
              disabled={saving || loading}
            >
              {saving ? 'Saving…' : 'Create Rule'}
            </button>
            <p className="text-xs text-gray-500">
              Updating/deleting rules is not wired yet (MVP scope). Add a newer rule to override behavior.
            </p>
          </div>

          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Rules</h3>
            {!loading && !error && rules.length === 0 ? (
              <LoadState tone="empty" title="No rules yet" message="Create expiry defaults to improve lot tracking." />
            ) : null}
            <div className="space-y-3">
              {rules.map((rule) => {
                const label = rule.ingredient_id
                  ? ingredientById[rule.ingredient_id]?.canonical_name || rule.ingredient_id
                  : `${rule.category || 'category'}${rule.subcategory ? ` / ${rule.subcategory}` : ''}`
                return (
                  <div key={rule.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <p className="text-white font-semibold">{label}</p>
                        {rule.notes ? <p className="text-xs text-gray-400 mt-1">{rule.notes}</p> : null}
                      </div>
                      <div className="text-right">
                        <p className="text-purple-200 font-semibold">{rule.days}d</p>
                        <p className="text-xs text-gray-500">expiry</p>
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

