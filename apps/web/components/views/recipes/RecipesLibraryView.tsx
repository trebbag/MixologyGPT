import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { Filter, Star } from 'lucide-react'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type Recipe = {
  id: string
  canonical_name: string
  description?: string | null
  review_status?: string | null
  quality_label?: string | null
  tags?: string[] | null
}

export function RecipesLibraryView() {
  const router = useRouter()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [filterTag, setFilterTag] = useState<string>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiJson<Recipe[]>('/v1/recipes')
      setRecipes(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load recipes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    for (const recipe of recipes) {
      for (const tag of recipe.tags ?? []) tags.add(tag)
    }
    return ['all', ...Array.from(tags).sort((a, b) => a.localeCompare(b))]
  }, [recipes])

  const filteredRecipes = useMemo(() => {
    if (filterTag === 'all') return recipes
    return recipes.filter((r) => (r.tags ?? []).includes(filterTag))
  }, [recipes, filterTag])

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center space-x-3 overflow-x-auto pb-2">
          <Filter className="w-5 h-5 text-gray-400 flex-shrink-0" aria-hidden="true" />
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setFilterTag(tag)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                filterTag === tag
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}
            >
              {tag === 'all' ? 'All Recipes' : tag}
            </button>
          ))}
        </div>

        {loading && <LoadState tone="loading" title="Loading recipes" message="Refreshing recipe library." />}
        {error && <LoadState tone="error" title="Recipe error" message={error} actionLabel="Retry" onAction={load} />}
        {!loading && !error && recipes.length === 0 && (
          <LoadState tone="empty" title="No recipes yet" message="Ingest a recipe to populate the library." />
        )}

        {!loading && !error && recipes.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRecipes.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                onClick={() => router.push(`/recipes/${recipe.id}`)}
                className="text-left bg-black/40 backdrop-blur-xl rounded-xl border border-white/10 overflow-hidden hover:border-purple-500/50 transition-all cursor-pointer group"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      {recipe.quality_label ? (
                        <span className="px-2 py-1 rounded text-xs font-medium bg-purple-500/20 text-purple-300">
                          {recipe.quality_label}
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded text-xs font-medium bg-white/10 text-gray-300">
                          standard
                        </span>
                      )}
                      {recipe.review_status ? (
                        <span className="px-2 py-1 rounded text-xs font-medium bg-white/10 text-gray-300">
                          {recipe.review_status}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Star className="w-4 h-4 text-yellow-400" aria-hidden="true" />
                      <span>signals</span>
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-white mb-2 group-hover:text-purple-400 transition-colors">
                    {recipe.canonical_name}
                  </h3>
                  <p className="text-sm text-gray-400 mb-4 line-clamp-2">{recipe.description ?? ''}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

