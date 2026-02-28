import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Clock, Heart, Star, Users } from 'lucide-react'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type RecipeIngredient = { name: string; quantity: number; unit: string; note?: string | null }

type Recipe = {
  id: string
  canonical_name: string
  description?: string | null
  ingredients?: RecipeIngredient[] | null
  instructions: string[]
  tags?: string[] | null
  review_status?: string | null
  quality_label?: string | null
}

export function RecipeDetailView({ recipeId }: { recipeId: string }) {
  const router = useRouter()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!recipeId) return
    setLoading(true)
    setError('')
    try {
      const data = await apiJson<Recipe>(`/v1/recipes/${recipeId}`)
      setRecipe(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load recipe.')
    } finally {
      setLoading(false)
    }
  }, [recipeId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <LoadState tone="loading" title="Loading recipe" message="Fetching recipe details." />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <LoadState tone="error" title="Recipe error" message={error} actionLabel="Retry" onAction={load} />
        </div>
      </div>
    )
  }

  if (!recipe) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <LoadState tone="empty" title="Recipe not found" message="This recipe no longer exists." />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => router.push('/recipes')}
          className="text-gray-400 hover:text-white mb-6 flex items-center space-x-2"
          type="button"
        >
          <span>← Back to Library</span>
        </button>

        <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
          <div className="p-8 bg-gradient-to-br from-purple-900/50 to-pink-900/50">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-3">
                  {recipe.quality_label ? (
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300">
                      {recipe.quality_label}
                    </span>
                  ) : null}
                  {recipe.review_status ? (
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-gray-200">
                      {recipe.review_status}
                    </span>
                  ) : null}
                </div>
                <h1 className="text-4xl font-bold text-white mb-2">{recipe.canonical_name}</h1>
                <p className="text-lg text-gray-300">{recipe.description ?? ''}</p>
              </div>
              <button
                className="p-3 rounded-full bg-white/10 text-gray-300 hover:text-pink-400 transition-colors"
                type="button"
                aria-label="Favorite"
              >
                <Heart className="w-6 h-6" />
              </button>
            </div>

            <div className="flex items-center space-x-6 text-sm">
              <div className="flex items-center space-x-1">
                <Star className="w-4 h-4 text-yellow-400" aria-hidden="true" />
                <span className="text-white font-medium">—</span>
              </div>
              <div className="flex items-center space-x-2 text-gray-300">
                <Clock className="w-4 h-4" aria-hidden="true" />
                <span>— min</span>
              </div>
              <div className="flex items-center space-x-2 text-gray-300">
                <Users className="w-4 h-4" aria-hidden="true" />
                <span>1 serving</span>
              </div>
            </div>
          </div>

          <div className="p-8">
            <div className="grid md:grid-cols-2 gap-8 mb-8">
              <div>
                <h2 className="text-xl font-bold text-white mb-4">Ingredients</h2>
                <div className="space-y-2">
                  {(recipe.ingredients ?? []).map((ingredient, idx) => (
                    <div key={idx} className="flex items-center space-x-3 p-3 bg-white/5 rounded-lg">
                      <div className="w-2 h-2 bg-purple-500 rounded-full" />
                      <span className="text-gray-300">
                        {ingredient.quantity} {ingredient.unit} {ingredient.name}
                      </span>
                    </div>
                  ))}
                  {(recipe.ingredients ?? []).length === 0 && (
                    <p className="text-sm text-gray-400">No ingredients stored.</p>
                  )}
                </div>
              </div>

              <div>
                <h2 className="text-xl font-bold text-white mb-4">Instructions</h2>
                <div className="space-y-3">
                  {(recipe.instructions ?? []).map((step, idx) => (
                    <div key={idx} className="flex space-x-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        {idx + 1}
                      </div>
                      <p className="text-gray-300 pt-0.5">{step}</p>
                    </div>
                  ))}
                  {(recipe.instructions ?? []).length === 0 && (
                    <p className="text-sm text-gray-400">No instructions stored.</p>
                  )}
                </div>
              </div>
            </div>

            {recipe.tags && recipe.tags.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-400 mb-2">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {recipe.tags.map((tag) => (
                    <span key={tag} className="px-3 py-1 bg-white/10 rounded-full text-sm text-gray-300">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex space-x-3">
              <button className="flex-1 py-3 bg-white/10 hover:bg-white/20 rounded-lg text-white font-medium transition-colors" type="button">
                View Substitutions
              </button>
              <button className="flex-1 py-3 bg-white/10 hover:bg-white/20 rounded-lg text-white font-medium transition-colors" type="button">
                Add to Party Menu
              </button>
              <button className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-lg text-white font-medium transition-all shadow-lg shadow-purple-500/30" type="button">
                Start Making
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
