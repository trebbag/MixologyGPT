import { useMemo, useState } from 'react'
import { useRouter } from 'next/router'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type IngredientRowDraft = {
  key: string
  name: string
  quantity: string
  unit: string
  note: string
}

function newKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeOptionalString(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function parseOptionalFloat(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const num = Number(trimmed)
  return Number.isFinite(num) ? num : null
}

function parseOptionalInt(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const num = Number(trimmed)
  if (!Number.isFinite(num)) return null
  return Math.floor(num)
}

function dateToIso(dateValue: string): string | null {
  const trimmed = dateValue.trim()
  if (!trimmed) return null
  // Date input is YYYY-MM-DD; normalize to UTC midnight.
  const iso = new Date(`${trimmed}T00:00:00Z`).toISOString()
  return iso
}

export function RecipeIngestView() {
  const router = useRouter()
  const [sourceUrl, setSourceUrl] = useState('')
  const [author, setAuthor] = useState('')
  const [publishedAt, setPublishedAt] = useState('')
  const [canonicalName, setCanonicalName] = useState('')
  const [description, setDescription] = useState('')
  const [glassware, setGlassware] = useState('')
  const [iceStyle, setIceStyle] = useState('')
  const [tags, setTags] = useState('')
  const [abvEstimate, setAbvEstimate] = useState('')

  const [ratingValue, setRatingValue] = useState('')
  const [ratingCount, setRatingCount] = useState('')
  const [likeCount, setLikeCount] = useState('')
  const [shareCount, setShareCount] = useState('')

  const [ingredients, setIngredients] = useState<IngredientRowDraft[]>([
    { key: newKey(), name: '', quantity: '2', unit: 'oz', note: '' },
  ])
  const [instructionsText, setInstructionsText] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const validation = useMemo(() => {
    const errors: string[] = []
    if (!sourceUrl.trim()) errors.push('Source URL is required.')
    if (!canonicalName.trim()) errors.push('Canonical name is required.')
    const normalizedIngredients = ingredients
      .map((row) => ({
        name: row.name.trim(),
        quantity: parseOptionalFloat(row.quantity),
        unit: row.unit.trim(),
        note: normalizeOptionalString(row.note),
      }))
      .filter((row) => row.name || row.quantity !== null || row.unit)

    if (normalizedIngredients.length === 0) errors.push('Add at least one ingredient row.')
    for (const row of normalizedIngredients) {
      if (!row.name) errors.push('Ingredient name is required for every row.')
      if (row.quantity === null) errors.push('Ingredient quantity must be a number for every row.')
      if (!row.unit) errors.push('Ingredient unit is required for every row.')
    }
    const instructions = instructionsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (instructions.length === 0) errors.push('Provide at least one instruction line.')
    return { errors, normalizedIngredients, instructions }
  }, [canonicalName, ingredients, instructionsText, sourceUrl])

  const submit = async () => {
    setSubmitting(true)
    setSubmitError('')
    try {
      if (validation.errors.length) {
        throw new Error(validation.errors[0])
      }

      const payload = {
        source: {
          url: sourceUrl.trim(),
          source_type: 'web',
          author: normalizeOptionalString(author),
          published_at: dateToIso(publishedAt),
        },
        canonical_name: canonicalName.trim(),
        description: normalizeOptionalString(description),
        ingredients: validation.normalizedIngredients.map((row) => ({
          name: row.name,
          quantity: row.quantity as number,
          unit: row.unit,
          note: row.note,
        })),
        instructions: validation.instructions,
        glassware: normalizeOptionalString(glassware),
        ice_style: normalizeOptionalString(iceStyle),
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        abv_estimate: parseOptionalFloat(abvEstimate),
        rating_value: parseOptionalFloat(ratingValue),
        rating_count: parseOptionalInt(ratingCount),
        like_count: parseOptionalInt(likeCount),
        share_count: parseOptionalInt(shareCount),
      }

      const created = await apiJson<{ id: string }>(`/v1/recipes/ingest`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      await router.push(`/recipes/${created.id}`)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Recipe ingest failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">Recipe Ingest</h2>
            <p className="text-sm text-gray-400 mt-1">
              Manually ingest a recipe with structured ingredients, instructions, and popularity signals.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/recipes')}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white"
          >
            Back to Library
          </button>
        </div>

        {submitError ? <LoadState tone="error" title="Ingest error" message={submitError} /> : null}
        {validation.errors.length ? (
          <LoadState
            tone="empty"
            title="Missing required fields"
            message={validation.errors[0]}
          />
        ) : null}

        <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white">Source</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-2">Source URL</label>
              <input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-gray-500"
                placeholder="https://example.com/recipes/negroni"
                autoCapitalize="none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-2">Author (optional)</label>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-gray-500"
                placeholder="Publisher / bartender"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-2">Published Date (optional)</label>
              <input
                type="date"
                value={publishedAt}
                onChange={(e) => setPublishedAt(e.target.value)}
                className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
              />
            </div>
            <div />
          </div>
        </div>

        <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white">Recipe</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-2">Canonical Name</label>
              <input
                value={canonicalName}
                onChange={(e) => setCanonicalName(e.target.value)}
                className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-gray-500"
                placeholder="Negroni"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-2">Tags (comma-separated)</label>
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-gray-500"
                placeholder="classic, bitter, stirred"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-2">Glassware (optional)</label>
              <input
                value={glassware}
                onChange={(e) => setGlassware(e.target.value)}
                className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-gray-500"
                placeholder="rocks"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-2">Ice Style (optional)</label>
              <input
                value={iceStyle}
                onChange={(e) => setIceStyle(e.target.value)}
                className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-gray-500"
                placeholder="large cube"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-300 mb-2">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full min-h-[90px] px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-gray-500"
                placeholder="One line about why it works."
              />
            </div>
          </div>
        </div>

        <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white">Ingredients</h3>
          <div className="space-y-3">
            {ingredients.map((row, idx) => (
              <div key={row.key} className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Qty</label>
                  <input
                    value={row.quantity}
                    onChange={(e) =>
                      setIngredients((prev) =>
                        prev.map((r) => (r.key === row.key ? { ...r, quantity: e.target.value } : r)),
                      )
                    }
                    className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                    placeholder="1.5"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Unit</label>
                  <input
                    value={row.unit}
                    onChange={(e) =>
                      setIngredients((prev) =>
                        prev.map((r) => (r.key === row.key ? { ...r, unit: e.target.value } : r)),
                      )
                    }
                    className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                    placeholder="oz"
                  />
                </div>
                <div className="md:col-span-5">
                  <label className="block text-xs text-gray-400 mb-1">Name</label>
                  <input
                    value={row.name}
                    onChange={(e) =>
                      setIngredients((prev) =>
                        prev.map((r) => (r.key === row.key ? { ...r, name: e.target.value } : r)),
                      )
                    }
                    className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-gray-500"
                    placeholder="gin"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-xs text-gray-400 mb-1">Note</label>
                  <input
                    value={row.note}
                    onChange={(e) =>
                      setIngredients((prev) =>
                        prev.map((r) => (r.key === row.key ? { ...r, note: e.target.value } : r)),
                      )
                    }
                    className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-gray-500"
                    placeholder="London dry"
                  />
                </div>
                <div className="md:col-span-12 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIngredients((prev) => prev.filter((r) => r.key !== row.key))}
                    className="text-xs text-gray-400 hover:text-red-200"
                    disabled={ingredients.length <= 1}
                    title={ingredients.length <= 1 ? 'At least one ingredient is required.' : 'Remove ingredient'}
                  >
                    Remove
                  </button>
                </div>
                {idx < ingredients.length - 1 ? <div className="md:col-span-12 border-b border-white/5" /> : null}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setIngredients((prev) => [...prev, { key: newKey(), name: '', quantity: '1', unit: 'oz', note: '' }])
            }
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white"
          >
            Add Ingredient
          </button>
        </div>

        <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white">Instructions</h3>
          <p className="text-sm text-gray-400">One instruction per line.</p>
          <textarea
            value={instructionsText}
            onChange={(e) => setInstructionsText(e.target.value)}
            className="w-full min-h-[160px] px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder:text-gray-500"
            placeholder={'Add ice to mixing glass.\nStir 20 seconds.\nStrain over large cube.'}
          />
        </div>

        <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white">Signals (optional)</h3>
          <p className="text-sm text-gray-400">
            Popularity signals help quality scoring and automatic review policy.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-2">Rating Value</label>
              <input
                value={ratingValue}
                onChange={(e) => setRatingValue(e.target.value)}
                className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                placeholder="4.7"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-2">Rating Count</label>
              <input
                value={ratingCount}
                onChange={(e) => setRatingCount(e.target.value)}
                className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                placeholder="128"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-2">ABV Estimate</label>
              <input
                value={abvEstimate}
                onChange={(e) => setAbvEstimate(e.target.value)}
                className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                placeholder="22"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-2">Like Count</label>
              <input
                value={likeCount}
                onChange={(e) => setLikeCount(e.target.value)}
                className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                placeholder="540"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-2">Share Count</label>
              <input
                value={shareCount}
                onChange={(e) => setShareCount(e.target.value)}
                className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                placeholder="92"
              />
            </div>
            <div />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push('/recipes')}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="px-6 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium disabled:opacity-60"
            disabled={submitting || validation.errors.length > 0}
          >
            {submitting ? 'Ingesting…' : 'Ingest Recipe'}
          </button>
        </div>
      </div>
    </div>
  )
}

