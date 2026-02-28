import { useEffect, useMemo, useState } from 'react'

import { apiJson } from '../../../lib/api'

type SearchResult =
  | { type: 'recipe'; id: string; label: string; route: string; detail?: string }
  | { type: 'studio'; id: string; label: string; route: string; detail?: string }
  | { type: 'ingredient'; id: string; label: string; route: string; detail?: string }

type Recipe = { id: string; canonical_name: string; review_status?: string; quality_label?: string }
type StudioSession = { id: string; status: string }
type Ingredient = { id: string; canonical_name: string }

export function SearchOverlay({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean
  onClose: () => void
  onNavigate: (route: string) => void
}) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setError('')
      setResults([])
      setLoading(false)
    }
  }, [open])

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
    const q = query.trim()
    if (!q) {
      setResults([])
      setError('')
      setLoading(false)
      return
    }

    const handle = window.setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const [recipes, sessions, ingredients] = await Promise.all([
          apiJson<Recipe[]>(`/v1/recipes?q=${encodeURIComponent(q)}`),
          apiJson<StudioSession[]>('/v1/studio/sessions').catch(() => []),
          apiJson<Ingredient[]>('/v1/inventory/ingredients').catch(() => []),
        ])
        const qLower = q.toLowerCase()
        const studioMatches = sessions
          .filter((s) => s.id.toLowerCase().includes(qLower) || s.status.toLowerCase().includes(qLower))
          .slice(0, 5)
        const ingredientMatches = ingredients
          .filter((ing) => ing.canonical_name.toLowerCase().includes(qLower))
          .slice(0, 5)

        const merged: SearchResult[] = [
          ...recipes.slice(0, 8).map((r) => ({
            type: 'recipe' as const,
            id: r.id,
            label: r.canonical_name,
            detail: [r.review_status, r.quality_label].filter(Boolean).join(' · ') || undefined,
            route: `/recipes/${r.id}`,
          })),
          ...studioMatches.map((s) => ({
            type: 'studio' as const,
            id: s.id,
            label: s.id,
            detail: s.status,
            route: `/studio/${s.id}`,
          })),
          ...ingredientMatches.map((ing) => ({
            type: 'ingredient' as const,
            id: ing.id,
            label: ing.canonical_name,
            detail: 'Ingredient',
            route: '/inventory/ontology',
          })),
        ]
        setResults(merged)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed.')
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 260)

    return () => window.clearTimeout(handle)
  }, [open, query])

  const grouped = useMemo(() => {
    return {
      recipes: results.filter((r) => r.type === 'recipe'),
      studio: results.filter((r) => r.type === 'studio'),
      ingredients: results.filter((r) => r.type === 'ingredient'),
    }
  }, [results])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Global search">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close search"
      />
      <div className="relative max-w-2xl mx-auto mt-20 px-4">
        <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-5 border-b border-white/10">
            <h2 className="text-lg font-semibold text-white">Search</h2>
            <p className="text-sm text-gray-400 mt-1">Recipes, studio sessions, and ingredients.</p>
            <input
              className="mt-4 w-full rounded-xl bg-white/10 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-purple-500/40"
              placeholder="Type to search…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
          </div>
          <div className="p-5 space-y-4">
            {!query.trim() ? <p className="text-sm text-gray-400">Start typing to search.</p> : null}
            {loading ? <p className="text-sm text-gray-400">Searching…</p> : null}
            {error ? (
              <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-xl p-3">{error}</div>
            ) : null}
            {!loading && query.trim() && !error && results.length === 0 ? (
              <p className="text-sm text-gray-400">No matches.</p>
            ) : null}

            {grouped.recipes.length ? (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Recipes</p>
                <div className="space-y-2">
                  {grouped.recipes.map((r) => (
                    <button
                      key={`${r.type}-${r.id}`}
                      type="button"
                      className="w-full text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-3 transition-colors"
                      onClick={() => {
                        onNavigate(r.route)
                        onClose()
                      }}
                    >
                      <p className="text-white font-medium">{r.label}</p>
                      {r.detail ? <p className="text-xs text-gray-400 mt-1">{r.detail}</p> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {grouped.studio.length ? (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Studio</p>
                <div className="space-y-2">
                  {grouped.studio.map((r) => (
                    <button
                      key={`${r.type}-${r.id}`}
                      type="button"
                      className="w-full text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-3 transition-colors"
                      onClick={() => {
                        onNavigate(r.route)
                        onClose()
                      }}
                    >
                      <p className="text-white font-medium break-all">{r.label}</p>
                      {r.detail ? <p className="text-xs text-gray-400 mt-1">{r.detail}</p> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {grouped.ingredients.length ? (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Ingredients</p>
                <div className="space-y-2">
                  {grouped.ingredients.map((r) => (
                    <button
                      key={`${r.type}-${r.id}`}
                      type="button"
                      className="w-full text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-3 transition-colors"
                      onClick={() => {
                        onNavigate(r.route)
                        onClose()
                      }}
                    >
                      <p className="text-white font-medium">{r.label}</p>
                      {r.detail ? <p className="text-xs text-gray-400 mt-1">{r.detail}</p> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

