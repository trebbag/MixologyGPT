import { useCallback, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

import type {
  HarvestJob,
  Ingredient,
  InventoryItem,
  Recipe,
  RecipeModeration,
  SectionState,
  StudioDiffResult,
  StudioGuidedStep,
  StudioSession,
  StudioVersion,
} from '../types'

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000'
const e2eAccessToken =
  process.env.NODE_ENV === 'test'
    ? process.env.EXPO_PUBLIC_E2E_ACCESS_TOKEN ?? process.env.STAGING_E2E_ACCESS_TOKEN ?? ''
    : ''

type SectionKey =
  | 'inventory'
  | 'recipes'
  | 'harvest'
  | 'reviews'
  | 'studio_sessions'
  | 'studio_versions'
  | 'studio_assistant'
  | 'knowledge'
  | 'recommendations'
  | 'settings'

export type AppController = {
  isBootstrapping: boolean
  bootstrapError: string
  sectionStatus: Record<SectionKey, SectionState>
  ingredients: Ingredient[]
  items: InventoryItem[]
  recipes: Recipe[]
  harvestJobs: HarvestJob[]
  autoHarvestResult: any | null
  moderationHistory: RecipeModeration[]
  moderationHistoryRecipeId: string
  studioSessions: StudioSession[]
  studioVersions: StudioVersion[]
  studioDiff: StudioDiffResult | null
  guidedSteps: StudioGuidedStep[]
  copilotQuestions: string[]
  copilotFollowup: string
  activeSessionId: string
  recentSessions: Array<{ id: string; status: string }>
  knowledgeResults: Array<{ id: string; title?: string; source_url?: string }>
  makeNow: any[]
  missingOne: any[]
  tonightFlight: any[]
  mfaSecret: string
  mfaStatus: string
  loadInventory: () => Promise<void>
  loadRecipes: (query?: string) => Promise<void>
  loadHarvestJobs: () => Promise<void>
  autoHarvest: (sourceUrl: string, maxLinks: number) => Promise<void>
  runHarvestJob: (jobId: string) => Promise<void>
  loadModerations: (recipeId: string) => Promise<void>
  createRecipeModeration: (payload: {
    recipeId: string
    status: string
    qualityLabel?: string
    notes?: string
  }) => Promise<void>
  loadStudioSessions: () => Promise<void>
  loadStudioVersions: (sessionId: string) => Promise<void>
  loadKnowledge: (query: string) => Promise<void>
  loadRecommendations: () => Promise<void>
  createIngredient: (name: string) => Promise<void>
  createItem: (ingredientId: string, unit: string, preferredUnit?: string) => Promise<void>
  ingestRecipe: (payload: {
    canonicalName: string
    sourceUrl: string
    ingredients: Array<{ name: string; quantity: number; unit: string }>
    instructions: string[]
    ratingValue?: number
    ratingCount?: number
    likeCount?: number
    shareCount?: number
    description?: string
    iceStyle?: string
    tags?: string[]
  }) => Promise<void>
  fetchRecipeDetail: (recipeId: string) => Promise<any>
  createStudioSession: () => Promise<string | null>
  openStudioSession: (sessionId: string) => Promise<void>
  createStudioConstraint: (payload: {
    sessionId: string
    includeIngredients: string[]
    excludeIngredients: string[]
    style?: string
    abvTarget?: number
  }) => Promise<void>
  generateStudio: (sessionId: string) => Promise<void>
  loadStudioDiff: (payload: { sessionId: string; fromVersionId: string; toVersionId: string }) => Promise<void>
  revertStudioVersion: (payload: { sessionId: string; versionId: string }) => Promise<void>
  loadGuidedSteps: (sessionId: string) => Promise<void>
  loadCopilotQuestions: (sessionId: string) => Promise<void>
  followupCopilot: (payload: { sessionId: string; answer: string }) => Promise<void>
  setupMfa: () => Promise<void>
  enableMfa: (otp: string) => Promise<void>
  disableMfa: (otp: string) => Promise<void>
}

export function useAppController(): AppController {
  const [token, setToken] = useState<string | null>(null)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [bootstrapError, setBootstrapError] = useState('')
  const [sectionStatus, setSectionStatus] = useState<Record<SectionKey, SectionState>>({
    inventory: { loading: false, error: '' },
    recipes: { loading: false, error: '' },
    harvest: { loading: false, error: '' },
    reviews: { loading: false, error: '' },
    studio_sessions: { loading: false, error: '' },
    studio_versions: { loading: false, error: '' },
    studio_assistant: { loading: false, error: '' },
    knowledge: { loading: false, error: '' },
    recommendations: { loading: false, error: '' },
    settings: { loading: false, error: '' },
  })
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [harvestJobs, setHarvestJobs] = useState<HarvestJob[]>([])
  const [autoHarvestResult, setAutoHarvestResult] = useState<any | null>(null)
  const [moderationHistory, setModerationHistory] = useState<RecipeModeration[]>([])
  const [moderationHistoryRecipeId, setModerationHistoryRecipeId] = useState('')
  const [studioSessions, setStudioSessions] = useState<StudioSession[]>([])
  const [studioVersions, setStudioVersions] = useState<StudioVersion[]>([])
  const [studioDiff, setStudioDiff] = useState<StudioDiffResult | null>(null)
  const [guidedSteps, setGuidedSteps] = useState<StudioGuidedStep[]>([])
  const [copilotQuestions, setCopilotQuestions] = useState<string[]>([])
  const [copilotFollowup, setCopilotFollowup] = useState('')
  const [activeSessionId, setActiveSessionId] = useState('')
  const [recentSessions, setRecentSessions] = useState<Array<{ id: string; status: string }>>([])
  const [knowledgeResults, setKnowledgeResults] = useState<Array<{ id: string; title?: string; source_url?: string }>>([])
  const [makeNow, setMakeNow] = useState<any[]>([])
  const [missingOne, setMissingOne] = useState<any[]>([])
  const [tonightFlight, setTonightFlight] = useState<any[]>([])
  const [mfaSecret, setMfaSecret] = useState('')
  const [mfaStatus, setMfaStatus] = useState('')

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
    return headers
  }, [token])

  const updateSectionStatus = useCallback((key: SectionKey, patch: Partial<SectionState>) => {
    setSectionStatus((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        ...patch,
      },
    }))
  }, [])

  const runSectionTask = useCallback(
    async (key: SectionKey, task: () => Promise<void>) => {
      updateSectionStatus(key, { loading: true, error: '' })
      try {
        await task()
        updateSectionStatus(key, { loading: false, error: '' })
      } catch (error) {
        const message = (() => {
          if (!(error instanceof Error)) {
            return `Failed to load ${key}`
          }
          const raw = error.message || ''
          const normalized = raw.toLowerCase()
          if (
            normalized.includes('network request failed') ||
            normalized.includes('failed to fetch') ||
            normalized.includes('network error')
          ) {
            return 'Network appears offline. Check your connection and try again.'
          }
          return raw
        })()
        updateSectionStatus(key, { loading: false, error: message })
      }
    },
    [updateSectionStatus],
  )

  const requestWithBackoff = useCallback(
    async (url: string, init: RequestInit, retries: number = 2): Promise<Response> => {
      let response: Response | null = null
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        response = await fetch(url, init)
        if (response.status !== 429 || attempt === retries) {
          return response
        }
        const retryAfterRaw =
          typeof (response as any).headers?.get === 'function' ? (response as any).headers.get('Retry-After') : null
        const retryAfterSeconds = retryAfterRaw ? Number(retryAfterRaw) : NaN
        const delayMs = Number.isFinite(retryAfterSeconds)
          ? Math.max(100, retryAfterSeconds * 1000)
          : Math.min(500 * 2 ** attempt, 3000)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
      return response as Response
    },
    [],
  )

  const rememberSession = useCallback(async (id: string, status: string) => {
    setRecentSessions((prev) => {
      const next = [{ id, status }, ...prev.filter((item) => item.id !== id)].slice(0, 5)
      AsyncStorage.setItem('bartenderai.recentSessions', JSON.stringify(next)).catch(() => undefined)
      return next
    })
  }, [])

  const loadInventory = useCallback(async () => {
    await runSectionTask('inventory', async () => {
      const [ingredientsRes, itemsRes] = await Promise.all([
        fetch(`${apiUrl}/v1/inventory/ingredients`, { headers: authHeaders }),
        fetch(`${apiUrl}/v1/inventory/items`, { headers: authHeaders }),
      ])
      if (!ingredientsRes.ok || !itemsRes.ok) {
        throw new Error('Unable to load inventory resources.')
      }
      setIngredients(await ingredientsRes.json())
      setItems(await itemsRes.json())
    })
  }, [authHeaders, runSectionTask])

  const loadRecipes = useCallback(
    async (query?: string) => {
      await runSectionTask('recipes', async () => {
        const url = query ? `${apiUrl}/v1/recipes?q=${encodeURIComponent(query)}` : `${apiUrl}/v1/recipes`
        const res = await fetch(url, { headers: authHeaders })
        if (!res.ok) {
          throw new Error('Unable to load recipes.')
        }
        setRecipes(await res.json())
      })
    },
    [authHeaders, runSectionTask],
  )

  const fetchRecipeDetail = useCallback(
    async (recipeId: string) => {
      const res = await fetch(`${apiUrl}/v1/recipes/${recipeId}`, { headers: authHeaders })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.detail || 'Unable to load recipe details.')
      }
      return await res.json()
    },
    [authHeaders],
  )

  const loadHarvestJobs = useCallback(async () => {
    await runSectionTask('harvest', async () => {
      const res = await fetch(`${apiUrl}/v1/recipes/harvest/jobs`, { headers: authHeaders })
      if (!res.ok) {
        throw new Error('Unable to load harvest jobs.')
      }
      setHarvestJobs(await res.json())
    })
  }, [authHeaders, runSectionTask])

  const autoHarvest = useCallback(
    async (sourceUrl: string, maxLinks: number) => {
      let shouldRefreshJobs = false
      await runSectionTask('harvest', async () => {
        const res = await requestWithBackoff(`${apiUrl}/v1/recipes/harvest/auto`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            source_url: sourceUrl,
            source_type: 'web',
            max_links: maxLinks,
            enqueue: true,
          }),
        })
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}))
          if (res.status === 429) {
            const retryIn = payload?.retry_after_seconds
            throw new Error(
              retryIn ? `Crawler is rate-limited. Try again in ${retryIn}s.` : 'Crawler is rate-limited. Try again.',
            )
          }
          throw new Error(payload?.detail || 'Auto harvest failed.')
        }
        setAutoHarvestResult(await res.json())
        shouldRefreshJobs = true
      })
      if (shouldRefreshJobs) {
        await loadHarvestJobs()
      }
    },
    [authHeaders, runSectionTask, loadHarvestJobs, requestWithBackoff],
  )

  const runHarvestJob = useCallback(
    async (jobId: string) => {
      let shouldRefresh = false
      await runSectionTask('harvest', async () => {
        const res = await requestWithBackoff(`${apiUrl}/v1/recipes/harvest/jobs/${jobId}/run`, {
          method: 'POST',
          headers: authHeaders,
        })
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}))
          if (res.status === 429) {
            const retryIn = payload?.retry_after_seconds
            throw new Error(
              retryIn ? `Harvest job is rate-limited. Try again in ${retryIn}s.` : 'Harvest job is rate-limited.',
            )
          }
          throw new Error(payload?.detail || 'Unable to run harvest job.')
        }
        shouldRefresh = true
      })
      if (shouldRefresh) {
        await loadHarvestJobs()
        await loadRecipes()
      }
    },
    [authHeaders, runSectionTask, loadHarvestJobs, loadRecipes, requestWithBackoff],
  )

  const loadModerations = useCallback(
    async (recipeId: string) => {
      await runSectionTask('reviews', async () => {
        setModerationHistoryRecipeId(recipeId)
        setModerationHistory([])
        const res = await fetch(`${apiUrl}/v1/reviews/recipes/${recipeId}/moderations`, { headers: authHeaders })
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}))
          throw new Error(payload?.detail || 'Unable to load moderation history.')
        }
        setModerationHistory(await res.json())
      })
    },
    [authHeaders, runSectionTask],
  )

  const createRecipeModeration = useCallback(
    async (payload: { recipeId: string; status: string; qualityLabel?: string; notes?: string }) => {
      await runSectionTask('reviews', async () => {
        const res = await fetch(`${apiUrl}/v1/reviews/recipes/${payload.recipeId}/moderations`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            status: payload.status,
            quality_label: payload.qualityLabel || undefined,
            notes: payload.notes || undefined,
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.detail || 'Unable to submit moderation.')
        }
      })
      await loadModerations(payload.recipeId)
      await loadRecipes()
    },
    [authHeaders, runSectionTask, loadModerations, loadRecipes],
  )

  const loadStudioSessions = useCallback(async () => {
    await runSectionTask('studio_sessions', async () => {
      const res = await fetch(`${apiUrl}/v1/studio/sessions`, { headers: authHeaders })
      if (!res.ok) {
        throw new Error('Unable to load studio sessions.')
      }
      setStudioSessions(await res.json())
    })
  }, [authHeaders, runSectionTask])

  const loadStudioVersions = useCallback(
    async (sessionId: string) => {
      await runSectionTask('studio_versions', async () => {
        const res = await fetch(`${apiUrl}/v1/studio/sessions/${sessionId}/versions`, {
          headers: authHeaders,
        })
        if (!res.ok) {
          throw new Error('Unable to load studio versions.')
        }
        setStudioVersions(await res.json())
      })
    },
    [authHeaders, runSectionTask],
  )

  const loadKnowledge = useCallback(
    async (query: string) => {
      await runSectionTask('knowledge', async () => {
        const res = await fetch(`${apiUrl}/v1/knowledge/search`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ query, limit: 5 }),
        })
        if (!res.ok) {
          throw new Error('Knowledge search failed.')
        }
        const payload = await res.json()
        setKnowledgeResults(payload.results ?? [])
      })
    },
    [authHeaders, runSectionTask],
  )

  const loadRecommendations = useCallback(async () => {
    await runSectionTask('recommendations', async () => {
      const [makeRes, missingRes, flightRes] = await Promise.all([
        fetch(`${apiUrl}/v1/recommendations/make-now`, { headers: authHeaders }),
        fetch(`${apiUrl}/v1/recommendations/missing-one`, { headers: authHeaders }),
        fetch(`${apiUrl}/v1/recommendations/tonight-flight`, { headers: authHeaders }),
      ])
      if (!makeRes.ok || !missingRes.ok || !flightRes.ok) {
        throw new Error('Unable to load recommendations.')
      }
      setMakeNow(await makeRes.json())
      setMissingOne(await missingRes.json())
      setTonightFlight(await flightRes.json())
    })
  }, [authHeaders, runSectionTask])

  const createIngredient = useCallback(
    async (name: string) => {
      await fetch(`${apiUrl}/v1/inventory/ingredients`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ canonical_name: name }),
      })
      await loadInventory()
    },
    [authHeaders, loadInventory],
  )

  const createItem = useCallback(
    async (ingredientId: string, unit: string, preferredUnit?: string) => {
      await fetch(`${apiUrl}/v1/inventory/items`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          ingredient_id: ingredientId,
          unit,
          preferred_unit: preferredUnit || undefined,
        }),
      })
      await loadInventory()
    },
    [authHeaders, loadInventory],
  )

  const ingestRecipe = useCallback(
    async (payload: {
      canonicalName: string
      sourceUrl: string
      ingredients: Array<{ name: string; quantity: number; unit: string }>
      instructions: string[]
      ratingValue?: number
      ratingCount?: number
      likeCount?: number
      shareCount?: number
      description?: string
      iceStyle?: string
      tags?: string[]
    }) => {
      await runSectionTask('recipes', async () => {
        const res = await requestWithBackoff(`${apiUrl}/v1/recipes/ingest`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            source: {
              url: payload.sourceUrl || 'http://local.dev',
              source_type: 'manual',
            },
            canonical_name: payload.canonicalName,
            description: payload.description || undefined,
            ingredients: payload.ingredients,
            instructions: payload.instructions,
            rating_value: payload.ratingValue,
            rating_count: payload.ratingCount,
            like_count: payload.likeCount,
            share_count: payload.shareCount,
            ice_style: payload.iceStyle || undefined,
            tags: payload.tags || undefined,
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          if (res.status === 429) {
            const retryIn = data?.retry_after_seconds
            throw new Error(
              retryIn ? `Ingest is rate-limited. Try again in ${retryIn}s.` : 'Ingest is rate-limited.',
            )
          }
          throw new Error(data?.detail || 'Unable to ingest recipe.')
        }
      })
      await loadRecipes()
    },
    [authHeaders, loadRecipes, requestWithBackoff, runSectionTask],
  )

  const createStudioSession = useCallback(async () => {
    let createdId: string | null = null
    await runSectionTask('studio_sessions', async () => {
      const res = await fetch(`${apiUrl}/v1/studio/sessions`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ status: 'active' }),
      })
      if (!res.ok) {
        throw new Error('Unable to create studio session.')
      }
      const payload = await res.json()
      createdId = payload.id
      setActiveSessionId(payload.id)
      await rememberSession(payload.id, payload.status || 'active')
      await loadStudioSessions()
      await loadStudioVersions(payload.id)
    })
    return createdId
  }, [authHeaders, runSectionTask, rememberSession, loadStudioSessions, loadStudioVersions])

  const openStudioSession = useCallback(
    async (sessionId: string) => {
      setActiveSessionId(sessionId)
      const session = studioSessions.find((entry) => entry.id === sessionId)
      await rememberSession(sessionId, session?.status || 'active')
      await loadStudioVersions(sessionId)
    },
    [studioSessions, rememberSession, loadStudioVersions],
  )

  const createStudioConstraint = useCallback(
    async (payload: {
      sessionId: string
      includeIngredients: string[]
      excludeIngredients: string[]
      style?: string
      abvTarget?: number
    }) => {
      await runSectionTask('studio_versions', async () => {
        const constraints: Record<string, any> = {}
        if (payload.includeIngredients.length) constraints.include_ingredients = payload.includeIngredients
        if (payload.excludeIngredients.length) constraints.exclude_ingredients = payload.excludeIngredients
        if (payload.style) constraints.style = payload.style
        if (payload.abvTarget) constraints.abv_target = payload.abvTarget
        const res = await fetch(`${apiUrl}/v1/studio/sessions/${payload.sessionId}/constraints`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ constraints }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.detail || 'Unable to save constraints.')
        }
      })
    },
    [authHeaders, runSectionTask],
  )

  const generateStudio = useCallback(
    async (sessionId: string) => {
      await runSectionTask('studio_versions', async () => {
        const res = await fetch(`${apiUrl}/v1/studio/sessions/${sessionId}/generate`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({}),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.detail || 'Unable to generate recipe version.')
        }
      })
      await loadStudioVersions(sessionId)
    },
    [authHeaders, loadStudioVersions, runSectionTask],
  )

  const loadStudioDiff = useCallback(
    async (payload: { sessionId: string; fromVersionId: string; toVersionId: string }) => {
      await runSectionTask('studio_versions', async () => {
        const url = new URL(`${apiUrl}/v1/studio/sessions/${payload.sessionId}/diff`)
        url.searchParams.set('from_version_id', payload.fromVersionId)
        url.searchParams.set('to_version_id', payload.toVersionId)
        const res = await fetch(url.toString(), { headers: authHeaders })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.detail || 'Unable to load version diff.')
        }
        setStudioDiff(await res.json())
      })
    },
    [authHeaders, runSectionTask],
  )

  const revertStudioVersion = useCallback(
    async (payload: { sessionId: string; versionId: string }) => {
      await runSectionTask('studio_versions', async () => {
        const res = await fetch(`${apiUrl}/v1/studio/sessions/${payload.sessionId}/revert`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ version_id: payload.versionId }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.detail || 'Unable to revert version.')
        }
      })
      await loadStudioVersions(payload.sessionId)
    },
    [authHeaders, runSectionTask, loadStudioVersions],
  )

  const loadGuidedSteps = useCallback(
    async (sessionId: string) => {
      await runSectionTask('studio_assistant', async () => {
        const res = await fetch(`${apiUrl}/v1/studio/sessions/${sessionId}/guided-making`, { headers: authHeaders })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.detail || 'Unable to load guided steps.')
        }
        const payload = await res.json()
        setGuidedSteps(payload.steps || [])
      })
    },
    [authHeaders, runSectionTask],
  )

  const loadCopilotQuestions = useCallback(
    async (sessionId: string) => {
      await runSectionTask('studio_assistant', async () => {
        const res = await fetch(`${apiUrl}/v1/studio/sessions/${sessionId}/copilot/questions`, {
          method: 'POST',
          headers: authHeaders,
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.detail || 'Unable to load copilot questions.')
        }
        const payload = await res.json()
        setCopilotQuestions(payload.questions || [])
      })
    },
    [authHeaders, runSectionTask],
  )

  const followupCopilot = useCallback(
    async (payload: { sessionId: string; answer: string }) => {
      await runSectionTask('studio_assistant', async () => {
        const res = await fetch(`${apiUrl}/v1/studio/sessions/${payload.sessionId}/copilot/follow-up`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ answer: payload.answer }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.detail || 'Unable to submit copilot answer.')
        }
        const body = await res.json()
        setCopilotFollowup(body.question || '')
      })
      await loadStudioSessions()
    },
    [authHeaders, runSectionTask, loadStudioSessions],
  )

  const setupMfa = useCallback(async () => {
    await runSectionTask('settings', async () => {
      const res = await fetch(`${apiUrl}/v1/auth/mfa/setup`, {
        method: 'POST',
        headers: authHeaders,
      })
      if (!res.ok) {
        throw new Error('Unable to setup MFA.')
      }
      const payload = await res.json()
      setMfaSecret(payload.secret || '')
      setMfaStatus('setup')
    })
  }, [authHeaders, runSectionTask])

  const enableMfa = useCallback(
    async (otp: string) => {
      await runSectionTask('settings', async () => {
        const res = await fetch(`${apiUrl}/v1/auth/mfa/enable`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ token: otp }),
        })
        setMfaStatus(res.ok ? 'enabled' : 'failed')
      })
    },
    [authHeaders, runSectionTask],
  )

  const disableMfa = useCallback(
    async (otp: string) => {
      await runSectionTask('settings', async () => {
        const res = await fetch(`${apiUrl}/v1/auth/mfa/disable`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ token: otp }),
        })
        setMfaStatus(res.ok ? 'disabled' : 'failed')
      })
    },
    [authHeaders, runSectionTask],
  )

  useEffect(() => {
    const bootstrap = async () => {
      setIsBootstrapping(true)
      setBootstrapError('')
      try {
        if (e2eAccessToken) {
          const recentSessionsRaw = await AsyncStorage.getItem('bartenderai.recentSessions')
          setToken(e2eAccessToken)
          if (recentSessionsRaw) {
            const parsed = JSON.parse(recentSessionsRaw)
            if (Array.isArray(parsed)) {
              setRecentSessions(parsed)
            }
          }
          return
        }
        const [tokenRes, recentSessionsRaw] = await Promise.all([
          fetch(`${apiUrl}/v1/auth/dev-token`, { method: 'POST' }),
          AsyncStorage.getItem('bartenderai.recentSessions'),
        ])
        if (!tokenRes.ok) {
          throw new Error('Unable to fetch development token.')
        }
        const tokenPayload = await tokenRes.json()
        setToken(tokenPayload.access_token)
        if (recentSessionsRaw) {
          const parsed = JSON.parse(recentSessionsRaw)
          if (Array.isArray(parsed)) {
            setRecentSessions(parsed)
          }
        }
      } catch (error) {
        setBootstrapError(error instanceof Error ? error.message : 'Bootstrap failed.')
      } finally {
        setIsBootstrapping(false)
      }
    }
    bootstrap()
  }, [])

  useEffect(() => {
    if (!token) return
    loadInventory()
    loadRecipes()
    loadHarvestJobs()
    loadStudioSessions()
    loadRecommendations()
  }, [token, loadInventory, loadRecipes, loadHarvestJobs, loadStudioSessions, loadRecommendations])

  return {
    isBootstrapping,
    bootstrapError,
    sectionStatus,
    ingredients,
    items,
    recipes,
    harvestJobs,
    autoHarvestResult,
    moderationHistory,
    moderationHistoryRecipeId,
    studioSessions,
    studioVersions,
    studioDiff,
    guidedSteps,
    copilotQuestions,
    copilotFollowup,
    activeSessionId,
    recentSessions,
    knowledgeResults,
    makeNow,
    missingOne,
    tonightFlight,
    mfaSecret,
    mfaStatus,
    loadInventory,
    loadRecipes,
    loadHarvestJobs,
    autoHarvest,
    runHarvestJob,
    loadModerations,
    createRecipeModeration,
    loadStudioSessions,
    loadStudioVersions,
    loadKnowledge,
    loadRecommendations,
    createIngredient,
    createItem,
    ingestRecipe,
    fetchRecipeDetail,
    createStudioSession,
    openStudioSession,
    createStudioConstraint,
    generateStudio,
    loadStudioDiff,
    revertStudioVersion,
    loadGuidedSteps,
    loadCopilotQuestions,
    followupCopilot,
    setupMfa,
    enableMfa,
    disableMfa,
  }
}
