import { useCallback, useEffect, useMemo, useState } from 'react'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type Ingredient = {
  id: string
  canonical_name: string
}

type InventoryItem = {
  id: string
  ingredient_id: string
  display_name?: string | null
  unit: string
}

type InventoryInsights = {
  expiry_soon: Array<{ lot_id: string; item_id: string; quantity: number; unit: string; expiry_date: string }>
  low_stock: Array<{ item_id: string; total: number; unit: string }>
}

export function InventoryInsightsView() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [insights, setInsights] = useState<InventoryInsights | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const ingredientById = useMemo(() => {
    const map: Record<string, Ingredient> = {}
    for (const ing of ingredients) map[ing.id] = ing
    return map
  }, [ingredients])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ingredientsRes, itemsRes, insightsRes] = await Promise.all([
        apiJson<Ingredient[]>('/v1/inventory/ingredients'),
        apiJson<InventoryItem[]>('/v1/inventory/items'),
        apiJson<InventoryInsights>('/v1/inventory/insights'),
      ])
      setIngredients(ingredientsRes)
      setItems(itemsRes)
      setInsights(insightsRes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load insights.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const lowStockRows = useMemo(() => {
    const rows = insights?.low_stock ?? []
    return rows.map((row) => {
      const item = items.find((it) => it.id === row.item_id)
      const ingredient = item ? ingredientById[item.ingredient_id] : undefined
      const name = item?.display_name || ingredient?.canonical_name || row.item_id
      return { ...row, name }
    })
  }, [ingredientById, insights?.low_stock, items])

  const expiryRows = useMemo(() => {
    const rows = insights?.expiry_soon ?? []
    return rows.map((row) => {
      const item = items.find((it) => it.id === row.item_id)
      const ingredient = item ? ingredientById[item.ingredient_id] : undefined
      const name = item?.display_name || ingredient?.canonical_name || row.item_id
      return { ...row, name }
    })
  }, [ingredientById, insights?.expiry_soon, items])

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">Inventory Insights</h2>
            <p className="text-sm text-gray-400 mt-1">Low stock and expiry signals from your current lots.</p>
          </div>
          <button
            type="button"
            onClick={load}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white disabled:opacity-60"
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        {loading ? <LoadState tone="loading" title="Loading insights" message="Computing low stock and expiry prompts." /> : null}
        {error ? <LoadState tone="error" title="Insights error" message={error} actionLabel="Retry" onAction={load} /> : null}

        {!loading && !error && insights ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
              <div className="flex items-baseline justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">Low Stock</h3>
                  <p className="text-sm text-gray-400 mt-1">Items below the configured threshold.</p>
                </div>
                <p className="text-sm text-gray-300">{lowStockRows.length}</p>
              </div>
              <div className="mt-4 space-y-3">
                {lowStockRows.length === 0 ? (
                  <LoadState tone="success" title="All set" message="No items are currently marked low stock." />
                ) : (
                  lowStockRows.map((row) => (
                    <div key={row.item_id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-white font-semibold">{row.name}</p>
                          <p className="text-xs text-gray-400">item_id: {row.item_id}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-pink-200 font-semibold">
                            {row.total} {row.unit}
                          </p>
                          <p className="text-xs text-gray-500">remaining</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
              <div className="flex items-baseline justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">Expiry Soon</h3>
                  <p className="text-sm text-gray-400 mt-1">Lots expiring in the configured window.</p>
                </div>
                <p className="text-sm text-gray-300">{expiryRows.length}</p>
              </div>
              <div className="mt-4 space-y-3">
                {expiryRows.length === 0 ? (
                  <LoadState tone="success" title="No urgent expiries" message="No lots are currently expiring soon." />
                ) : (
                  expiryRows.map((row) => (
                    <div key={row.lot_id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-white font-semibold">{row.name}</p>
                          <p className="text-xs text-gray-400">lot_id: {row.lot_id}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-orange-200 font-semibold">{row.expiry_date}</p>
                          <p className="text-xs text-gray-500">
                            {row.quantity} {row.unit}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}

        {!loading && !error && !insights ? (
          <LoadState
            tone="empty"
            title="No insights yet"
            message="Add inventory items and lots to compute low stock and expiry prompts."
          />
        ) : null}
      </div>
    </div>
  )
}

