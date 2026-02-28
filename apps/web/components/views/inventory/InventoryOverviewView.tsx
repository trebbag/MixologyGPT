import { useEffect, useMemo, useState } from 'react'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type Ingredient = {
  id: string
  canonical_name: string
  category?: string | null
  subcategory?: string | null
}

type InventoryItem = {
  id: string
  ingredient_id: string
  display_name?: string | null
  unit: string
  preferred_unit?: string | null
  unit_to_ml?: number | null
}

type InventoryLot = {
  id: string
  inventory_item_id: string
  quantity: number
  unit: string
  expiry_date?: string | null
}

type InventoryInsights = {
  expiry_soon: Array<{ lot_id: string; item_id: string; quantity: number; unit: string; expiry_date: string }>
  low_stock: Array<{ item_id: string; total: number; unit: string }>
}

export function InventoryOverviewView({ role }: { role: string }) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [lots, setLots] = useState<InventoryLot[]>([])
  const [insights, setInsights] = useState<InventoryInsights | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [newItemIngredientId, setNewItemIngredientId] = useState('')
  const [newItemUnit, setNewItemUnit] = useState('oz')
  const [newItemPreferredUnit, setNewItemPreferredUnit] = useState('')
  const [newItemDisplayName, setNewItemDisplayName] = useState('')
  const [creatingItem, setCreatingItem] = useState(false)
  const [createItemError, setCreateItemError] = useState('')

  const ingredientById = useMemo(() => {
    const map: Record<string, Ingredient> = {}
    for (const ing of ingredients) map[ing.id] = ing
    return map
  }, [ingredients])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [ingredientsRes, itemsRes, lotsRes, insightsRes] = await Promise.all([
        apiJson<Ingredient[]>('/v1/inventory/ingredients'),
        apiJson<InventoryItem[]>('/v1/inventory/items'),
        apiJson<InventoryLot[]>('/v1/inventory/lots'),
        apiJson<InventoryInsights>('/v1/inventory/insights'),
      ])
      setIngredients(ingredientsRes)
      setItems(itemsRes)
      setLots(lotsRes)
      setInsights(insightsRes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const totalsByItemId = useMemo(() => {
    const totals: Record<string, { total: number; unit: string }> = {}
    for (const lot of lots) {
      const entry = totals[lot.inventory_item_id] ?? { total: 0, unit: lot.unit }
      entry.total += Number(lot.quantity || 0)
      totals[lot.inventory_item_id] = entry
    }
    return totals
  }, [lots])

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

  const createItem = async () => {
    setCreatingItem(true)
    setCreateItemError('')
    try {
      if (!newItemIngredientId) throw new Error('Choose an ingredient.')
      if (!newItemUnit.trim()) throw new Error('Unit is required.')
      await apiJson('/v1/inventory/items', {
        method: 'POST',
        body: JSON.stringify({
          ingredient_id: newItemIngredientId,
          unit: newItemUnit.trim(),
          preferred_unit: newItemPreferredUnit.trim() || undefined,
          display_name: newItemDisplayName.trim() || undefined,
        }),
      })
      setNewItemIngredientId('')
      setNewItemUnit('oz')
      setNewItemPreferredUnit('')
      setNewItemDisplayName('')
      await load()
    } catch (err) {
      setCreateItemError(err instanceof Error ? err.message : 'Failed to create inventory item.')
    } finally {
      setCreatingItem(false)
    }
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">Inventory</h2>
            <p className="text-sm text-gray-400 mt-1">
              Track what you have on hand and get low-stock and expiry prompts.
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

        {loading ? <LoadState tone="loading" title="Loading inventory" message="Fetching items, lots, and insights." /> : null}
        {error ? <LoadState tone="error" title="Inventory error" message={error} actionLabel="Retry" onAction={load} /> : null}

        {!loading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <div className="bg-black/40 backdrop-blur-xl rounded-xl border border-white/10 p-6">
              <p className="text-sm text-gray-400">Ingredients</p>
              <p className="text-3xl font-bold text-white mt-1">{ingredients.length}</p>
              <p className="text-xs text-gray-500 mt-2">Ontology entries (admin-managed).</p>
            </div>
            <div className="bg-black/40 backdrop-blur-xl rounded-xl border border-white/10 p-6">
              <p className="text-sm text-gray-400">Inventory Items</p>
              <p className="text-3xl font-bold text-white mt-1">{items.length}</p>
              <p className="text-xs text-gray-500 mt-2">Your tracked bottles, syrups, etc.</p>
            </div>
            <div className="bg-black/40 backdrop-blur-xl rounded-xl border border-white/10 p-6">
              <p className="text-sm text-gray-400">Lots</p>
              <p className="text-3xl font-bold text-white mt-1">{lots.length}</p>
              <p className="text-xs text-gray-500 mt-2">Purchases/containers with expiry tracking.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
            <h3 className="text-lg font-semibold text-white">Quick Add Item</h3>
            <p className="text-sm text-gray-400 mt-1">Create a new tracked item tied to an ingredient.</p>
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                  value={newItemIngredientId}
                  onChange={(event) => setNewItemIngredientId(event.target.value)}
                >
                  <option value="">Choose ingredient…</option>
                  {ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.canonical_name}
                    </option>
                  ))}
                </select>
                <input
                  className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                  placeholder="Unit (oz, ml, g)"
                  value={newItemUnit}
                  onChange={(event) => setNewItemUnit(event.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                  placeholder="Display name (optional)"
                  value={newItemDisplayName}
                  onChange={(event) => setNewItemDisplayName(event.target.value)}
                />
                <input
                  className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                  placeholder="Preferred unit (optional)"
                  value={newItemPreferredUnit}
                  onChange={(event) => setNewItemPreferredUnit(event.target.value)}
                />
              </div>

              {createItemError ? (
                <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                  {createItemError}
                </div>
              ) : null}

              <button
                type="button"
                onClick={createItem}
                disabled={creatingItem || loading}
                className="px-5 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium disabled:opacity-60"
              >
                {creatingItem ? 'Creating…' : 'Create Item'}
              </button>
              <p className="text-xs text-gray-500">
                Ingredient creation is <span className="font-semibold">admin-only</span>. Your role: <span className="font-mono">{role}</span>.
              </p>
            </div>
          </div>

          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
            <h3 className="text-lg font-semibold text-white">Low Stock</h3>
            <p className="text-sm text-gray-400 mt-1">Items below the configured threshold.</p>
            <div className="mt-4 space-y-3">
              {!insights && !loading ? (
                <LoadState tone="empty" title="No insights yet" message="Refresh to compute low stock and expiry lists." />
              ) : null}
              {insights && lowStockRows.length === 0 ? (
                <LoadState tone="success" title="Looking good" message="No items are currently marked low stock." />
              ) : null}
              {lowStockRows.map((row) => (
                <div key={row.item_id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-white font-semibold">{row.name}</p>
                      <p className="text-xs text-gray-400">Item id: {row.item_id}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-pink-200 font-semibold">
                        {row.total} {row.unit}
                      </p>
                      <p className="text-xs text-gray-500">remaining</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
          <h3 className="text-lg font-semibold text-white">Expiry Soon</h3>
          <p className="text-sm text-gray-400 mt-1">Lots expiring in the configured window.</p>
          <div className="mt-4 space-y-3">
            {insights && expiryRows.length === 0 ? (
              <LoadState tone="success" title="No expiring lots" message="Nothing is expiring soon." />
            ) : null}
            {expiryRows.map((row) => (
              <div key={row.lot_id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-white font-semibold">{row.name}</p>
                    <p className="text-xs text-gray-400">Lot: {row.lot_id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-purple-200 font-semibold">
                      {row.quantity} {row.unit}
                    </p>
                    <p className="text-xs text-gray-500">expires {new Date(row.expiry_date).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
          <h3 className="text-lg font-semibold text-white">Your Items</h3>
          <p className="text-sm text-gray-400 mt-1">Tracked inventory items and their totals.</p>
          <div className="mt-4 space-y-3">
            {!loading && !error && items.length === 0 ? (
              <LoadState tone="empty" title="No items yet" message="Create an inventory item to start tracking." />
            ) : null}
            {items.map((item) => {
              const ingredient = ingredientById[item.ingredient_id]
              const totals = totalsByItemId[item.id]
              return (
                <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-white font-semibold">
                        {item.display_name || ingredient?.canonical_name || item.id}
                      </p>
                      <p className="text-xs text-gray-400">
                        {ingredient?.canonical_name ? `Ingredient: ${ingredient.canonical_name}` : `Ingredient id: ${item.ingredient_id}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-semibold">
                        {totals ? `${Math.round(totals.total * 100) / 100} ${totals.unit}` : '—'}
                      </p>
                      <p className="text-xs text-gray-500">total in lots</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3 flex-wrap text-xs text-gray-400">
                    <span className="px-2 py-1 rounded bg-black/30 border border-white/10">unit: {item.unit}</span>
                    {item.preferred_unit ? (
                      <span className="px-2 py-1 rounded bg-black/30 border border-white/10">
                        preferred: {item.preferred_unit}
                      </span>
                    ) : null}
                    {item.unit_to_ml ? (
                      <span className="px-2 py-1 rounded bg-black/30 border border-white/10">
                        unit_to_ml: {item.unit_to_ml}
                      </span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

