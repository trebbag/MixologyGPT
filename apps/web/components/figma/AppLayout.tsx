import { ReactNode, useMemo } from 'react'
import { useRouter } from 'next/router'
import { ArrowLeft, Bell, ChevronRight, Plus, Search, Settings, Wine } from 'lucide-react'

import { hasRole, NAV_ITEMS, type NavItem, type NavSectionKey } from './nav'

export type AppLayoutProps = {
  role: string
  unreadNotifications?: number
  onOpenSearch?: () => void
  onOpenQuickAdd?: () => void
  onOpenNotifications?: () => void
  onOpenSettings?: () => void
  children: ReactNode
}

function sectionKeyFromPath(pathname: string): NavSectionKey {
  const first = pathname.split('?')[0]?.split('#')[0]?.split('/').filter(Boolean)[0]
  const key = (first || 'dashboard').toLowerCase()
  const allowed: NavSectionKey[] = [
    'dashboard',
    'inventory',
    'recipes',
    'studio',
    'recommendations',
    'party',
    'knowledge',
    'admin',
  ]
  return allowed.includes(key as NavSectionKey) ? (key as NavSectionKey) : 'dashboard'
}

function navForSection(section: NavSectionKey): NavItem {
  return NAV_ITEMS.find((item) => item.key === section) ?? NAV_ITEMS[0]
}

export function AppLayout({
  role,
  unreadNotifications = 0,
  onOpenSearch,
  onOpenQuickAdd,
  onOpenNotifications,
  onOpenSettings,
  children,
}: AppLayoutProps) {
  const router = useRouter()
  const pathname = typeof router.asPath === 'string' ? router.asPath : '/'
  const section = useMemo(() => sectionKeyFromPath(pathname), [pathname])
  const nav = useMemo(() => navForSection(section), [section])

  const visibleNav = useMemo(
    () => NAV_ITEMS.filter((item) => hasRole(role, item.minRole)),
    [role],
  )

  const breadcrumbs = useMemo(() => {
    const parts = pathname.split('?')[0]?.split('#')[0]?.split('/').filter(Boolean)
    if (!parts.length) return []
    const current = parts.join('/')
    if (current === section) return []
    const currentLabel =
      nav.subRoutes?.find((r) => pathname.startsWith(r.path))?.label ||
      nav.label
    if (currentLabel === nav.label) return []
    return [{ label: nav.label, path: nav.paths[0] }, { label: currentLabel, path: pathname }]
  }, [pathname, nav, section])

  const showBackButton = breadcrumbs.length > 0 && pathname !== nav.paths[0]

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Left rail */}
      <nav
        className="w-20 bg-black/40 backdrop-blur-xl border-r border-white/10 flex flex-col items-center py-6 space-y-2"
        data-testid="app-left-rail"
      >
        <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mb-4">
          <Wine className="w-7 h-7 text-white" aria-hidden="true" />
        </div>

        {visibleNav.map((item) => {
          const Icon = item.icon
          const isActive = item.key === section
          const basePath = item.subRoutes?.[0]?.path || item.paths[0]
          return (
            <button
              key={item.key}
              onClick={() => router.push(basePath)}
              className={`relative group w-full aspect-square rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/50'
                  : 'hover:bg-white/10'
              }`}
              title={item.label}
              type="button"
            >
              <Icon className={`w-5 h-5 absolute inset-0 m-auto ${isActive ? 'text-white' : 'text-gray-400'}`} />
              {isActive && <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-l-full" />}
            </button>
          )
        })}

        <div className="flex-1" />

        <div className="text-xs text-gray-400 font-medium uppercase tracking-wider transform -rotate-90 whitespace-nowrap">
          {role || 'user'}
        </div>
      </nav>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header
          className="h-16 bg-black/20 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-6"
          data-testid="app-header"
        >
          <div className="flex items-center space-x-4">
            {showBackButton && (
              <button
                onClick={() => router.push(nav.paths[0])}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                type="button"
                data-testid="app-back"
              >
                <ArrowLeft className="w-5 h-5 text-gray-400" aria-hidden="true" />
              </button>
            )}

            <h1
              className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent"
              data-testid="app-section-title"
            >
              {nav.label}
            </h1>

            {breadcrumbs.length > 0 && (
              <>
                <ChevronRight className="w-4 h-4 text-gray-500" aria-hidden="true" />
                <span className="text-gray-300">{breadcrumbs[breadcrumbs.length - 1].label}</span>
              </>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onOpenSearch}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg flex items-center space-x-2 transition-colors"
              type="button"
              data-testid="app-open-search"
            >
              <Search className="w-4 h-4 text-gray-300" aria-hidden="true" />
              <span className="text-sm text-gray-300">Search</span>
              <span className="text-xs text-gray-500 bg-black/30 px-2 py-0.5 rounded">Ctrl K</span>
            </button>

            <button
              onClick={onOpenNotifications}
              className="relative p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              type="button"
              data-testid="app-open-notifications"
            >
              <Bell className="w-5 h-5 text-gray-300" aria-hidden="true" />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs text-white font-bold">
                  {unreadNotifications}
                </span>
              )}
            </button>

            <button
              onClick={onOpenSettings}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              type="button"
              data-testid="app-open-settings"
            >
              <Settings className="w-5 h-5 text-gray-300" aria-hidden="true" />
            </button>

            <button
              onClick={onOpenQuickAdd}
              className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-lg flex items-center space-x-2 transition-colors shadow-lg shadow-purple-500/30"
              type="button"
              data-testid="app-open-quick-add"
            >
              <Plus className="w-4 h-4 text-white" aria-hidden="true" />
              <span className="text-sm text-white font-medium">Quick Add</span>
            </button>
          </div>
        </header>

        {nav.subRoutes && nav.subRoutes.length > 1 && (
          <div className="h-12 bg-black/10 backdrop-blur-xl border-b border-white/10 flex items-center px-6 space-x-2 overflow-x-auto">
            {nav.subRoutes
              .filter((route) => hasRole(role, route.minRole))
              .map((route) => (
                <button
                  key={route.path}
                  onClick={() => router.push(route.path)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    pathname === route.path || pathname.startsWith(route.path + '/')
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                      : 'text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                  type="button"
                >
                  {route.label}
                </button>
              ))}
          </div>
        )}

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
