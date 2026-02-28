import { useEffect, useMemo, useState } from 'react'

type SearchResult = {
  id: string
  label: string
  detail: string
  route: string
  type: 'recipe' | 'ingredient' | 'studio'
}

type RecipeResponse = {
  id: string
  canonical_name: string
}

type IngredientResponse = {
  id: string
  canonical_name: string
}

type StudioSessionResponse = {
  id: string
  status: string
}

type GlobalSearchPanelProps = {
  isOpen: boolean
  onClose: () => void
  authHeaders: Record<string, string>
  onNavigate: (route: string) => void
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export function GlobalSearchPanel({ isOpen, onClose, authHeaders, onNavigate }: GlobalSearchPanelProps) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])

  useEffect(() => {
    if (!isOpen) {
      setQuery('')
      setError('')
      setResults([])
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen || !query.trim()) {
      setResults([])
      setLoading(false)
      setError('')
      return
    }

    const timeout = window.setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const encoded = encodeURIComponent(query.trim())
        const [recipeRes, ingredientRes, studioRes] = await Promise.all([
          fetch(`${apiUrl}/v1/recipes?q=${encoded}`, { headers: authHeaders }),
          fetch(`${apiUrl}/v1/inventory/ingredients`, { headers: authHeaders }),
          fetch(`${apiUrl}/v1/studio/sessions`, { headers: authHeaders }),
        ])

        const recipes: RecipeResponse[] = recipeRes.ok ? await recipeRes.json() : []
        const ingredientsRaw: IngredientResponse[] = ingredientRes.ok ? await ingredientRes.json() : []
        const studioRaw: StudioSessionResponse[] = studioRes.ok ? await studioRes.json() : []

        const queryLower = query.toLowerCase()
        const ingredients = ingredientsRaw
          .filter((item) => item.canonical_name.toLowerCase().includes(queryLower))
          .slice(0, 5)
        const studio = studioRaw
          .filter((item) => item.id.toLowerCase().includes(queryLower) || item.status.toLowerCase().includes(queryLower))
          .slice(0, 5)

        const merged: SearchResult[] = [
          ...recipes.slice(0, 6).map((item) => ({
            id: item.id,
            label: item.canonical_name,
            detail: 'Recipe',
            route: `/recipes/${item.id}`,
            type: 'recipe' as const,
          })),
          ...ingredients.map((item) => ({
            id: item.id,
            label: item.canonical_name,
            detail: 'Ingredient',
            route: '/?view=inventory',
            type: 'ingredient' as const,
          })),
          ...studio.map((item) => ({
            id: item.id,
            label: item.id,
            detail: `Studio session (${item.status})`,
            route: `/studio/${item.id}`,
            type: 'studio' as const,
          })),
        ]

        setResults(merged)
      } catch (err) {
        setError('Unable to run search.')
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 260)

    return () => window.clearTimeout(timeout)
  }, [authHeaders, isOpen, query])

  const hasQuery = query.trim().length > 0
  const grouped = useMemo(() => {
    return {
      recipe: results.filter((item) => item.type === 'recipe'),
      ingredient: results.filter((item) => item.type === 'ingredient'),
      studio: results.filter((item) => item.type === 'studio'),
    }
  }, [results])

  if (!isOpen) return null

  return (
    <div className="overlay-root" role="dialog" aria-modal="true">
      <button className="overlay-backdrop" onClick={onClose} type="button" aria-label="Close search" />
      <div className="overlay-panel overlay-panel-search">
        <div className="overlay-header">
          <h2>Global Search</h2>
          <button className="overlay-close" onClick={onClose} type="button">
            Close
          </button>
        </div>

        <div className="overlay-body">
          <input
            placeholder="Search recipes, ingredients, studio sessions"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />

          {!hasQuery && <p className="muted">Type to search across recipes, inventory ingredients, and studio sessions.</p>}
          {loading && <p className="muted">Searching...</p>}
          {error && <p className="overlay-error">{error}</p>}

          {!loading && hasQuery && results.length === 0 && !error && <p className="muted">No matches found.</p>}

          {grouped.recipe.length > 0 && (
            <div className="search-group">
              <h3>Recipes</h3>
              {grouped.recipe.map((item) => (
                <button
                  className="search-result"
                  key={`recipe-${item.id}`}
                  onClick={() => {
                    onNavigate(item.route)
                    onClose()
                  }}
                  type="button"
                >
                  <span>{item.label}</span>
                  <small>{item.detail}</small>
                </button>
              ))}
            </div>
          )}

          {grouped.ingredient.length > 0 && (
            <div className="search-group">
              <h3>Ingredients</h3>
              {grouped.ingredient.map((item) => (
                <button
                  className="search-result"
                  key={`ingredient-${item.id}`}
                  onClick={() => {
                    onNavigate(item.route)
                    onClose()
                  }}
                  type="button"
                >
                  <span>{item.label}</span>
                  <small>{item.detail}</small>
                </button>
              ))}
            </div>
          )}

          {grouped.studio.length > 0 && (
            <div className="search-group">
              <h3>Studio</h3>
              {grouped.studio.map((item) => (
                <button
                  className="search-result"
                  key={`studio-${item.id}`}
                  onClick={() => {
                    onNavigate(item.route)
                    onClose()
                  }}
                  type="button"
                >
                  <span>{item.label}</span>
                  <small>{item.detail}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
