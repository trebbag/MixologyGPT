import { useEffect, useMemo, useState } from 'react'

import { apiJson } from '../../lib/api'
import { LoadState } from '../ui/LoadState'

type DashboardMetrics = {
  recipesCount: number
  ingredientsCount: number
  makeNowCount: number
  unlockScoreLabel: string
}

export function DashboardView() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [recipes, ingredients, makeNow, unlockScore] = await Promise.all([
        apiJson<any[]>('/v1/recipes'),
        apiJson<any[]>('/v1/inventory/ingredients'),
        apiJson<any[]>('/v1/recommendations/make-now'),
        apiJson<any>('/v1/recommendations/unlock-score'),
      ])

      const unlockLabel = (() => {
        if (typeof unlockScore === 'number') return `${Math.round(unlockScore * 100)}%`
        if (unlockScore && typeof unlockScore.score === 'number') return `${Math.round(unlockScore.score * 100)}%`
        if (unlockScore && typeof unlockScore.unlock_score === 'number')
          return `${Math.round(unlockScore.unlock_score * 100)}%`
        return '—'
      })()

      setMetrics({
        recipesCount: recipes.length,
        ingredientsCount: ingredients.length,
        makeNowCount: makeNow.length,
        unlockScoreLabel: unlockLabel,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard metrics.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const cards = useMemo(() => {
    if (!metrics) return []
    return [
      { label: 'Total Recipes', value: String(metrics.recipesCount), sub: 'Library size' },
      { label: 'Ingredients', value: String(metrics.ingredientsCount), sub: 'In your ontology' },
      { label: 'Can Make', value: String(metrics.makeNowCount), sub: 'Make now from inventory', accent: 'purple' as const },
      { label: 'Unlock Score', value: metrics.unlockScoreLabel, sub: 'Coverage vs library', accent: 'pink' as const },
    ]
  }, [metrics])

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl font-bold text-white mb-8">Welcome Back</h2>

        {loading && <LoadState tone="loading" title="Loading dashboard" message="Fetching your latest metrics." />}
        {error && <LoadState tone="error" title="Dashboard error" message={error} actionLabel="Retry" onAction={load} />}

        {!loading && !error && metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {cards.map((card) => {
              const border =
                card.accent === 'purple'
                  ? 'border-purple-500/30'
                  : card.accent === 'pink'
                    ? 'border-pink-500/30'
                    : 'border-white/10'
              const valueColor =
                card.accent === 'purple'
                  ? 'text-purple-400'
                  : card.accent === 'pink'
                    ? 'text-pink-400'
                    : 'text-white'
              const subColor =
                card.accent === 'purple'
                  ? 'text-purple-400'
                  : card.accent === 'pink'
                    ? 'text-pink-400'
                    : 'text-gray-400'
              return (
                <div
                  key={card.label}
                  className={`bg-black/40 backdrop-blur-xl rounded-xl border ${border} p-6`}
                >
                  <p className="text-sm text-gray-400 mb-1">{card.label}</p>
                  <p className={`text-3xl font-bold ${valueColor}`}>{card.value}</p>
                  <p className={`text-xs mt-2 ${subColor}`}>{card.sub}</p>
                </div>
              )
            })}
          </div>
        )}

        {!loading && !error && !metrics && (
          <LoadState
            tone="empty"
            title="No metrics yet"
            message="Create inventory items and ingest recipes to populate the dashboard."
          />
        )}
      </div>
    </div>
  )
}

