import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type RecipeLite = {
  id: string
  name: string
  ingredients?: Array<{ name: string; quantity?: number; unit?: string }> | null
}

type MissingIngredient = {
  name: string
  quantity?: number | null
  unit?: string | null
  substitutions?: Array<{ name: string; ratio?: number; notes?: string | null }> | null
}

type MissingOneRecipe = RecipeLite & {
  missing?: MissingIngredient[] | string[]
}

type UnlockSuggestion = { ingredient: string; unlock_count: number }

type UnlockScoreResponse =
  | UnlockSuggestion[]
  | {
      unlock_score?: number
      make_now_count?: number
      missing_one_count?: number
      total_recipes?: number
      suggestions?: UnlockSuggestion[]
    }

function pct(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return `${Math.round(value * 100)}%`
}

export function RecommendationsView() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [makeNow, setMakeNow] = useState<RecipeLite[]>([])
  const [missingOne, setMissingOne] = useState<MissingOneRecipe[]>([])
  const [tonightFlight, setTonightFlight] = useState<RecipeLite[]>([])
  const [unlock, setUnlock] = useState<UnlockScoreResponse | null>(null)

  const unlockScore = useMemo(() => {
    if (!unlock) return null
    if (Array.isArray(unlock)) return null
    if (typeof unlock.unlock_score === 'number') return unlock.unlock_score
    return null
  }, [unlock])

  const unlockSuggestions = useMemo<UnlockSuggestion[]>(() => {
    if (!unlock) return []
    if (Array.isArray(unlock)) return unlock
    return unlock.suggestions ?? []
  }, [unlock])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [makeNowList, missingOneList, tonight, unlockScoreRaw] = await Promise.all([
        apiJson<any[]>('/v1/recommendations/make-now'),
        apiJson<any[]>('/v1/recommendations/missing-one'),
        apiJson<any[]>('/v1/recommendations/tonight-flight'),
        apiJson<any>('/v1/recommendations/unlock-score'),
      ])

      const normalizeRecipes = (rows: any[]): RecipeLite[] =>
        (rows || []).map((r) => ({
          id: String(r.id),
          name: String(r.name ?? r.canonical_name ?? 'Untitled'),
          ingredients: Array.isArray(r.ingredients) ? r.ingredients : null,
        }))

      setMakeNow(normalizeRecipes(makeNowList))
      setTonightFlight(normalizeRecipes(tonight))
      setMissingOne(
        (missingOneList || []).map((r) => ({
          id: String(r.id),
          name: String(r.name ?? r.canonical_name ?? 'Untitled'),
          ingredients: Array.isArray(r.ingredients) ? r.ingredients : null,
          missing: r.missing,
        })),
      )
      setUnlock(unlockScoreRaw as UnlockScoreResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recommendations.')
      setMakeNow([])
      setMissingOne([])
      setTonightFlight([])
      setUnlock(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">Recommendations</h2>
            <p className="text-sm text-gray-400 mt-1">What to make now, what you are one ingredient away from, and how to unlock more.</p>
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

        {loading ? <LoadState tone="loading" title="Loading recommendations" message="Crunching your inventory and library." /> : null}
        {error ? <LoadState tone="error" title="Recommendations error" message={error} actionLabel="Retry" onAction={load} /> : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-300" aria-hidden="true" />
                  Tonight&apos;s Flight
                </h3>
                <p className="text-sm text-gray-400 mt-1">A small set you can make right now.</p>
              </div>
              <p className="text-sm text-gray-300">{tonightFlight.length}</p>
            </div>
            <div className="mt-4 space-y-3">
              {!loading && !error && tonightFlight.length === 0 ? (
                <LoadState
                  tone="empty"
                  title="No flight yet"
                  message="Add inventory items and ingest recipes. We will propose a 3-drink flight when feasible."
                />
              ) : null}
              {tonightFlight.map((r) => (
                <a
                  key={r.id}
                  href={`/recipes/${r.id}`}
                  className="block rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-4 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-white font-semibold truncate">{r.name}</p>
                      <p className="text-xs text-gray-400 mt-1">{(r.ingredients?.length ?? 0) + ' ingredients'}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-500" aria-hidden="true" />
                  </div>
                </a>
              ))}
            </div>
          </div>

          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
            <h3 className="text-lg font-semibold text-white">Unlock Score</h3>
            <p className="text-sm text-gray-400 mt-1">How much of your library is within reach.</p>

            <div className="mt-4 space-y-3">
              {unlockScore !== null ? (
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-300">Coverage</p>
                    <p className="text-sm text-white font-semibold">{pct(unlockScore)}</p>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-2 bg-gradient-to-r from-purple-500 to-pink-500" style={{ width: `${Math.min(Math.max(unlockScore, 0), 1) * 100}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-gray-400">
                    {(Array.isArray(unlock) ? null : unlock?.make_now_count) ?? '—'} make-now ·{' '}
                    {(Array.isArray(unlock) ? null : unlock?.missing_one_count) ?? '—'} missing-one ·{' '}
                    {(Array.isArray(unlock) ? null : unlock?.total_recipes) ?? '—'} total
                  </p>
                </div>
              ) : (
                <div className="text-sm text-gray-400 bg-white/5 border border-white/10 rounded-xl p-3">
                  Unlock score is not available yet. We will compute it after you ingest more recipes.
                </div>
              )}

              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Top unlock ingredients</p>
                {!loading && !error && unlockSuggestions.length === 0 ? (
                  <p className="text-sm text-gray-400">No suggestions yet.</p>
                ) : null}
                <div className="space-y-2">
                  {unlockSuggestions.map((s) => (
                    <div key={s.ingredient} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm text-white font-medium truncate">{s.ingredient}</p>
                        <p className="text-xs text-gray-300">{s.unlock_count}</p>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">Unlocks ~{s.unlock_count} missing-one recipes</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
            <div className="flex items-baseline justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Make Now</h3>
                <p className="text-sm text-gray-400 mt-1">Recipes that match your inventory as-is.</p>
              </div>
              <p className="text-sm text-gray-300">{makeNow.length}</p>
            </div>
            <div className="mt-4 space-y-3">
              {!loading && !error && makeNow.length === 0 ? (
                <LoadState tone="empty" title="Nothing make-now yet" message="Log inventory lots to unlock make-now recipes." />
              ) : null}
              {makeNow.slice(0, 12).map((r) => (
                <a
                  key={r.id}
                  href={`/recipes/${r.id}`}
                  className="block rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-4 transition-colors"
                >
                  <p className="text-white font-semibold">{r.name}</p>
                  <p className="text-xs text-gray-400 mt-1">{(r.ingredients?.length ?? 0) + ' ingredients'}</p>
                </a>
              ))}
              {makeNow.length > 12 ? <p className="text-xs text-gray-500">Showing 12 of {makeNow.length}.</p> : null}
            </div>
          </div>

          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
            <div className="flex items-baseline justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Missing One</h3>
                <p className="text-sm text-gray-400 mt-1">You are one ingredient away. We include substitutions when known.</p>
              </div>
              <p className="text-sm text-gray-300">{missingOne.length}</p>
            </div>
            <div className="mt-4 space-y-3">
              {!loading && !error && missingOne.length === 0 ? (
                <LoadState tone="empty" title="No missing-one yet" message="Add more recipes to find near-misses and unlock suggestions." />
              ) : null}
              {missingOne.slice(0, 10).map((r) => {
                const missing = Array.isArray(r.missing) ? r.missing : []
                const missingFirst = missing[0]
                const missingName =
                  typeof missingFirst === 'string' ? missingFirst : missingFirst?.name ? String(missingFirst.name) : '—'
                const subs =
                  typeof missingFirst === 'string'
                    ? []
                    : Array.isArray(missingFirst?.substitutions)
                      ? (missingFirst?.substitutions as any[])
                      : []
                return (
                  <a
                    key={r.id}
                    href={`/recipes/${r.id}`}
                    className="block rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-4 transition-colors"
                  >
                    <p className="text-white font-semibold">{r.name}</p>
                    <p className="text-xs text-gray-400 mt-1">Missing: {missingName}</p>
                    {subs.length ? (
                      <p className="text-[11px] text-gray-500 mt-1">
                        Substitutions: {subs.slice(0, 2).map((s) => s?.name).filter(Boolean).join(', ')}
                        {subs.length > 2 ? '…' : ''}
                      </p>
                    ) : null}
                  </a>
                )
              })}
              {missingOne.length > 10 ? <p className="text-xs text-gray-500">Showing 10 of {missingOne.length}.</p> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
