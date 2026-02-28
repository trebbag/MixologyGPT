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

type InventoryLot = {
  id: string
  inventory_item_id: string
  quantity: number
  unit: string
}

type InventoryEvent = {
  id: string
  inventory_item_id: string
  event_type: string
  delta_quantity: number
  unit: string
  note?: string | null
  event_time: string
}

const EVENT_TYPES = ['restock', 'consume', 'adjust', 'waste'] as const

function isLotRequired(eventType: string): boolean {
  const normalized = (eventType || '').toLowerCase()
  return normalized === 'consume' || normalized === 'adjust' || normalized === 'waste'
}

export function InventoryEventsView() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [lots, setLots] = useState<InventoryLot[]>([])
  const [events, setEvents] = useState<InventoryEvent[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [filterItemId, setFilterItemId] = useState('')
  const [filterLotId, setFilterLotId] = useState('')
  const [limit, setLimit] = useState('100')

  const [eventType, setEventType] = useState<(typeof EVENT_TYPES)[number]>('restock')
  const [eventItemId, setEventItemId] = useState('')
  const [eventLotId, setEventLotId] = useState('')
  const [eventQty, setEventQty] = useState('1')
  const [eventUnit, setEventUnit] = useState('oz')
  const [eventNote, setEventNote] = useState('')

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

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

  const itemLabel = useCallback(
    (itemId: string) => {
      const item = itemById[itemId]
      if (!item) return itemId
      const ing = ingredientById[item.ingredient_id]
      return item.display_name || ing?.canonical_name || itemId
    },
    [ingredientById, itemById],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const limitValue = Number(limit)
      const resolvedLimit = Number.isFinite(limitValue) ? Math.min(Math.max(limitValue, 1), 500) : 100
      const qs = new URLSearchParams({ limit: String(resolvedLimit) })
      if (filterItemId) qs.set('inventory_item_id', filterItemId)
      if (filterLotId) qs.set('lot_id', filterLotId)
      const [ingredientsRes, itemsRes, lotsRes, eventsRes] = await Promise.all([
        apiJson<Ingredient[]>('/v1/inventory/ingredients'),
        apiJson<InventoryItem[]>('/v1/inventory/items'),
        apiJson<InventoryLot[]>('/v1/inventory/lots'),
        apiJson<InventoryEvent[]>(`/v1/inventory/events?${qs.toString()}`),
      ])
      setIngredients(ingredientsRes)
      setItems(itemsRes)
      setLots(lotsRes)
      setEvents(eventsRes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events.')
    } finally {
      setLoading(false)
    }
  }, [filterItemId, filterLotId, limit])

  useEffect(() => {
    void load()
  }, [load])

  const lotsForEventItem = useMemo(() => lots.filter((lot) => lot.inventory_item_id === eventItemId), [eventItemId, lots])

  useEffect(() => {
    const item = eventItemId ? itemById[eventItemId] : null
    if (item?.unit) setEventUnit(item.unit)
  }, [eventItemId, itemById])

  const createDisabledReason = useMemo(() => {
    if (!eventItemId) return 'Choose an inventory item.'
    if (!eventType) return 'Choose an event type.'
    if (isLotRequired(eventType) && !eventLotId) return 'Choose a lot for consume/adjust/waste.'
    const qty = Number(eventQty)
    if (!Number.isFinite(qty) || qty === 0) return 'Quantity must be a non-zero number.'
    if ((eventType === 'restock' || eventType === 'consume' || eventType === 'waste') && qty < 0) {
      return 'Use a positive quantity for restock/consume/waste.'
    }
    if (!eventUnit.trim()) return 'Unit is required.'
    return ''
  }, [eventItemId, eventLotId, eventQty, eventType, eventUnit])

  const createEvent = useCallback(async () => {
    setCreating(true)
    setCreateError('')
    try {
      const qty = Number(eventQty)
      if (!Number.isFinite(qty) || qty === 0) throw new Error('Quantity must be a non-zero number.')
      const payload: Record<string, unknown> = {
        event_type: eventType,
        quantity: qty,
        unit: eventUnit.trim(),
        note: eventNote.trim() || undefined,
        inventory_item_id: eventItemId,
      }
      if (eventLotId) payload.lot_id = eventLotId
      await apiJson('/v1/inventory/events', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setEventNote('')
      setEventQty('1')
      if (eventType === 'restock') {
        setEventLotId('')
      }
      await load()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create event.')
    } finally {
      setCreating(false)
    }
  }, [eventItemId, eventLotId, eventNote, eventQty, eventType, eventUnit, load])

  const rows = useMemo(() => {
    return events.map((ev) => ({
      ...ev,
      itemName: itemLabel(ev.inventory_item_id),
    }))
  }, [events, itemLabel])

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">Inventory Events</h2>
            <p className="text-sm text-gray-400 mt-1">Restocks, consumption, adjustments, and waste.</p>
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

        {loading ? <LoadState tone="loading" title="Loading events" message="Fetching lots and event history." /> : null}
        {error ? <LoadState tone="error" title="Events error" message={error} actionLabel="Retry" onAction={load} /> : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Filters</h3>
              <p className="text-sm text-gray-400 mt-1">Narrow down events by item/lot.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                value={filterItemId}
                onChange={(event) => setFilterItemId(event.target.value)}
              >
                <option value="">All items…</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {itemLabel(item.id)}
                  </option>
                ))}
              </select>
              <select
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                value={filterLotId}
                onChange={(event) => setFilterLotId(event.target.value)}
              >
                <option value="">All lots…</option>
                {lots
                  .filter((lot) => (filterItemId ? lot.inventory_item_id === filterItemId : true))
                  .slice(0, 200)
                  .map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      {itemLabel(lot.inventory_item_id)} · {lot.quantity} {lot.unit}
                    </option>
                  ))}
              </select>
              <input
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                placeholder="Limit (max 500)"
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
              />
              <button
                type="button"
                onClick={load}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white disabled:opacity-60"
                disabled={loading}
              >
                Apply
              </button>
            </div>
          </div>

          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Log Event</h3>
              <p className="text-sm text-gray-400 mt-1">Create a new inventory event (restock/consume/adjust/waste).</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                value={eventType}
                onChange={(event) => setEventType(event.target.value as any)}
              >
                {EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                value={eventItemId}
                onChange={(event) => {
                  setEventItemId(event.target.value)
                  setEventLotId('')
                }}
              >
                <option value="">Choose item…</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {itemLabel(item.id)}
                  </option>
                ))}
              </select>
              <select
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white disabled:opacity-60"
                value={eventLotId}
                onChange={(event) => setEventLotId(event.target.value)}
                disabled={!eventItemId || !lotsForEventItem.length}
              >
                <option value="">
                  {eventItemId ? (lotsForEventItem.length ? 'Choose lot (optional)…' : 'No lots available…') : 'Choose item first…'}
                </option>
                {lotsForEventItem.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.quantity} {lot.unit} · {lot.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                  placeholder="Qty"
                  value={eventQty}
                  onChange={(event) => setEventQty(event.target.value)}
                  inputMode="decimal"
                />
                <input
                  className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                  placeholder="Unit (oz, ml)"
                  value={eventUnit}
                  onChange={(event) => setEventUnit(event.target.value)}
                />
              </div>
              <input
                className="md:col-span-2 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                placeholder="Note (optional)"
                value={eventNote}
                onChange={(event) => setEventNote(event.target.value)}
              />
            </div>

            {createError ? (
              <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-xl p-3">{createError}</div>
            ) : null}

            <div className="flex items-center justify-between gap-4 flex-wrap">
              <button
                type="button"
                onClick={createEvent}
                disabled={creating || loading || Boolean(createDisabledReason)}
                className="px-5 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium disabled:opacity-60"
              >
                {creating ? 'Saving…' : 'Save Event'}
              </button>
              {createDisabledReason ? <p className="text-xs text-gray-400">{createDisabledReason}</p> : null}
            </div>
            {isLotRequired(eventType) ? (
              <p className="text-xs text-gray-500">
                For <span className="font-semibold text-gray-300">{eventType}</span>, choose a lot. Quantity is treated as positive (consume/waste) or non-zero (adjust).
              </p>
            ) : (
              <p className="text-xs text-gray-500">
                For <span className="font-semibold text-gray-300">restock</span>, you can omit lot_id to create a new lot.
              </p>
            )}
          </div>
        </div>

        <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
          <div className="flex items-baseline justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Event Log</h3>
              <p className="text-sm text-gray-400 mt-1">Most recent first.</p>
            </div>
            <p className="text-sm text-gray-300">{rows.length}</p>
          </div>

          <div className="mt-4 space-y-3">
            {!loading && !error && rows.length === 0 ? (
              <LoadState tone="empty" title="No events" message="Log a restock or consumption event to start tracking changes." />
            ) : null}

            {rows.map((row) => (
              <div key={row.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-white font-semibold">{row.itemName}</p>
                    <p className="text-xs text-gray-400">
                      {row.event_time} · {row.event_type}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-white font-semibold">
                      {row.delta_quantity > 0 ? '+' : ''}
                      {row.delta_quantity} {row.unit}
                    </p>
                    <p className="text-xs text-gray-500">delta</p>
                  </div>
                </div>
                {row.note ? <p className="mt-2 text-sm text-gray-300">{row.note}</p> : null}
                <p className="mt-2 text-[11px] text-gray-500 break-all">event_id: {row.id}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

