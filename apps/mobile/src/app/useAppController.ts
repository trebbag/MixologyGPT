import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { canUseLocalDevTokenBootstrap, resolveMobileApiUrl } from './runtimeConfig'

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

const canUseDevTokenBootstrap = canUseLocalDevTokenBootstrap()
const e2eAccessToken =
  (process.env.EXPO_PUBLIC_E2E_ACCESS_TOKEN ?? '').trim() ||
  (process.env.NODE_ENV === 'test' ? process.env.STAGING_E2E_ACCESS_TOKEN ?? '' : '')
const OFFLINE_ERROR_MESSAGE = 'Network appears offline. Check your connection and try again.'
const ACCESS_TOKEN_STORAGE_KEY = 'bartenderai.auth.accessToken'
const REFRESH_TOKEN_STORAGE_KEY = 'bartenderai.auth.refreshToken'
const RECENT_SESSIONS_STORAGE_KEY = 'bartenderai.recentSessions'

type AuthSession = {
  accessToken: string | null
  refreshToken: string | null
}

type CurrentUserProfile = {
  id: string
  email: string
  role: string
}

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

function buildInitialSectionStatus(): Record<SectionKey, SectionState> {
  return {
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
  }
}

function isOfflineErrorMessage(message: string): boolean {
  const normalized = (message || '').toLowerCase()
  return (
    normalized.includes('network request failed') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('network error') ||
    normalized.includes('offline')
  )
}

function normalizeErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback
  return isOfflineErrorMessage(error.message || '') ? OFFLINE_ERROR_MESSAGE : error.message || fallback
}

function buildApiUrl(pathOrUrl: string, baseUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl
  return `${baseUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`
}

export type AppController = {
  isBootstrapping: boolean
  bootstrapError: string
  isAuthenticated: boolean
  authLoading: boolean
  authError: string
  currentUser: CurrentUserProfile | null
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
  loginWithPassword: (payload: { email: string; password: string; mfaToken?: string }) => Promise<void>
  logout: () => Promise<void>
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
  const runtime = useMemo(() => {
    try {
      return { apiUrl: resolveMobileApiUrl(), error: '' }
    } catch (error) {
      return {
        apiUrl: '',
        error: error instanceof Error ? error.message : 'Unable to resolve API URL.',
      }
    }
  }, [])
  const apiUrl = runtime.apiUrl

  const [session, setSession] = useState<AuthSession>({ accessToken: null, refreshToken: null })
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [bootstrapError, setBootstrapError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [currentUser, setCurrentUser] = useState<CurrentUserProfile | null>(null)
  const [sectionStatus, setSectionStatus] = useState<Record<SectionKey, SectionState>>(buildInitialSectionStatus)
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
  const token = session.accessToken
  const sessionRef = useRef(session)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

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
        const message = normalizeErrorMessage(error, `Failed to load ${key}`)
        updateSectionStatus(key, { loading: false, error: message })
      }
    },
    [updateSectionStatus],
  )

  const resetData = useCallback(() => {
    setSectionStatus(buildInitialSectionStatus())
    setIngredients([])
    setItems([])
    setRecipes([])
    setHarvestJobs([])
    setAutoHarvestResult(null)
    setModerationHistory([])
    setModerationHistoryRecipeId('')
    setStudioSessions([])
    setStudioVersions([])
    setStudioDiff(null)
    setGuidedSteps([])
    setCopilotQuestions([])
    setCopilotFollowup('')
    setActiveSessionId('')
    setKnowledgeResults([])
    setMakeNow([])
    setMissingOne([])
    setTonightFlight([])
    setMfaSecret('')
    setMfaStatus('')
  }, [])

  const persistSession = useCallback(async (nextSession: AuthSession) => {
    const ops: Array<Promise<void>> = []
    if (nextSession.accessToken) {
      ops.push(AsyncStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, nextSession.accessToken))
    } else {
      ops.push(AsyncStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY))
    }
    if (nextSession.refreshToken) {
      ops.push(AsyncStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, nextSession.refreshToken))
    } else {
      ops.push(AsyncStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY))
    }
    await Promise.all(ops)
    setSession(nextSession)
  }, [])

  const clearSession = useCallback(async () => {
    await AsyncStorage.multiRemove([ACCESS_TOKEN_STORAGE_KEY, REFRESH_TOKEN_STORAGE_KEY])
    setSession({ accessToken: null, refreshToken: null })
    setCurrentUser(null)
    setAuthError('')
    resetData()
  }, [resetData])

  const readErrorDetail = useCallback(async (response: Response, fallback: string): Promise<string> => {
    try {
      const payload = await response.json()
      if (typeof payload?.detail === 'string' && payload.detail.trim()) return payload.detail
      if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message
    } catch {
      // ignore invalid JSON bodies
    }
    return response.statusText || fallback
  }, [])

  const rawFetch = useCallback(
    async (pathOrUrl: string, init: RequestInit = {}) => {
      if (!apiUrl) {
        throw new Error(runtime.error || 'Mobile API URL is not configured.')
      }
      return await fetch(buildApiUrl(pathOrUrl, apiUrl), init)
    },
    [apiUrl, runtime.error],
  )

  const loadCurrentUser = useCallback(
    async (accessToken: string) => {
      const response = await rawFetch('/v1/users/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      if (!response.ok) {
        throw new Error(await readErrorDetail(response, 'Unable to load current user.'))
      }
      const payload = (await response.json()) as CurrentUserProfile
      setCurrentUser(payload)
      return payload
    },
    [rawFetch, readErrorDetail],
  )

  const refreshSession = useCallback(
    async (refreshToken: string) => {
      const response = await rawFetch('/v1/auth/jwt/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      if (!response.ok) {
        throw new Error(await readErrorDetail(response, 'Unable to refresh session.'))
      }
      const payload = (await response.json()) as {
        access_token: string
        refresh_token: string
      }
      const nextSession = {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
      }
      await persistSession(nextSession)
      return nextSession
    },
    [persistSession, rawFetch, readErrorDetail],
  )

  const authorizedFetch = useCallback(
    async (pathOrUrl: string, init: RequestInit = {}, retryOnUnauthorized: boolean = true): Promise<Response> => {
      const accessToken = sessionRef.current.accessToken
      const refreshToken = sessionRef.current.refreshToken
      if (!accessToken) {
        throw new Error('Please sign in to continue.')
      }

      const headers = new Headers(init.headers || {})
      if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
      headers.set('Authorization', `Bearer ${accessToken}`)

      let response = await rawFetch(pathOrUrl, { ...init, headers })
      if (response.status !== 401) {
        return response
      }
      if (!retryOnUnauthorized) {
        return response
      }
      if (!refreshToken) {
        await clearSession()
        throw new Error('Session expired. Sign in again.')
      }

      try {
        const nextSession = await refreshSession(refreshToken)
        const retryHeaders = new Headers(init.headers || {})
        if (init.body && !retryHeaders.has('Content-Type')) retryHeaders.set('Content-Type', 'application/json')
        retryHeaders.set('Authorization', `Bearer ${nextSession.accessToken}`)
        response = await rawFetch(pathOrUrl, { ...init, headers: retryHeaders })
      } catch (error) {
        await clearSession()
        throw new Error(normalizeErrorMessage(error, 'Session expired. Sign in again.'))
      }

      if (response.status === 401) {
        await clearSession()
        throw new Error('Session expired. Sign in again.')
      }

      return response
    },
    [clearSession, rawFetch, refreshSession],
  )

  const requestWithBackoff = useCallback(
    async (pathOrUrl: string, init: RequestInit, retries: number = 2): Promise<Response> => {
      let response: Response | null = null
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        response = await authorizedFetch(pathOrUrl, init)
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
    [authorizedFetch],
  )

  const rememberSession = useCallback(async (id: string, status: string) => {
    setRecentSessions((prev) => {
      const next = [{ id, status }, ...prev.filter((item) => item.id !== id)].slice(0, 5)
      AsyncStorage.setItem(RECENT_SESSIONS_STORAGE_KEY, JSON.stringify(next)).catch(() => undefined)
      return next
    })
  }, [])

  const loadInventory = useCallback(async () => {
    await runSectionTask('inventory', async () => {
      const [ingredientsRes, itemsRes] = await Promise.all([
        authorizedFetch('/v1/inventory/ingredients'),
        authorizedFetch('/v1/inventory/items'),
      ])
      if (!ingredientsRes.ok || !itemsRes.ok) {
        throw new Error('Unable to load inventory resources.')
      }
      setIngredients(await ingredientsRes.json())
      setItems(await itemsRes.json())
    })
  }, [authorizedFetch, runSectionTask])

  const loadRecipes = useCallback(
    async (query?: string) => {
      await runSectionTask('recipes', async () => {
        const url = query ? `/v1/recipes?q=${encodeURIComponent(query)}` : '/v1/recipes'
        const res = await authorizedFetch(url)
        if (!res.ok) {
          throw new Error('Unable to load recipes.')
        }
        setRecipes(await res.json())
      })
    },
    [authorizedFetch, runSectionTask],
  )

  const fetchRecipeDetail = useCallback(
    async (recipeId: string) => {
      const res = await authorizedFetch(`/v1/recipes/${recipeId}`)
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.detail || 'Unable to load recipe details.')
      }
      return await res.json()
    },
    [authorizedFetch],
  )

  const loadHarvestJobs = useCallback(async () => {
    await runSectionTask('harvest', async () => {
      const res = await authorizedFetch('/v1/recipes/harvest/jobs')
      if (!res.ok) {
        throw new Error('Unable to load harvest jobs.')
      }
      setHarvestJobs(await res.json())
    })
  }, [authorizedFetch, runSectionTask])

  const autoHarvest = useCallback(
    async (sourceUrl: string, maxLinks: number) => {
      let shouldRefreshJobs = false
      await runSectionTask('harvest', async () => {
        const res = await requestWithBackoff('/v1/recipes/harvest/auto', {
          method: 'POST',
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
    [runSectionTask, loadHarvestJobs, requestWithBackoff],
  )

  const runHarvestJob = useCallback(
    async (jobId: string) => {
      let shouldRefresh = false
      await runSectionTask('harvest', async () => {
        const res = await requestWithBackoff(`/v1/recipes/harvest/jobs/${jobId}/run`, {
          method: 'POST',
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
    [runSectionTask, loadHarvestJobs, loadRecipes, requestWithBackoff],
  )

  const loadModerations = useCallback(
    async (recipeId: string) => {
      await runSectionTask('reviews', async () => {
        setModerationHistoryRecipeId(recipeId)
        setModerationHistory([])
        const res = await authorizedFetch(`/v1/reviews/recipes/${recipeId}/moderations`)
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}))
          throw new Error(payload?.detail || 'Unable to load moderation history.')
        }
        setModerationHistory(await res.json())
      })
    },
    [authorizedFetch, runSectionTask],
  )

  const createRecipeModeration = useCallback(
    async (payload: { recipeId: string; status: string; qualityLabel?: string; notes?: string }) => {
      await runSectionTask('reviews', async () => {
        const res = await authorizedFetch(`/v1/reviews/recipes/${payload.recipeId}/moderations`, {
          method: 'POST',
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
    [authorizedFetch, runSectionTask, loadModerations, loadRecipes],
  )

  const loadStudioSessions = useCallback(async () => {
    await runSectionTask('studio_sessions', async () => {
      const res = await authorizedFetch('/v1/studio/sessions')
      if (!res.ok) {
        throw new Error('Unable to load studio sessions.')
      }
      setStudioSessions(await res.json())
    })
  }, [authorizedFetch, runSectionTask])

  const loadStudioVersions = useCallback(
    async (sessionId: string) => {
      await runSectionTask('studio_versions', async () => {
        const res = await authorizedFetch(`/v1/studio/sessions/${sessionId}/versions`)
        if (!res.ok) {
          throw new Error('Unable to load studio versions.')
        }
        setStudioVersions(await res.json())
      })
    },
    [authorizedFetch, runSectionTask],
  )

  const loadKnowledge = useCallback(
    async (query: string) => {
      await runSectionTask('knowledge', async () => {
        const res = await authorizedFetch('/v1/knowledge/search', {
          method: 'POST',
          body: JSON.stringify({ query, limit: 5 }),
        })
        if (!res.ok) {
          throw new Error('Knowledge search failed.')
        }
        const payload = await res.json()
        setKnowledgeResults(payload.results ?? [])
      })
    },
    [authorizedFetch, runSectionTask],
  )

  const loadRecommendations = useCallback(async () => {
    await runSectionTask('recommendations', async () => {
      const [makeRes, missingRes, flightRes] = await Promise.all([
        authorizedFetch('/v1/recommendations/make-now'),
        authorizedFetch('/v1/recommendations/missing-one'),
        authorizedFetch('/v1/recommendations/tonight-flight'),
      ])
      if (!makeRes.ok || !missingRes.ok || !flightRes.ok) {
        throw new Error('Unable to load recommendations.')
      }
      setMakeNow(await makeRes.json())
      setMissingOne(await missingRes.json())
      setTonightFlight(await flightRes.json())
    })
  }, [authorizedFetch, runSectionTask])

  const createIngredient = useCallback(
    async (name: string) => {
      const res = await authorizedFetch('/v1/inventory/ingredients', {
        method: 'POST',
        body: JSON.stringify({ canonical_name: name }),
      })
      if (!res.ok) {
        throw new Error(await readErrorDetail(res, 'Unable to create ingredient.'))
      }
      await loadInventory()
    },
    [authorizedFetch, loadInventory, readErrorDetail],
  )

  const createItem = useCallback(
    async (ingredientId: string, unit: string, preferredUnit?: string) => {
      const res = await authorizedFetch('/v1/inventory/items', {
        method: 'POST',
        body: JSON.stringify({
          ingredient_id: ingredientId,
          unit,
          preferred_unit: preferredUnit || undefined,
        }),
      })
      if (!res.ok) {
        throw new Error(await readErrorDetail(res, 'Unable to create inventory item.'))
      }
      await loadInventory()
    },
    [authorizedFetch, loadInventory, readErrorDetail],
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
        const res = await requestWithBackoff('/v1/recipes/ingest', {
          method: 'POST',
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
    [loadRecipes, requestWithBackoff, runSectionTask],
  )

  const createStudioSession = useCallback(async () => {
    let createdId: string | null = null
    await runSectionTask('studio_sessions', async () => {
      const res = await authorizedFetch('/v1/studio/sessions', {
        method: 'POST',
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
  }, [authorizedFetch, runSectionTask, rememberSession, loadStudioSessions, loadStudioVersions])

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
        const res = await authorizedFetch(`/v1/studio/sessions/${payload.sessionId}/constraints`, {
          method: 'POST',
          body: JSON.stringify({ constraints }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.detail || 'Unable to save constraints.')
        }
      })
    },
    [authorizedFetch, runSectionTask],
  )

  const generateStudio = useCallback(
    async (sessionId: string) => {
      await runSectionTask('studio_versions', async () => {
        const res = await authorizedFetch(`/v1/studio/sessions/${sessionId}/generate`, {
          method: 'POST',
          body: JSON.stringify({}),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.detail || 'Unable to generate recipe version.')
        }
      })
      await loadStudioVersions(sessionId)
    },
    [authorizedFetch, loadStudioVersions, runSectionTask],
  )

  const loadStudioDiff = useCallback(
    async (payload: { sessionId: string; fromVersionId: string; toVersionId: string }) => {
      await runSectionTask('studio_versions', async () => {
        const url = new URL(buildApiUrl(`/v1/studio/sessions/${payload.sessionId}/diff`, apiUrl))
        url.searchParams.set('from_version_id', payload.fromVersionId)
        url.searchParams.set('to_version_id', payload.toVersionId)
        const res = await authorizedFetch(url.toString())
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.detail || 'Unable to load version diff.')
        }
        setStudioDiff(await res.json())
      })
    },
    [apiUrl, authorizedFetch, runSectionTask],
  )

  const revertStudioVersion = useCallback(
    async (payload: { sessionId: string; versionId: string }) => {
      await runSectionTask('studio_versions', async () => {
        const res = await authorizedFetch(`/v1/studio/sessions/${payload.sessionId}/revert`, {
          method: 'POST',
          body: JSON.stringify({ version_id: payload.versionId }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.detail || 'Unable to revert version.')
        }
      })
      await loadStudioVersions(payload.sessionId)
    },
    [authorizedFetch, runSectionTask, loadStudioVersions],
  )

  const loadGuidedSteps = useCallback(
    async (sessionId: string) => {
      await runSectionTask('studio_assistant', async () => {
        const res = await authorizedFetch(`/v1/studio/sessions/${sessionId}/guided-making`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.detail || 'Unable to load guided steps.')
        }
        const payload = await res.json()
        setGuidedSteps(payload.steps || [])
      })
    },
    [authorizedFetch, runSectionTask],
  )

  const loadCopilotQuestions = useCallback(
    async (sessionId: string) => {
      await runSectionTask('studio_assistant', async () => {
        const res = await authorizedFetch(`/v1/studio/sessions/${sessionId}/copilot/questions`, {
          method: 'POST',
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.detail || 'Unable to load copilot questions.')
        }
        const payload = await res.json()
        setCopilotQuestions(payload.questions || [])
      })
    },
    [authorizedFetch, runSectionTask],
  )

  const followupCopilot = useCallback(
    async (payload: { sessionId: string; answer: string }) => {
      await runSectionTask('studio_assistant', async () => {
        const res = await authorizedFetch(`/v1/studio/sessions/${payload.sessionId}/copilot/follow-up`, {
          method: 'POST',
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
    [authorizedFetch, runSectionTask, loadStudioSessions],
  )

  const setupMfa = useCallback(async () => {
    await runSectionTask('settings', async () => {
      const res = await authorizedFetch('/v1/auth/mfa/setup', {
        method: 'POST',
      })
      if (!res.ok) {
        throw new Error('Unable to setup MFA.')
      }
      const payload = await res.json()
      setMfaSecret(payload.secret || '')
      setMfaStatus('setup')
    })
  }, [authorizedFetch, runSectionTask])

  const enableMfa = useCallback(
    async (otp: string) => {
      await runSectionTask('settings', async () => {
        const res = await authorizedFetch('/v1/auth/mfa/enable', {
          method: 'POST',
          body: JSON.stringify({ token: otp }),
        })
        setMfaStatus(res.ok ? 'enabled' : 'failed')
      })
    },
    [authorizedFetch, runSectionTask],
  )

  const disableMfa = useCallback(
    async (otp: string) => {
      await runSectionTask('settings', async () => {
        const res = await authorizedFetch('/v1/auth/mfa/disable', {
          method: 'POST',
          body: JSON.stringify({ token: otp }),
        })
        setMfaStatus(res.ok ? 'disabled' : 'failed')
      })
    },
    [authorizedFetch, runSectionTask],
  )

  const hydrateRecentSessions = useCallback(async () => {
    const recentSessionsRaw = await AsyncStorage.getItem(RECENT_SESSIONS_STORAGE_KEY)
    if (!recentSessionsRaw) {
      setRecentSessions([])
      return
    }
    try {
      const parsed = JSON.parse(recentSessionsRaw)
      if (Array.isArray(parsed)) {
        setRecentSessions(parsed)
        return
      }
    } catch {
      // ignore invalid persisted data
    }
    setRecentSessions([])
  }, [])

  const loginWithPassword = useCallback(
    async (payload: { email: string; password: string; mfaToken?: string }) => {
      setAuthLoading(true)
      setAuthError('')
      setBootstrapError('')
      try {
        const response = await rawFetch('/v1/auth/jwt/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: payload.email,
            password: payload.password,
            mfa_token: payload.mfaToken || undefined,
          }),
        })
        if (!response.ok) {
          throw new Error(await readErrorDetail(response, 'Unable to sign in.'))
        }
        const tokenPayload = (await response.json()) as {
          access_token: string
          refresh_token: string
        }
        const nextSession = {
          accessToken: tokenPayload.access_token,
          refreshToken: tokenPayload.refresh_token,
        }
        await persistSession(nextSession)
        await loadCurrentUser(nextSession.accessToken)
      } catch (error) {
        const message = normalizeErrorMessage(error, 'Unable to sign in.')
        setAuthError(message)
      } finally {
        setAuthLoading(false)
      }
    },
    [loadCurrentUser, persistSession, rawFetch, readErrorDetail],
  )

  const logout = useCallback(async () => {
    setAuthLoading(true)
    setAuthError('')
    const refreshToken = sessionRef.current.refreshToken
    try {
      if (refreshToken) {
        await rawFetch('/v1/auth/jwt/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
      }
    } finally {
      await clearSession()
      setAuthLoading(false)
    }
  }, [clearSession, rawFetch])

  useEffect(() => {
    const bootstrap = async () => {
      setIsBootstrapping(true)
      setBootstrapError('')
      try {
        if (runtime.error) {
          throw new Error(runtime.error)
        }
        await hydrateRecentSessions()
        if (e2eAccessToken) {
          setSession({ accessToken: e2eAccessToken, refreshToken: null })
          await loadCurrentUser(e2eAccessToken)
          return
        }

        const storedAccessToken = (await AsyncStorage.getItem(ACCESS_TOKEN_STORAGE_KEY))?.trim() || ''
        const storedRefreshToken = (await AsyncStorage.getItem(REFRESH_TOKEN_STORAGE_KEY))?.trim() || ''
        if (storedAccessToken) {
          setSession({
            accessToken: storedAccessToken,
            refreshToken: storedRefreshToken || null,
          })
          try {
            await loadCurrentUser(storedAccessToken)
            return
          } catch {
            if (storedRefreshToken) {
              try {
                const refreshed = await refreshSession(storedRefreshToken)
                await loadCurrentUser(refreshed.accessToken as string)
                return
              } catch {
                await clearSession()
              }
            } else {
              await clearSession()
            }
          }
        }

        if (canUseDevTokenBootstrap) {
          const tokenRes = await rawFetch('/v1/auth/dev-token', { method: 'POST' })
          if (!tokenRes.ok) {
            throw new Error('Unable to fetch development token.')
          }
          const tokenPayload = await tokenRes.json()
          const nextSession = {
            accessToken: tokenPayload.access_token,
            refreshToken: null,
          }
          await persistSession(nextSession)
          await loadCurrentUser(nextSession.accessToken as string)
          return
        }

        await clearSession()
      } catch (error) {
        setBootstrapError(normalizeErrorMessage(error, 'Bootstrap failed.'))
      } finally {
        setIsBootstrapping(false)
      }
    }
    bootstrap()
  }, [clearSession, hydrateRecentSessions, loadCurrentUser, persistSession, rawFetch, refreshSession, runtime.error])

  useEffect(() => {
    if (isBootstrapping || !token) return
    setAuthError('')
    loadInventory()
    loadRecipes()
    loadHarvestJobs()
    loadStudioSessions()
    loadRecommendations()
  }, [isBootstrapping, token, loadInventory, loadRecipes, loadHarvestJobs, loadStudioSessions, loadRecommendations])

  return {
    isBootstrapping,
    bootstrapError,
    isAuthenticated: Boolean(token),
    authLoading,
    authError,
    currentUser,
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
    loginWithPassword,
    logout,
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
