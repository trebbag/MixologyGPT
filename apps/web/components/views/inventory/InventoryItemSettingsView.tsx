import { useCallback, useEffect, useMemo, useState } from 'react'

import { apiJson, apiVoid } from '../../../lib/api'
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
  preferred_unit?: string | null
  unit_to_ml?: number | null
}

type ItemDraft = {
  display_name: string
  unit: string
  preferred_unit: string
  unit_to_ml: string
}

function toDraft(item: InventoryItem): ItemDraft {
  return {
    display_name: item.display_name ?? '',
    unit: item.unit ?? '',
    preferred_unit: item.preferred_unit ?? '',
    unit_to_ml: item.unit_to_ml != null ? String(item.unit_to_ml) : '',
  }
}

function normalizeOptionalString(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeOptionalNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const num = Number(trimmed)
  return Number.isFinite(num) ? num : null
}

export function InventoryItemSettingsView() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [savingId, setSavingId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string>('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const ingredientById = useMemo(() => {
    const map: Record<string, Ingredient> = {}
    for (const ing of ingredients) map[ing.id] = ing
    return map
  }, [ingredients])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ingredientsRes, itemsRes] = await Promise.all([
        apiJson<Ingredient[]>('/v1/inventory/ingredients'),
        apiJson<InventoryItem[]>('/v1/inventory/items'),
      ])
      setIngredients(ingredientsRes)
      setItems(itemsRes)
      const nextDrafts: Record<string, ItemDraft> = {}
      for (const item of itemsRes) nextDrafts[item.id] = toDraft(item)
      setDrafts(nextDrafts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory items.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async (itemId: string) => {
    const item = items.find((it) => it.id === itemId)
    const draft = drafts[itemId]
    if (!item || !draft) return

    setSavingId(itemId)
    setSaveError('')
    try {
      const unit = draft.unit.trim()
      if (!unit) throw new Error('Unit is required.')
      const unitToMl = normalizeOptionalNumber(draft.unit_to_ml)
      if (draft.unit_to_ml.trim() && unitToMl == null) throw new Error('unit_to_ml must be a number (or blank).')

      await apiJson(`/v1/inventory/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          display_name: normalizeOptionalString(draft.display_name),
          unit,
          preferred_unit: normalizeOptionalString(draft.preferred_unit),
          unit_to_ml: unitToMl,
        }),
      })
      await load()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSavingId(null)
    }
  }

  const deleteItem = async (itemId: string) => {
    const item = items.find((it) => it.id === itemId)
    if (!item) return
    const label = item.display_name || ingredientById[item.ingredient_id]?.canonical_name || item.id
    const ok = window.confirm(`Delete inventory item "${label}"? Lots tied to this item will be orphaned.`)
    if (!ok) return
    setDeletingId(itemId)
    setSaveError('')
    try {
      await apiVoid(`/v1/inventory/items/${itemId}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">Item Settings</h2>
            <p className="text-sm text-gray-400 mt-1">
              Configure your tracked inventory items (units, preferred normalization, and display names).
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

        {loading ? <LoadState tone="loading" title="Loading items" message="Fetching items and ingredient ontology." /> : null}
        {error ? <LoadState tone="error" title="Item settings error" message={error} actionLabel="Retry" onAction={load} /> : null}
        {saveError ? <LoadState tone="error" title="Action error" message={saveError} /> : null}

        {!loading && !error && items.length === 0 ? (
          <LoadState tone="empty" title="No items yet" message="Create an inventory item from the Inventory Overview page." />
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {items.map((item) => {
            const label = ingredientById[item.ingredient_id]?.canonical_name || item.ingredient_id
            const draft = drafts[item.id] ?? toDraft(item)
            const busy = savingId === item.id || deletingId === item.id
            return (
              <div key={item.id} className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{label}</h3>
                    <p className="text-xs text-gray-500 mt-1 break-all">item id: {item.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => save(item.id)}
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium disabled:opacity-60"
                      disabled={busy}
                    >
                      {savingId === item.id ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteItem(item.id)}
                      className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-200 text-sm font-medium disabled:opacity-60"
                      disabled={busy}
                    >
                      {deletingId === item.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-300 mb-2">Display Name</label>
                    <input
                      value={draft.display_name}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, display_name: e.target.value } }))}
                      className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-gray-500"
                      placeholder={label}
                      disabled={busy}
                    />
                    <p className="mt-1 text-xs text-gray-500">Optional override used in UI lists.</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-2">Unit</label>
                    <input
                      value={draft.unit}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, unit: e.target.value } }))}
                      className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                      placeholder="oz"
                      disabled={busy}
                    />
                    <p className="mt-1 text-xs text-gray-500">Base unit for lots you add for this item.</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-2">Preferred Unit</label>
                    <input
                      value={draft.preferred_unit}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, preferred_unit: e.target.value } }))}
                      className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-gray-500"
                      placeholder="ml"
                      disabled={busy}
                    />
                    <p className="mt-1 text-xs text-gray-500">Used by Normalize Lot action.</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-2">Unit to mL</label>
                    <input
                      value={draft.unit_to_ml}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, unit_to_ml: e.target.value } }))}
                      className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-gray-500"
                      placeholder="29.57"
                      disabled={busy}
                    />
                    <p className="mt-1 text-xs text-gray-500">Optional: custom conversion factor for non-standard units.</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

