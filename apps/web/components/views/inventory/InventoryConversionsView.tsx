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
  preferred_unit?: string | null
  unit_to_ml?: number | null
}

type InventoryLot = {
  id: string
  inventory_item_id: string
  quantity: number
  unit: string
}

type ConversionPlan = {
  input: { ingredient: string; quantity: number; unit: string }
  output: { ingredient: string; quantity: number; unit: string }
  steps: Array<{ instruction: string }>
}

type ConversionExecuteResult = { status: string; output_lot_id?: string }

const RATIOS = ['none', '1:1', '2:1'] as const

export function InventoryConversionsView() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [lots, setLots] = useState<InventoryLot[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [planInputIngredientId, setPlanInputIngredientId] = useState('')
  const [planOutputIngredientId, setPlanOutputIngredientId] = useState('')
  const [planInputQty, setPlanInputQty] = useState('8')
  const [planInputUnit, setPlanInputUnit] = useState('oz')
  const [planOutputQty, setPlanOutputQty] = useState('')
  const [planOutputUnit, setPlanOutputUnit] = useState('oz')
  const [planRatio, setPlanRatio] = useState<(typeof RATIOS)[number]>('1:1')
  const [plan, setPlan] = useState<ConversionPlan | null>(null)
  const [planning, setPlanning] = useState(false)
  const [planError, setPlanError] = useState('')

  const [execInputLotId, setExecInputLotId] = useState('')
  const [execOutputItemId, setExecOutputItemId] = useState('')
  const [execInputQty, setExecInputQty] = useState('8')
  const [execInputUnit, setExecInputUnit] = useState('oz')
  const [execOutputQty, setExecOutputQty] = useState('')
  const [execOutputUnit, setExecOutputUnit] = useState('oz')
  const [execRatio, setExecRatio] = useState<(typeof RATIOS)[number]>('1:1')
  const [executing, setExecuting] = useState(false)
  const [execError, setExecError] = useState('')
  const [execResult, setExecResult] = useState<ConversionExecuteResult | null>(null)

  const ingredientById = useMemo(() => {
    const map: Record<string, Ingredient> = {}
    for (const ing of ingredients) map[ing.id] = ing
    return map
  }, [ingredients])

  const itemById = useMemo(() => {
    const map: Record<string, InventoryItem> = {}
    for (const it of items) map[it.id] = it
    return map
  }, [items])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ingredientsRes, itemsRes, lotsRes] = await Promise.all([
        apiJson<Ingredient[]>('/v1/inventory/ingredients'),
        apiJson<InventoryItem[]>('/v1/inventory/items'),
        apiJson<InventoryLot[]>('/v1/inventory/lots'),
      ])
      setIngredients(ingredientsRes)
      setItems(itemsRes)
      setLots(lotsRes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversion inputs.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const lot = execInputLotId ? lots.find((l) => l.id === execInputLotId) : null
    if (!lot) return
    const item = itemById[lot.inventory_item_id]
    if (item?.unit) setExecInputUnit(item.unit)
  }, [execInputLotId, itemById, lots])

  useEffect(() => {
    const item = execOutputItemId ? itemById[execOutputItemId] : null
    if (!item) return
    if (item.unit) setExecOutputUnit(item.unit)
  }, [execOutputItemId, itemById])

  const planDisabledReason = useMemo(() => {
    if (!planInputIngredientId || !planOutputIngredientId) return 'Choose input + output ingredients.'
    const qty = Number(planInputQty)
    if (!Number.isFinite(qty) || qty <= 0) return 'Input quantity must be > 0.'
    if (!planInputUnit.trim() || !planOutputUnit.trim()) return 'Units are required.'
    if (planRatio !== 'none' && !RATIOS.includes(planRatio)) return 'Choose a valid ratio.'
    if (planOutputQty.trim()) {
      const outQty = Number(planOutputQty)
      if (!Number.isFinite(outQty) || outQty <= 0) return 'Output quantity must be > 0.'
    }
    return ''
  }, [planInputIngredientId, planInputQty, planInputUnit, planOutputIngredientId, planOutputQty, planOutputUnit, planRatio])

  const createPlan = useCallback(async () => {
    setPlanning(true)
    setPlanError('')
    setPlan(null)
    try {
      const payload: Record<string, unknown> = {
        input_ingredient_id: planInputIngredientId,
        output_ingredient_id: planOutputIngredientId,
        input_quantity: Number(planInputQty),
        input_unit: planInputUnit.trim(),
        output_unit: planOutputUnit.trim(),
        ratio: planRatio === 'none' ? undefined : planRatio,
      }
      if (planOutputQty.trim()) {
        payload.output_quantity = Number(planOutputQty)
      }
      const planRes = await apiJson<ConversionPlan>('/v1/inventory/conversion-plans', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setPlan(planRes)
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Failed to create conversion plan.')
    } finally {
      setPlanning(false)
    }
  }, [planInputIngredientId, planInputQty, planInputUnit, planOutputIngredientId, planOutputQty, planOutputUnit, planRatio])

  const execDisabledReason = useMemo(() => {
    if (!execInputLotId) return 'Choose an input lot.'
    if (!execOutputItemId) return 'Choose an output inventory item.'
    const qty = Number(execInputQty)
    if (!Number.isFinite(qty) || qty <= 0) return 'Input quantity must be > 0.'
    if (!execInputUnit.trim() || !execOutputUnit.trim()) return 'Units are required.'
    if (execOutputQty.trim()) {
      const outQty = Number(execOutputQty)
      if (!Number.isFinite(outQty) || outQty <= 0) return 'Output quantity must be > 0.'
    }
    return ''
  }, [execInputLotId, execInputQty, execInputUnit, execOutputItemId, execOutputQty, execOutputUnit])

  const execute = useCallback(async () => {
    setExecuting(true)
    setExecError('')
    setExecResult(null)
    try {
      const payload: Record<string, unknown> = {
        input_lot_id: execInputLotId,
        output_inventory_item_id: execOutputItemId,
        input_quantity: Number(execInputQty),
        input_unit: execInputUnit.trim(),
        output_unit: execOutputUnit.trim(),
        ratio: execRatio === 'none' ? undefined : execRatio,
      }
      if (execOutputQty.trim()) payload.output_quantity = Number(execOutputQty)
      const res = await apiJson<ConversionExecuteResult>('/v1/inventory/conversion-execute', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setExecResult(res)
      await load()
    } catch (err) {
      setExecError(err instanceof Error ? err.message : 'Conversion failed.')
    } finally {
      setExecuting(false)
    }
  }, [execInputLotId, execInputQty, execInputUnit, execOutputItemId, execOutputQty, execOutputUnit, execRatio, load])

  const lotLabel = useCallback(
    (lot: InventoryLot) => {
      const item = itemById[lot.inventory_item_id]
      const ing = item ? ingredientById[item.ingredient_id] : undefined
      const name = item?.display_name || ing?.canonical_name || lot.inventory_item_id
      return `${name} · ${lot.quantity} ${lot.unit}`
    },
    [ingredientById, itemById],
  )

  const itemLabel = useCallback(
    (itemId: string) => {
      const item = itemById[itemId]
      if (!item) return itemId
      const ing = ingredientById[item.ingredient_id]
      return item.display_name || ing?.canonical_name || itemId
    },
    [ingredientById, itemById],
  )

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">Conversions</h2>
            <p className="text-sm text-gray-400 mt-1">Plan and execute conversions like syrup batches or house preps.</p>
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

        {loading ? <LoadState tone="loading" title="Loading conversion inputs" message="Fetching ingredients, items, and lots." /> : null}
        {error ? <LoadState tone="error" title="Conversion error" message={error} actionLabel="Retry" onAction={load} /> : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Plan Conversion</h3>
              <p className="text-sm text-gray-400 mt-1">Preview yields and steps. (Does not modify inventory.)</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                value={planInputIngredientId}
                onChange={(event) => setPlanInputIngredientId(event.target.value)}
              >
                <option value="">Input ingredient…</option>
                {ingredients.map((ing) => (
                  <option key={ing.id} value={ing.id}>
                    {ing.canonical_name}
                  </option>
                ))}
              </select>
              <select
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                value={planOutputIngredientId}
                onChange={(event) => setPlanOutputIngredientId(event.target.value)}
              >
                <option value="">Output ingredient…</option>
                {ingredients.map((ing) => (
                  <option key={ing.id} value={ing.id}>
                    {ing.canonical_name}
                  </option>
                ))}
              </select>
              <input
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                placeholder="Input qty"
                value={planInputQty}
                onChange={(event) => setPlanInputQty(event.target.value)}
                inputMode="decimal"
              />
              <input
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                placeholder="Input unit (oz, ml)"
                value={planInputUnit}
                onChange={(event) => setPlanInputUnit(event.target.value)}
              />
              <input
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                placeholder="Output qty (optional)"
                value={planOutputQty}
                onChange={(event) => setPlanOutputQty(event.target.value)}
                inputMode="decimal"
              />
              <input
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                placeholder="Output unit (oz, ml)"
                value={planOutputUnit}
                onChange={(event) => setPlanOutputUnit(event.target.value)}
              />
              <select
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                value={planRatio}
                onChange={(event) => setPlanRatio(event.target.value as any)}
              >
                {RATIOS.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    ratio: {ratio}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={createPlan}
                disabled={planning || Boolean(planDisabledReason)}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white disabled:opacity-60"
              >
                {planning ? 'Planning…' : 'Create Plan'}
              </button>
            </div>
            {planDisabledReason ? <p className="text-xs text-gray-400">{planDisabledReason}</p> : null}
            {planError ? (
              <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-xl p-3">{planError}</div>
            ) : null}
            {plan ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-white font-semibold">
                  {plan.input.quantity} {plan.input.unit} {plan.input.ingredient} → {plan.output.quantity.toFixed(2)} {plan.output.unit}{' '}
                  {plan.output.ingredient}
                </p>
                <ol className="mt-3 space-y-2 list-decimal list-inside text-sm text-gray-200">
                  {plan.steps.map((step, idx) => (
                    <li key={idx}>{step.instruction}</li>
                  ))}
                </ol>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-purple-300 hover:text-purple-200">Raw JSON</summary>
                  <pre className="mt-2 text-xs text-gray-200 bg-black/30 border border-white/10 rounded-lg p-3 overflow-auto">
{JSON.stringify(plan, null, 2)}
                  </pre>
                </details>
              </div>
            ) : null}
          </div>

          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Execute Conversion</h3>
              <p className="text-sm text-gray-400 mt-1">Consumes from an input lot and creates an output lot.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                value={execInputLotId}
                onChange={(event) => setExecInputLotId(event.target.value)}
              >
                <option value="">Input lot…</option>
                {lots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lotLabel(lot)}
                  </option>
                ))}
              </select>
              <select
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                value={execOutputItemId}
                onChange={(event) => setExecOutputItemId(event.target.value)}
              >
                <option value="">Output inventory item…</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {itemLabel(item.id)}
                  </option>
                ))}
              </select>
              <input
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                placeholder="Input qty"
                value={execInputQty}
                onChange={(event) => setExecInputQty(event.target.value)}
                inputMode="decimal"
              />
              <input
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                placeholder="Input unit"
                value={execInputUnit}
                onChange={(event) => setExecInputUnit(event.target.value)}
              />
              <input
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                placeholder="Output qty (optional)"
                value={execOutputQty}
                onChange={(event) => setExecOutputQty(event.target.value)}
                inputMode="decimal"
              />
              <input
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                placeholder="Output unit"
                value={execOutputUnit}
                onChange={(event) => setExecOutputUnit(event.target.value)}
              />
              <select
                className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                value={execRatio}
                onChange={(event) => setExecRatio(event.target.value as any)}
              >
                {RATIOS.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    ratio: {ratio}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={execute}
                disabled={executing || Boolean(execDisabledReason)}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium disabled:opacity-60"
              >
                {executing ? 'Executing…' : 'Execute'}
              </button>
            </div>
            {execDisabledReason ? <p className="text-xs text-gray-400">{execDisabledReason}</p> : null}
            {execError ? (
              <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-xl p-3">{execError}</div>
            ) : null}
            {execResult ? (
              <LoadState
                tone="success"
                title="Conversion complete"
                message={execResult.output_lot_id ? `Created output lot ${execResult.output_lot_id}.` : 'Conversion succeeded.'}
              />
            ) : null}
          </div>
        </div>

        {!loading && !error && items.length === 0 ? (
          <LoadState
            tone="empty"
            title="No inventory items"
            message="Create inventory items first (Inventory → Overview) before executing conversions."
          />
        ) : null}
      </div>
    </div>
  )
}

