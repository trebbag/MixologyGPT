import { useEffect, useMemo, useState } from 'react'
import type { NextPage } from 'next'
import { useRouter } from 'next/router'
import { ShieldAlert } from 'lucide-react'

import { AppLayout } from '../components/figma/AppLayout'
import { LoginView } from '../components/figma/LoginView'
import { hasRole } from '../components/figma/nav'
import { clearTokens, loadStoredTokens, type StoredTokens } from '../lib/auth'
import { getCurrentUser, loginWithDevToken, loginWithPassword, type CurrentUser } from '../lib/api'
import { DashboardView } from '../components/views/DashboardView'
import { PlaceholderView } from '../components/views/PlaceholderView'
import { RecipesLibraryView } from '../components/views/recipes/RecipesLibraryView'
import { RecipeDetailView } from '../components/views/recipes/RecipeDetailView'
import { RecipeIngestView } from '../components/views/recipes/RecipeIngestView'
import { HarvestPipelineView } from '../components/views/recipes/HarvestPipelineView'
import { HarvestJobDetailView } from '../components/views/recipes/HarvestJobDetailView'
import { SourceDiscoveryView } from '../components/views/recipes/SourceDiscoveryView'
import { SourcePoliciesView } from '../components/views/admin/SourcePoliciesView'
import { CrawlerOpsView } from '../components/views/admin/CrawlerOpsView'
import { AdminJobsView } from '../components/views/admin/AdminJobsView'
import { MediaManagerView } from '../components/views/admin/MediaManagerView'
import { InventoryOverviewView } from '../components/views/inventory/InventoryOverviewView'
import { InventoryIngredientsView } from '../components/views/inventory/InventoryIngredientsView'
import { InventoryInsightsView } from '../components/views/inventory/InventoryInsightsView'
import { InventoryEventsView } from '../components/views/inventory/InventoryEventsView'
import { InventoryConversionsView } from '../components/views/inventory/InventoryConversionsView'
import { InventoryEquipmentView } from '../components/views/inventory/InventoryEquipmentView'
import { InventoryGlasswareView } from '../components/views/inventory/InventoryGlasswareView'
import { InventoryEquivalenciesView } from '../components/views/inventory/InventoryEquivalenciesView'
import { InventoryItemSettingsView } from '../components/views/inventory/InventoryItemSettingsView'
import { ExpiryRulesView } from '../components/views/inventory/ExpiryRulesView'
import { InventoryLotFormView } from '../components/views/inventory/InventoryLotFormView'
import { StudioSessionsView } from '../components/views/studio/StudioSessionsView'
import { StudioSessionView } from '../components/views/studio/StudioSessionView'
import { RecipesModerationView } from '../components/views/recipes/RecipesModerationView'
import { RecommendationsView } from '../components/views/recommendations/RecommendationsView'
import { PartyView } from '../components/views/party/PartyView'
import { KnowledgeView } from '../components/views/knowledge/KnowledgeView'
import { SearchOverlay } from '../components/figma/overlays/SearchOverlay'
import { QuickAddOverlay } from '../components/figma/overlays/QuickAddOverlay'
import { NotificationsOverlay } from '../components/figma/overlays/NotificationsOverlay'

type RouteSpec = {
  key: string
  minRole?: string
}

function routeSpec(pathname: string): RouteSpec {
  const parts = pathname.split('?')[0].split('#')[0].split('/').filter(Boolean)
  if (parts.length === 0 || parts[0] === 'dashboard') return { key: 'dashboard' }

  if (parts[0] === 'recipes') {
    if (parts[1] === 'ingest') return { key: 'recipes/ingest', minRole: 'power' }
    if (parts[1] === 'harvest') return { key: 'recipes/harvest', minRole: 'power' }
    if (parts[1] === 'source-discovery') return { key: 'recipes/source-discovery', minRole: 'power' }
    if (parts[1] === 'moderation') return { key: 'recipes/moderation', minRole: 'admin' }
    if (parts.length >= 2 && parts[1]) return { key: 'recipes/detail' }
    return { key: 'recipes/library' }
  }

  if (parts[0] === 'admin') return { key: 'admin', minRole: 'admin' }
  if (parts[0] === 'inventory') {
    if (parts[1] === 'settings') return { key: 'inventory/settings' }
    if (parts[1] === 'insights') return { key: 'inventory/insights' }
    if (parts[1] === 'events') return { key: 'inventory/events' }
    if (parts[1] === 'ontology') return { key: 'inventory/ontology' }
    if (parts[1] === 'equivalencies') return { key: 'inventory/equivalencies' }
    if (parts[1] === 'expiry-rules') return { key: 'inventory/expiry-rules' }
    if (parts[1] === 'conversions') return { key: 'inventory/conversions' }
    if (parts[1] === 'equipment') return { key: 'inventory/equipment' }
    if (parts[1] === 'glassware') return { key: 'inventory/glassware' }
    if (parts[1] === 'lot' && parts[2] === 'new') return { key: 'inventory/lot/new' }
    if (parts[1] === 'lot' && parts[2]) return { key: 'inventory/lot/edit' }
    return { key: 'inventory/overview' }
  }
  if (parts[0] === 'studio') {
    if (parts[1] === 'versions' && parts[2] === 'diff') return { key: 'studio/diff', minRole: 'power' }
    if (parts.length >= 2 && parts[1]) return { key: 'studio/session', minRole: 'power' }
    return { key: 'studio/sessions', minRole: 'power' }
  }
  if (parts[0] === 'recommendations') return { key: 'recommendations' }
  if (parts[0] === 'party') return { key: 'party' }
  if (parts[0] === 'knowledge') return { key: 'knowledge' }
  return { key: 'not-found' }
}

function PermissionDenied({ requiredRole }: { requiredRole: string }) {
  const router = useRouter()
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="w-10 h-10 text-red-300" aria-hidden="true" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">Access Denied</h2>
        <p className="text-gray-400 mb-6">
          This feature requires <span className="text-purple-300 font-semibold">{requiredRole}</span> role or higher.
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-lg text-white font-medium"
          type="button"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  )
}

const WebAppPage: NextPage = () => {
  const router = useRouter()
  const pathname = typeof router.asPath === 'string' ? router.asPath.split('?')[0].split('#')[0] : '/'

  // Avoid hydration mismatch: server and initial client render both start in a "boot" state.
  const [tokens, setTokens] = useState<StoredTokens | null>(null)
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)

  useEffect(() => {
    // Defer state updates to avoid "setState in effect body" lint and keep hydration stable.
    queueMicrotask(() => {
      setTokens(loadStoredTokens())
      setAuthLoading(false)
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const loadUser = async () => {
      if (!tokens?.accessToken) {
        setUser(null)
        return
      }
      setAuthError('')
      try {
        const me = await getCurrentUser(tokens.accessToken)
        setUser(me)
      } catch (err) {
        clearTokens()
        setTokens(null)
        setUser(null)
        setAuthError(err instanceof Error ? err.message : 'Authentication failed.')
      }
    }
    void loadUser()
  }, [tokens?.accessToken])

  const spec = useMemo(() => routeSpec(pathname), [pathname])
  const role = user?.role || 'user'

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-sm text-gray-300">Loading…</div>
      </div>
    )
  }

  if (!tokens?.accessToken) {
    return (
      <LoginView
        onLogin={async (payload) => {
          const next = await loginWithPassword(payload)
          setTokens(next)
          if (pathname === '/') {
            await router.push('/dashboard')
          }
        }}
        onDevLogin={
          process.env.NEXT_PUBLIC_ALLOW_DEV_TOKEN === 'true'
            ? async () => {
                const next = await loginWithDevToken()
                setTokens(next)
                await router.push('/dashboard')
              }
            : undefined
        }
      />
    )
  }

  return (
    <>
      <AppLayout
        role={role}
        unreadNotifications={unreadNotifications}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenNotifications={() => setNotificationsOpen(true)}
        onOpenSettings={() => {
          const ok = window.confirm('Log out?')
          if (ok) {
            clearTokens()
            setTokens(null)
            setUser(null)
            void router.push('/dashboard')
          }
        }}
        onOpenQuickAdd={() => setQuickAddOpen(true)}
      >
        {authError ? (
          <div className="p-8">
            <div className="max-w-4xl mx-auto">
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-sm text-red-200">
                {authError}
              </div>
            </div>
          </div>
        ) : null}

        {spec.minRole && !hasRole(role, spec.minRole as any) ? (
          <PermissionDenied requiredRole={spec.minRole} />
        ) : spec.key === 'dashboard' ? (
          <DashboardView />
        ) : spec.key === 'recipes/library' ? (
          <RecipesLibraryView />
        ) : spec.key === 'recipes/ingest' ? (
          <RecipeIngestView />
        ) : spec.key === 'recipes/detail' ? (
          <RecipeDetailView recipeId={pathname.split('/').filter(Boolean)[1] || ''} />
        ) : spec.key === 'recipes/harvest' ? (
          pathname.split('/').filter(Boolean).length >= 3 ? (
            <HarvestJobDetailView jobId={pathname.split('/').filter(Boolean)[2] || ''} />
          ) : (
            <HarvestPipelineView />
          )
        ) : spec.key === 'recipes/source-discovery' ? (
          <SourceDiscoveryView />
        ) : spec.key === 'recipes/moderation' ? (
          <RecipesModerationView />
        ) : spec.key === 'admin' ? (
          (() => {
            const parts = pathname.split('/').filter(Boolean)
            if (parts[1] === 'sources') return <SourcePoliciesView />
            if (parts[1] === 'crawler-ops') return <CrawlerOpsView />
            if (parts[1] === 'jobs') return <AdminJobsView />
            if (parts[1] === 'media') return <MediaManagerView />
            return <PlaceholderView title="Admin Overview" description="Choose a subpage: Source Policies, Crawler Ops, or System Jobs." />
          })()
        ) : spec.key === 'inventory/overview' ? (
          <InventoryOverviewView role={role} />
        ) : spec.key === 'inventory/settings' ? (
          <InventoryItemSettingsView />
        ) : spec.key === 'inventory/insights' ? (
          <InventoryInsightsView />
        ) : spec.key === 'inventory/events' ? (
          <InventoryEventsView />
        ) : spec.key === 'inventory/ontology' ? (
          <InventoryIngredientsView role={role} />
        ) : spec.key === 'inventory/equivalencies' ? (
          <InventoryEquivalenciesView />
        ) : spec.key === 'inventory/expiry-rules' ? (
          <ExpiryRulesView />
        ) : spec.key === 'inventory/conversions' ? (
          <InventoryConversionsView />
        ) : spec.key === 'inventory/equipment' ? (
          <InventoryEquipmentView />
        ) : spec.key === 'inventory/glassware' ? (
          <InventoryGlasswareView />
        ) : spec.key === 'inventory/lot/new' ? (
          <InventoryLotFormView mode="create" />
        ) : spec.key === 'inventory/lot/edit' ? (
          <InventoryLotFormView mode="edit" lotId={pathname.split('/').filter(Boolean)[2] || ''} />
        ) : spec.key === 'studio/sessions' ? (
          <StudioSessionsView />
        ) : spec.key === 'studio/diff' ? (
          <PlaceholderView title="Version Diff" description="Open a studio session and use the Version Diff panel to compare versions." />
        ) : spec.key === 'studio/session' ? (
          <StudioSessionView sessionId={pathname.split('/').filter(Boolean)[1] || ''} />
        ) : spec.key === 'recommendations' ? (
          <RecommendationsView />
        ) : spec.key === 'party' ? (
          <PartyView />
        ) : spec.key === 'knowledge' ? (
          <KnowledgeView />
        ) : (
          <PlaceholderView title="Not Found" description="This route is not yet implemented in the new shell." />
        )}
      </AppLayout>

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={(route) => {
          void router.push(route)
        }}
      />
      <QuickAddOverlay
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        role={role}
        onCompleted={() => {
          // keep minimal; pages will refetch on manual refresh.
        }}
      />
      <NotificationsOverlay
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onUnreadCountChange={(count) => setUnreadNotifications(count)}
      />
    </>
  )
}

export default WebAppPage
