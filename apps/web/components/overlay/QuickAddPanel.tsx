import { FormEvent, useMemo, useState } from 'react'

type IngredientOption = {
  id: string
  canonical_name: string
}

type ItemOption = {
  id: string
  ingredient_id: string
  display_name?: string
}

type LotOption = {
  id: string
  inventory_item_id: string
  quantity: number
  unit: string
}

type TabKey = 'ingredient' | 'item' | 'lot' | 'event'

type QuickAddPanelProps = {
  isOpen: boolean
  onClose: () => void
  authHeaders: Record<string, string>
  ingredients: IngredientOption[]
  items: ItemOption[]
  lots: LotOption[]
  ingredientById: Record<string, string>
  itemById: Record<string, string>
  onCompleted: () => Promise<void> | void
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export function QuickAddPanel({
  isOpen,
  onClose,
  authHeaders,
  ingredients,
  items,
  lots,
  ingredientById,
  itemById,
  onCompleted,
}: QuickAddPanelProps) {
  const [tab, setTab] = useState<TabKey>('ingredient')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [ingredientName, setIngredientName] = useState('')
  const [ingredientCategory, setIngredientCategory] = useState('')
  const [ingredientSubcategory, setIngredientSubcategory] = useState('')

  const [itemIngredientId, setItemIngredientId] = useState('')
  const [itemDisplayName, setItemDisplayName] = useState('')
  const [itemUnit, setItemUnit] = useState('oz')
  const [itemPreferredUnit, setItemPreferredUnit] = useState('')
  const [itemUnitToMl, setItemUnitToMl] = useState('')

  const [lotItemId, setLotItemId] = useState('')
  const [lotQuantity, setLotQuantity] = useState('')
  const [lotUnit, setLotUnit] = useState('oz')
  const [eventLotId, setEventLotId] = useState('')
  const [eventType, setEventType] = useState<'restock' | 'consume' | 'adjust' | 'waste'>('restock')
  const [eventQuantity, setEventQuantity] = useState('')
  const [eventUnit, setEventUnit] = useState('oz')
  const [eventNote, setEventNote] = useState('')

  const postHeaders = useMemo(
    () => ({
      ...authHeaders,
      'Content-Type': 'application/json',
    }),
    [authHeaders],
  )

  const reset = () => {
    setTab('ingredient')
    setError('')
    setIngredientName('')
    setIngredientCategory('')
    setIngredientSubcategory('')
    setItemIngredientId('')
    setItemDisplayName('')
    setItemUnit('oz')
    setItemPreferredUnit('')
    setItemUnitToMl('')
    setLotItemId('')
    setLotQuantity('')
    setLotUnit('oz')
    setEventLotId('')
    setEventType('restock')
    setEventQuantity('')
    setEventUnit('oz')
    setEventNote('')
  }

  const closeAndReset = () => {
    reset()
    onClose()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!authHeaders.Authorization) {
      setError('Not authenticated yet.')
      return
    }

    setSaving(true)
    setError('')

    try {
      if (tab === 'ingredient') {
        if (!ingredientName.trim()) throw new Error('Ingredient name is required.')
        const response = await fetch(`${apiUrl}/v1/inventory/ingredients`, {
          method: 'POST',
          headers: postHeaders,
          body: JSON.stringify({
            canonical_name: ingredientName.trim(),
            category: ingredientCategory.trim() || undefined,
            subcategory: ingredientSubcategory.trim() || undefined,
          }),
        })
        if (!response.ok) throw new Error('Failed to create ingredient.')
      }

      if (tab === 'item') {
        if (!itemIngredientId) throw new Error('Ingredient is required for inventory items.')
        if (!itemUnit.trim()) throw new Error('Unit is required for inventory items.')
        const response = await fetch(`${apiUrl}/v1/inventory/items`, {
          method: 'POST',
          headers: postHeaders,
          body: JSON.stringify({
            ingredient_id: itemIngredientId,
            display_name: itemDisplayName.trim() || undefined,
            unit: itemUnit.trim(),
            preferred_unit: itemPreferredUnit.trim() || undefined,
            unit_to_ml: itemUnitToMl ? Number(itemUnitToMl) : undefined,
          }),
        })
        if (!response.ok) throw new Error('Failed to create inventory item.')
      }

      if (tab === 'lot') {
        if (!lotItemId) throw new Error('Inventory item is required for lots.')
        if (!lotQuantity) throw new Error('Lot quantity is required.')
        const response = await fetch(`${apiUrl}/v1/inventory/lots`, {
          method: 'POST',
          headers: postHeaders,
          body: JSON.stringify({
            inventory_item_id: lotItemId,
            quantity: Number(lotQuantity),
            unit: lotUnit.trim() || 'oz',
          }),
        })
        if (!response.ok) throw new Error('Failed to create lot.')
      }

      if (tab === 'event') {
        if (!eventLotId) throw new Error('Lot is required for inventory events.')
        if (!eventQuantity) throw new Error('Event quantity is required.')
        const response = await fetch(`${apiUrl}/v1/inventory/events`, {
          method: 'POST',
          headers: postHeaders,
          body: JSON.stringify({
            lot_id: eventLotId,
            event_type: eventType,
            quantity: Number(eventQuantity),
            unit: eventUnit.trim() || 'oz',
            note: eventNote.trim() || undefined,
          }),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.detail || 'Failed to create inventory event.')
        }
      }

      await onCompleted()
      closeAndReset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quick add failed.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="overlay-root" role="dialog" aria-modal="true">
      <button className="overlay-backdrop" onClick={closeAndReset} type="button" aria-label="Close quick add" />
      <form className="overlay-panel overlay-panel-large" onSubmit={submit}>
        <div className="overlay-header">
          <h2>Quick Add</h2>
          <button className="overlay-close" onClick={closeAndReset} type="button">
            Close
          </button>
        </div>

        <div className="overlay-tabs" role="tablist" aria-label="Quick add type">
          {(['ingredient', 'item', 'lot', 'event'] as TabKey[]).map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              role="tab"
              aria-selected={tab === tabKey}
              className={tab === tabKey ? 'overlay-tab is-active' : 'overlay-tab'}
              onClick={() => {
                setError('')
                setTab(tabKey)
              }}
            >
              {tabKey}
            </button>
          ))}
        </div>

        <div className="overlay-body">
          {tab === 'ingredient' && (
            <div className="overlay-field-grid">
              <label>
                Canonical name
                <input value={ingredientName} onChange={(event) => setIngredientName(event.target.value)} required />
              </label>
              <label>
                Category
                <input value={ingredientCategory} onChange={(event) => setIngredientCategory(event.target.value)} />
              </label>
              <label>
                Subcategory
                <input value={ingredientSubcategory} onChange={(event) => setIngredientSubcategory(event.target.value)} />
              </label>
            </div>
          )}

          {tab === 'item' && (
            <div className="overlay-field-grid">
              <label>
                Ingredient
                <select value={itemIngredientId} onChange={(event) => setItemIngredientId(event.target.value)} required>
                  <option value="">Select ingredient</option>
                  {ingredients.map((ingredient) => (
                    <option key={ingredient.id} value={ingredient.id}>
                      {ingredient.canonical_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Display name
                <input value={itemDisplayName} onChange={(event) => setItemDisplayName(event.target.value)} />
              </label>
              <label>
                Unit
                <input value={itemUnit} onChange={(event) => setItemUnit(event.target.value)} required />
              </label>
              <label>
                Preferred unit
                <input value={itemPreferredUnit} onChange={(event) => setItemPreferredUnit(event.target.value)} />
              </label>
              <label>
                Unit to ml
                <input value={itemUnitToMl} onChange={(event) => setItemUnitToMl(event.target.value)} />
              </label>
            </div>
          )}

          {tab === 'lot' && (
            <div className="overlay-field-grid">
              <label>
                Inventory item
                <select value={lotItemId} onChange={(event) => setLotItemId(event.target.value)} required>
                  <option value="">Select item</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.display_name || ingredientById[item.ingredient_id] || item.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantity
                <input value={lotQuantity} onChange={(event) => setLotQuantity(event.target.value)} required />
              </label>
              <label>
                Unit
                <input value={lotUnit} onChange={(event) => setLotUnit(event.target.value)} required />
              </label>
            </div>
          )}

          {tab === 'event' && (
            <div className="overlay-field-grid">
              <label>
                Lot
                <select value={eventLotId} onChange={(event) => setEventLotId(event.target.value)} required>
                  <option value="">Select lot</option>
                  {lots.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      {itemById[lot.inventory_item_id] || lot.inventory_item_id} · {lot.quantity} {lot.unit}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Event type
                <select value={eventType} onChange={(event) => setEventType(event.target.value as 'restock' | 'consume' | 'adjust' | 'waste')}>
                  <option value="restock">Restock</option>
                  <option value="consume">Consume</option>
                  <option value="adjust">Adjust</option>
                  <option value="waste">Waste</option>
                </select>
              </label>
              <label>
                Quantity
                <input value={eventQuantity} onChange={(event) => setEventQuantity(event.target.value)} required />
              </label>
              <label>
                Unit
                <input value={eventUnit} onChange={(event) => setEventUnit(event.target.value)} required />
              </label>
              <label>
                Note
                <input value={eventNote} onChange={(event) => setEventNote(event.target.value)} />
              </label>
              <p className="muted">
                `adjust` accepts positive or negative values. `consume` and `waste` decrement lot quantity.
              </p>
            </div>
          )}

          {error && <p className="overlay-error">{error}</p>}
        </div>

        <div className="overlay-footer">
          <button className="shell-action-button" onClick={closeAndReset} type="button" disabled={saving}>
            Cancel
          </button>
          <button className="shell-action-button shell-action-button-primary" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}
