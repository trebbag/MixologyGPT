import { useEffect, useMemo, useState } from 'react'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type Ingredient = { id: string; canonical_name: string }

type TabKey = 'inventory_item' | 'recipe_ingest' | 'harvest_job' | 'ingredient'

export function QuickAddOverlay({
  open,
  onClose,
  role,
  onCompleted,
}: {
  open: boolean
  onClose: () => void
  role: string
  onCompleted?: () => void
}) {
  const canCreateIngredient = role === 'admin'
  const [tab, setTab] = useState<TabKey>('inventory_item')
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loadingIngredients, setLoadingIngredients] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [itemIngredientId, setItemIngredientId] = useState('')
  const [itemUnit, setItemUnit] = useState('oz')
  const [itemPreferredUnit, setItemPreferredUnit] = useState('')
  const [itemDisplayName, setItemDisplayName] = useState('')

  const [recipeName, setRecipeName] = useState('')
  const [recipeSourceUrl, setRecipeSourceUrl] = useState('')
  const [recipeInstructions, setRecipeInstructions] = useState('')
  const [recipeRatingValue, setRecipeRatingValue] = useState('')
  const [recipeRatingCount, setRecipeRatingCount] = useState('')
  const [recipeLikeCount, setRecipeLikeCount] = useState('')
  const [recipeShareCount, setRecipeShareCount] = useState('')
  const [recipeIngredients, setRecipeIngredients] = useState<Array<{ name: string; quantity: string; unit: string }>>([
    { name: '', quantity: '2', unit: 'oz' },
  ])

  const [harvestUrl, setHarvestUrl] = useState('')

  const [ingredientName, setIngredientName] = useState('')
  const [ingredientCategory, setIngredientCategory] = useState('')
  const [ingredientSubcategory, setIngredientSubcategory] = useState('')

  const reset = () => {
    setTab('inventory_item')
    setError('')
    setItemIngredientId('')
    setItemUnit('oz')
    setItemPreferredUnit('')
    setItemDisplayName('')
    setRecipeName('')
    setRecipeSourceUrl('')
    setRecipeInstructions('')
    setRecipeRatingValue('')
    setRecipeRatingCount('')
    setRecipeLikeCount('')
    setRecipeShareCount('')
    setRecipeIngredients([{ name: '', quantity: '2', unit: 'oz' }])
    setHarvestUrl('')
    setIngredientName('')
    setIngredientCategory('')
    setIngredientSubcategory('')
  }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  useEffect(() => {
    if (!open) return
    setLoadingIngredients(true)
    setError('')
    apiJson<Ingredient[]>('/v1/inventory/ingredients')
      .then((rows) => setIngredients(rows))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load ingredients.'))
      .finally(() => setLoadingIngredients(false))
  }, [open])

  const tabs: Array<{ key: TabKey; label: string; disabled?: boolean }> = useMemo(
    () => [
      { key: 'inventory_item', label: 'Inventory Item' },
      { key: 'recipe_ingest', label: 'Recipe' },
      { key: 'harvest_job', label: 'Harvest Job' },
      { key: 'ingredient', label: 'Ingredient', disabled: !canCreateIngredient },
    ],
    [canCreateIngredient],
  )

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      if (tab === 'inventory_item') {
        if (!itemIngredientId) throw new Error('Choose an ingredient.')
        if (!itemUnit.trim()) throw new Error('Unit is required.')
        await apiJson('/v1/inventory/items', {
          method: 'POST',
          body: JSON.stringify({
            ingredient_id: itemIngredientId,
            unit: itemUnit.trim(),
            preferred_unit: itemPreferredUnit.trim() || undefined,
            display_name: itemDisplayName.trim() || undefined,
          }),
        })
      }

      if (tab === 'recipe_ingest') {
        const name = recipeName.trim()
        const url = recipeSourceUrl.trim()
        if (!name) throw new Error('Recipe name is required.')
        if (!url) throw new Error('Source URL is required.')
        const ingredientsPayload = recipeIngredients
          .map((row) => ({
            name: row.name.trim(),
            quantity: Number(row.quantity || '0'),
            unit: row.unit.trim() || 'oz',
          }))
          .filter((row) => row.name && Number.isFinite(row.quantity) && row.quantity > 0)
        if (ingredientsPayload.length === 0) throw new Error('Add at least one ingredient with a quantity.')
        const instructions = recipeInstructions
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
        if (instructions.length === 0) throw new Error('Add at least one instruction line.')

        const ratingValue = recipeRatingValue.trim() ? Number(recipeRatingValue) : undefined
        const ratingCount = recipeRatingCount.trim() ? Number(recipeRatingCount) : undefined
        const likeCount = recipeLikeCount.trim() ? Number(recipeLikeCount) : undefined
        const shareCount = recipeShareCount.trim() ? Number(recipeShareCount) : undefined

        await apiJson('/v1/recipes/ingest', {
          method: 'POST',
          body: JSON.stringify({
            source: { url, source_type: 'web' },
            canonical_name: name,
            ingredients: ingredientsPayload,
            instructions,
            rating_value: Number.isFinite(ratingValue as number) ? ratingValue : undefined,
            rating_count: Number.isFinite(ratingCount as number) ? ratingCount : undefined,
            like_count: Number.isFinite(likeCount as number) ? likeCount : undefined,
            share_count: Number.isFinite(shareCount as number) ? shareCount : undefined,
          }),
        })
      }

      if (tab === 'harvest_job') {
        const url = harvestUrl.trim()
        if (!url) throw new Error('Source URL is required.')
        await apiJson('/v1/recipes/harvest/jobs', {
          method: 'POST',
          body: JSON.stringify({ source_url: url, source_type: 'web' }),
        })
      }

      if (tab === 'ingredient') {
        if (!canCreateIngredient) throw new Error('Only admins can create ingredients.')
        if (!ingredientName.trim()) throw new Error('Canonical name is required.')
        await apiJson('/v1/inventory/ingredients', {
          method: 'POST',
          body: JSON.stringify({
            canonical_name: ingredientName.trim(),
            category: ingredientCategory.trim() || undefined,
            subcategory: ingredientSubcategory.trim() || undefined,
          }),
        })
      }

      onCompleted?.()
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quick add failed.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Quick add">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => {
          reset()
          onClose()
        }}
        aria-label="Close quick add"
      />
      <div className="relative max-w-2xl mx-auto mt-20 px-4">
        <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-5 border-b border-white/10 flex items-start justify-between gap-6 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-white">Quick Add</h2>
              <p className="text-sm text-gray-400 mt-1">Fast actions without leaving your current context.</p>
            </div>
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white"
              onClick={() => {
                reset()
                onClose()
              }}
            >
              Close
            </button>
          </div>

          <div className="px-5 pt-4 flex items-center gap-2 flex-wrap">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                disabled={t.disabled}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                  tab === t.key
                    ? 'bg-purple-500/20 text-purple-200 border border-purple-500/40'
                    : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-4">
            {loadingIngredients ? (
              <LoadState tone="loading" title="Loading ingredients" message="Preparing Quick Add…" />
            ) : null}

            {error ? (
              <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-xl p-3">{error}</div>
            ) : null}

            {tab === 'inventory_item' ? (
              <div className="space-y-3">
                <select
                  className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                  value={itemIngredientId}
                  onChange={(event) => setItemIngredientId(event.target.value)}
                >
                  <option value="">Choose ingredient…</option>
                  {ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.canonical_name}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                    placeholder="Unit (oz, ml)"
                    value={itemUnit}
                    onChange={(event) => setItemUnit(event.target.value)}
                  />
                  <input
                    className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                    placeholder="Preferred unit (optional)"
                    value={itemPreferredUnit}
                    onChange={(event) => setItemPreferredUnit(event.target.value)}
                  />
                </div>
                <input
                  className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                  placeholder="Display name (optional)"
                  value={itemDisplayName}
                  onChange={(event) => setItemDisplayName(event.target.value)}
                />
              </div>
            ) : null}

            {tab === 'recipe_ingest' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                    placeholder="Recipe name"
                    value={recipeName}
                    onChange={(event) => setRecipeName(event.target.value)}
                  />
                  <input
                    className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                    placeholder="Source URL (approved domain)"
                    value={recipeSourceUrl}
                    onChange={(event) => setRecipeSourceUrl(event.target.value)}
                    autoCapitalize="none"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-sm font-medium text-white">Ingredients</p>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white"
                      onClick={() =>
                        setRecipeIngredients((prev) => [...prev, { name: '', quantity: '1', unit: 'oz' }])
                      }
                    >
                      Add row
                    </button>
                  </div>

                  <div className="space-y-2">
                    {recipeIngredients.map((row, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2">
                        <input
                          className="col-span-6 rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                          placeholder="Ingredient"
                          value={row.name}
                          onChange={(event) =>
                            setRecipeIngredients((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, name: event.target.value } : item)),
                            )
                          }
                        />
                        <input
                          className="col-span-3 rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                          placeholder="Qty"
                          value={row.quantity}
                          onChange={(event) =>
                            setRecipeIngredients((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, quantity: event.target.value } : item)),
                            )
                          }
                        />
                        <input
                          className="col-span-2 rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                          placeholder="Unit"
                          value={row.unit}
                          onChange={(event) =>
                            setRecipeIngredients((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, unit: event.target.value } : item)),
                            )
                          }
                        />
                        <button
                          type="button"
                          className="col-span-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 text-xs disabled:opacity-40"
                          disabled={recipeIngredients.length <= 1}
                          onClick={() =>
                            setRecipeIngredients((prev) => prev.filter((_, i) => i !== idx))
                          }
                          aria-label="Remove ingredient row"
                          title={recipeIngredients.length <= 1 ? 'At least one ingredient is required.' : 'Remove row'}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <textarea
                  className="w-full min-h-[110px] rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                  placeholder={'Instructions (one step per line)\nExample: Shake with ice\nStrain into coupe'}
                  value={recipeInstructions}
                  onChange={(event) => setRecipeInstructions(event.target.value)}
                />

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input
                    className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                    placeholder="Rating value"
                    value={recipeRatingValue}
                    onChange={(event) => setRecipeRatingValue(event.target.value)}
                    inputMode="decimal"
                  />
                  <input
                    className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                    placeholder="Rating count"
                    value={recipeRatingCount}
                    onChange={(event) => setRecipeRatingCount(event.target.value)}
                    inputMode="numeric"
                  />
                  <input
                    className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                    placeholder="Likes"
                    value={recipeLikeCount}
                    onChange={(event) => setRecipeLikeCount(event.target.value)}
                    inputMode="numeric"
                  />
                  <input
                    className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                    placeholder="Shares"
                    value={recipeShareCount}
                    onChange={(event) => setRecipeShareCount(event.target.value)}
                    inputMode="numeric"
                  />
                </div>

                <p className="text-xs text-gray-500">
                  Note: ingest requires an approved source domain and popularity signals (ratings/likes/shares) per policy.
                </p>
              </div>
            ) : null}

            {tab === 'harvest_job' ? (
              <div className="space-y-3">
                <input
                  className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                  placeholder="Source URL (recipe page)"
                  value={harvestUrl}
                  onChange={(event) => setHarvestUrl(event.target.value)}
                  autoCapitalize="none"
                />
                <p className="text-xs text-gray-500">
                  This queues a single harvest job. Use the Harvest page for discovery, auto-harvest, and retries.
                </p>
              </div>
            ) : null}

            {tab === 'ingredient' ? (
              <div className="space-y-3">
                {!canCreateIngredient ? (
                  <LoadState
                    tone="empty"
                    title="Admin-only"
                    message="Ingredient ontology changes require an admin role."
                  />
                ) : null}
                <input
                  className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                  placeholder="Canonical name"
                  value={ingredientName}
                  onChange={(event) => setIngredientName(event.target.value)}
                  disabled={!canCreateIngredient}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                    placeholder="Category (optional)"
                    value={ingredientCategory}
                    onChange={(event) => setIngredientCategory(event.target.value)}
                    disabled={!canCreateIngredient}
                  />
                  <input
                    className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                    placeholder="Subcategory (optional)"
                    value={ingredientSubcategory}
                    onChange={(event) => setIngredientSubcategory(event.target.value)}
                    disabled={!canCreateIngredient}
                  />
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-4 flex-wrap pt-2">
              <p className="text-xs text-gray-500">Role: <span className="font-mono text-gray-300">{role}</span></p>
              <button
                type="button"
                onClick={submit}
                disabled={saving || loadingIngredients}
                className="px-5 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
