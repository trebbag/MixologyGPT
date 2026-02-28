import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardCopy, Sparkles } from 'lucide-react'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type RecipeRow = { id: string; canonical_name: string }

type DraftPick = {
  id: string
  name: string
  avg_rating?: number | null
  ingredients?: Array<{ name: string; quantity?: number; unit?: string }> | null
}

type PartyMenuGenerateResponse = {
  shopping_list: Array<{ name: string; quantity: number; unit: string }>
  missing: Array<{ name: string; quantity: number; unit: string }>
  batch_plan: Array<Record<string, unknown>>
}

function formatQty(qty: number, unit: string): string {
  const safeQty = Number.isFinite(qty) ? qty : 0
  const rounded = safeQty >= 10 ? Math.round(safeQty) : Math.round(safeQty * 100) / 100
  return `${rounded} ${unit}`
}

export function PartyView() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [draftPicks, setDraftPicks] = useState<DraftPick[]>([])
  const [recipes, setRecipes] = useState<RecipeRow[]>([])
  const [query, setQuery] = useState('')

  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({})

  const [guestCount, setGuestCount] = useState('8')
  const [servingsPerGuest, setServingsPerGuest] = useState('1')
  const [dilution, setDilution] = useState('0.2')
  const [reserveOz, setReserveOz] = useState('1')

  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [generated, setGenerated] = useState<PartyMenuGenerateResponse | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [picks, allRecipes] = await Promise.all([
        apiJson<DraftPick[]>('/v1/recommendations/party-menus/draft-picks?limit=6&inventory_only=true'),
        apiJson<RecipeRow[]>('/v1/recipes'),
      ])
      setDraftPicks(picks)
      setRecipes(allRecipes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load party data.')
      setDraftPicks([])
      setRecipes([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const selectedRecipeIds = useMemo(() => Object.entries(selectedIds).filter(([, v]) => v).map(([k]) => k), [selectedIds])

  const recipeMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return recipes.slice(0, 40)
    return recipes.filter((r) => r.canonical_name.toLowerCase().includes(q)).slice(0, 40)
  }, [query, recipes])

  const toggle = (id: string) => setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }))

  const generate = useCallback(async () => {
    setGenerating(true)
    setGenerateError('')
    setGenerated(null)
    try {
      if (selectedRecipeIds.length === 0) throw new Error('Select at least one recipe.')
      const g = Number(guestCount)
      const spg = Number(servingsPerGuest)
      const dil = Number(dilution)
      const reserve = Number(reserveOz)
      if (!Number.isFinite(g) || g <= 0) throw new Error('Guest count must be a positive number.')
      if (!Number.isFinite(spg) || spg <= 0) throw new Error('Servings per guest must be a positive number.')
      if (!Number.isFinite(dil) || dil < 0 || dil > 0.6) throw new Error('Dilution should be between 0.0 and 0.6.')
      if (!Number.isFinite(reserve) || reserve < 0) throw new Error('Reserve (oz) must be >= 0.')
      const payload = {
        recipe_ids: selectedRecipeIds,
        guest_count: g,
        servings_per_guest: spg,
        dilution: dil,
        reserve_oz: reserve,
      }
      const res = await apiJson<PartyMenuGenerateResponse>('/v1/recommendations/party-menus/generate', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setGenerated(res)
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate party menu.')
    } finally {
      setGenerating(false)
    }
  }, [dilution, guestCount, reserveOz, selectedRecipeIds, servingsPerGuest])

  const copyShoppingList = async () => {
    if (!generated?.shopping_list?.length) return
    const lines = generated.shopping_list.map((i) => `- ${i.name}: ${formatQty(i.quantity, i.unit)}`)
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
    } catch {
      // Swallow; clipboard permissions vary.
    }
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">Party</h2>
            <p className="text-sm text-gray-400 mt-1">Draft a menu, generate batch math, and get a shopping list.</p>
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

        {loading ? <LoadState tone="loading" title="Loading party tools" message="Fetching draft picks and recipes." /> : null}
        {error ? <LoadState tone="error" title="Party error" message={error} actionLabel="Retry" onAction={load} /> : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 lg:col-span-2">
            <div className="flex items-baseline justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Draft picks</h3>
                <p className="text-sm text-gray-400 mt-1">Auto-suggested recipes based on ratings and inventory feasibility.</p>
              </div>
              <p className="text-sm text-gray-300">{draftPicks.length}</p>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {!loading && !error && draftPicks.length === 0 ? (
                <div className="md:col-span-2">
                  <LoadState tone="empty" title="No draft picks yet" message="Ingest more recipes and add reviews to rank party picks." />
                </div>
              ) : null}
              {draftPicks.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={[
                    'rounded-xl border p-4 text-left transition-colors',
                    selectedIds[p.id] ? 'border-purple-500/40 bg-purple-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-white font-semibold truncate">{p.name}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Avg rating: {typeof p.avg_rating === 'number' ? p.avg_rating.toFixed(1) : '—'} ·{' '}
                        {(p.ingredients?.length ?? 0) + ' ingredients'}
                      </p>
                    </div>
                    <div className="text-xs text-gray-300">{selectedIds[p.id] ? 'Selected' : 'Pick'}</div>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm text-gray-300 font-medium">Or search the library</p>
                  <p className="text-xs text-gray-500">Select up to 40 results.</p>
                </div>
                <input
                  className="w-[320px] max-w-[75vw] rounded-xl bg-white/10 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-purple-500/40"
                  placeholder="Search recipes…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                {recipeMatches.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggle(r.id)}
                    className={[
                      'rounded-xl border px-4 py-3 text-left transition-colors',
                      selectedIds[r.id] ? 'border-purple-500/40 bg-purple-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm text-white truncate">{r.canonical_name}</p>
                      <p className="text-xs text-gray-400">{selectedIds[r.id] ? 'Selected' : ''}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-pink-300" aria-hidden="true" />
              Menu generator
            </h3>
            <p className="text-sm text-gray-400 mt-1">Guest math, dilution, reserve rules, and shopping list.</p>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400">Guests</label>
                  <input
                    className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                    inputMode="numeric"
                    value={guestCount}
                    onChange={(e) => setGuestCount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Servings/guest</label>
                  <input
                    className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                    inputMode="numeric"
                    value={servingsPerGuest}
                    onChange={(e) => setServingsPerGuest(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Dilution</label>
                  <input
                    className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                    inputMode="decimal"
                    value={dilution}
                    onChange={(e) => setDilution(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Reserve (oz)</label>
                  <input
                    className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm text-white"
                    inputMode="decimal"
                    value={reserveOz}
                    onChange={(e) => setReserveOz(e.target.value)}
                  />
                </div>
              </div>

              {generateError ? (
                <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-xl p-3">{generateError}</div>
              ) : null}

              <button
                type="button"
                onClick={generate}
                disabled={generating || selectedRecipeIds.length === 0}
                className="w-full px-5 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium disabled:opacity-60"
              >
                {generating ? 'Generating…' : `Generate (${selectedRecipeIds.length} selected)`}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-lg font-semibold text-white">Results</h3>
              <p className="text-sm text-gray-400 mt-1">Shopping list and batch plan.</p>
            </div>
            <button
              type="button"
              onClick={copyShoppingList}
              disabled={!generated?.shopping_list?.length}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white disabled:opacity-60 flex items-center gap-2"
            >
              <ClipboardCopy className="w-4 h-4" aria-hidden="true" />
              Copy shopping list
            </button>
          </div>

          {!generated ? (
            <div className="mt-4">
              <LoadState
                tone="empty"
                title="No menu generated"
                message="Select recipes and generate to see shopping list, missing items, and batch plan."
              />
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-white font-semibold">Shopping list</p>
                <p className="text-xs text-gray-400 mt-1">{generated.shopping_list.length} items</p>
                <div className="mt-3 space-y-2">
                  {generated.shopping_list.map((i) => (
                    <div key={`${i.name}-${i.unit}`} className="flex items-start justify-between gap-3">
                      <p className="text-sm text-gray-200">{i.name}</p>
                      <p className="text-xs text-gray-400">{formatQty(i.quantity, i.unit)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-white font-semibold">Missing after reserve</p>
                <p className="text-xs text-gray-400 mt-1">{generated.missing.length} items</p>
                <div className="mt-3 space-y-2">
                  {generated.missing.length === 0 ? <p className="text-sm text-gray-400">Nothing missing.</p> : null}
                  {generated.missing.map((i) => (
                    <div key={`${i.name}-${i.unit}`} className="flex items-start justify-between gap-3">
                      <p className="text-sm text-gray-200">{i.name}</p>
                      <p className="text-xs text-gray-400">{formatQty(i.quantity, i.unit)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-white font-semibold">Batch plan</p>
                <p className="text-xs text-gray-400 mt-1">{generated.batch_plan.length} steps</p>
                <div className="mt-3">
                  {generated.batch_plan.length === 0 ? (
                    <p className="text-sm text-gray-400">No batch steps returned.</p>
                  ) : (
                    <pre className="text-xs text-gray-200 bg-black/40 border border-white/10 rounded-xl p-3 overflow-auto">
                      {JSON.stringify(generated.batch_plan, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

