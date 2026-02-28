import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'

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
}

type InventoryLot = {
  id: string
  inventory_item_id: string
  quantity: number
  unit: string
  abv?: number | null
  purchase_date?: string | null
  expiry_date?: string | null
  location?: string | null
  lot_notes?: string | null
}

function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function dateInputToIso(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  return new Date(`${trimmed}T00:00:00Z`).toISOString()
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

export function InventoryLotFormView({ mode, lotId }: { mode: 'create' | 'edit'; lotId?: string }) {
  const router = useRouter()
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [lot, setLot] = useState<InventoryLot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [inventoryItemId, setInventoryItemId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('oz')
  const [abv, setAbv] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [normalizing, setNormalizing] = useState(false)
  const [normalizeError, setNormalizeError] = useState('')
  const [deleting, setDeleting] = useState(false)

  const ingredientById = useMemo(() => {
    const map: Record<string, Ingredient> = {}
    for (const ing of ingredients) map[ing.id] = ing
    return map
  }, [ingredients])

  const itemById = useMemo(() => {
    const map: Record<string, InventoryItem> = {}
    for (const item of items) map[item.id] = item
    return map
  }, [items])

  const title = mode === 'create' ? 'New Lot' : 'Edit Lot'
  const selectedItem = inventoryItemId ? itemById[inventoryItemId] : null

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

      if (mode === 'edit') {
        if (!lotId) throw new Error('Missing lot id.')
        const lotRes = await apiJson<InventoryLot>(`/v1/inventory/lots/${encodeURIComponent(lotId)}`)
        setLot(lotRes)
        setInventoryItemId(lotRes.inventory_item_id)
        setQuantity(String(lotRes.quantity ?? ''))
        setUnit(lotRes.unit ?? '')
        setAbv(lotRes.abv != null ? String(lotRes.abv) : '')
        setPurchaseDate(isoToDateInput(lotRes.purchase_date))
        setExpiryDate(isoToDateInput(lotRes.expiry_date))
        setLocation(lotRes.location ?? '')
        setNotes(lotRes.lot_notes ?? '')
      } else {
        setLot(null)
        setInventoryItemId('')
        setQuantity('1')
        setUnit('oz')
        setAbv('')
        setPurchaseDate('')
        setExpiryDate('')
        setLocation('')
        setNotes('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory data.')
    } finally {
      setLoading(false)
    }
  }, [lotId, mode])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    setSaving(true)
    setSaveError('')
    try {
      const parsedQuantity = Number(quantity)
      if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) throw new Error('Quantity must be a positive number.')
      const unitValue = unit.trim()
      if (!unitValue) throw new Error('Unit is required.')

      const payload = {
        inventory_item_id: mode === 'create' ? inventoryItemId : undefined,
        quantity: parsedQuantity,
        unit: unitValue,
        abv: normalizeOptionalNumber(abv),
        purchase_date: dateInputToIso(purchaseDate),
        expiry_date: dateInputToIso(expiryDate),
        location: normalizeOptionalString(location),
        lot_notes: normalizeOptionalString(notes),
      }

      if (mode === 'create') {
        if (!inventoryItemId) throw new Error('Choose an inventory item.')
        const created = await apiJson<InventoryLot>('/v1/inventory/lots', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        await router.push(`/inventory/lot/${created.id}`)
      } else {
        if (!lotId) throw new Error('Missing lot id.')
        await apiJson<InventoryLot>(`/v1/inventory/lots/${encodeURIComponent(lotId)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        await load()
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const normalizeLot = async () => {
    if (!lotId) return
    setNormalizing(true)
    setNormalizeError('')
    try {
      const updated = await apiJson<InventoryLot>(`/v1/inventory/lots/${encodeURIComponent(lotId)}/normalize`, {
        method: 'POST',
      })
      setLot(updated)
      setQuantity(String(updated.quantity ?? ''))
      setUnit(updated.unit ?? '')
    } catch (err) {
      setNormalizeError(err instanceof Error ? err.message : 'Normalize failed.')
    } finally {
      setNormalizing(false)
    }
  }

  const deleteLot = async () => {
    if (!lotId) return
    const ok = window.confirm('Delete this lot? This cannot be undone.')
    if (!ok) return
    setDeleting(true)
    setSaveError('')
    try {
      await apiVoid(`/v1/inventory/lots/${encodeURIComponent(lotId)}`, { method: 'DELETE' })
      await router.push('/inventory')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setDeleting(false)
    }
  }

  const itemLabel = (() => {
    if (!selectedItem) return ''
    const ingredientName = ingredientById[selectedItem.ingredient_id]?.canonical_name || selectedItem.ingredient_id
    return selectedItem.display_name || ingredientName
  })()

  return (
    <div className="p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">{title}</h2>
            {mode === 'edit' && lotId ? <p className="text-xs text-gray-500 mt-1 break-all">lot id: {lotId}</p> : null}
            {itemLabel ? <p className="text-sm text-gray-400 mt-1">{itemLabel}</p> : null}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => router.push('/inventory')}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white"
              disabled={loading || saving || deleting}
            >
              Back to Inventory
            </button>
            <button
              type="button"
              onClick={load}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white"
              disabled={loading}
            >
              Refresh
            </button>
          </div>
        </div>

        {loading ? <LoadState tone="loading" title="Loading lot" message="Fetching inventory items and lot details." /> : null}
        {error ? <LoadState tone="error" title="Lot error" message={error} actionLabel="Retry" onAction={load} /> : null}
        {saveError ? <LoadState tone="error" title="Save error" message={saveError} /> : null}
        {normalizeError ? <LoadState tone="error" title="Normalize error" message={normalizeError} /> : null}

        {!loading && !error ? (
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Lot Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-300 mb-2">Inventory Item</label>
                <select
                  className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white disabled:opacity-60"
                  value={inventoryItemId}
                  onChange={(e) => {
                    const next = e.target.value
                    setInventoryItemId(next)
                    const selected = itemById[next]
                    if (mode === 'create' && selected?.unit) {
                      setUnit(selected.unit)
                    }
                  }}
                  disabled={mode === 'edit'}
                >
                  <option value="">Choose…</option>
                  {items.map((item) => {
                    const ingredientName = ingredientById[item.ingredient_id]?.canonical_name || item.ingredient_id
                    const label = item.display_name || ingredientName
                    return (
                      <option key={item.id} value={item.id}>
                        {label}
                      </option>
                    )
                  })}
                </select>
                {mode === 'edit' ? <p className="mt-1 text-xs text-gray-500">Item cannot be changed after creation.</p> : null}
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">Quantity</label>
                <input
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                  placeholder="1"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">Unit</label>
                <input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                  placeholder="oz"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">ABV (optional)</label>
                <input
                  value={abv}
                  onChange={(e) => setAbv(e.target.value)}
                  className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                  placeholder="40"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">Location (optional)</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-gray-500"
                  placeholder="Bar cart"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">Purchase Date (optional)</label>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">Expiry Date (optional)</label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-300 mb-2">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full min-h-[90px] px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-gray-500"
                  placeholder="Bottle is half full, opened last month."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 flex-wrap">
              {mode === 'edit' ? (
                <>
                  <button
                    type="button"
                    onClick={normalizeLot}
                    className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white disabled:opacity-60"
                    disabled={normalizing || saving || deleting}
                  >
                    {normalizing ? 'Normalizing…' : 'Normalize Lot'}
                  </button>
                  <button
                    type="button"
                    onClick={deleteLot}
                    className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-200 text-sm font-medium disabled:opacity-60"
                    disabled={saving || deleting}
                  >
                    {deleting ? 'Deleting…' : 'Delete Lot'}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={save}
                className="px-6 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium disabled:opacity-60"
                disabled={saving || loading || deleting}
              >
                {saving ? 'Saving…' : mode === 'create' ? 'Create Lot' : 'Save Changes'}
              </button>
            </div>
            {mode === 'edit' ? (
              <p className="text-xs text-gray-500">
                Normalize uses the item&apos;s preferred unit. Configure it in <span className="font-semibold">Inventory → Settings</span>.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
