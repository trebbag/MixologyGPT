import { ReactNode, useMemo } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Bell,
  BookOpen,
  GraduationCap,
  Home,
  Lightbulb,
  Package,
  Plus,
  Search,
  Settings,
  Shield,
  Sparkles,
  Users,
  Wine,
} from 'lucide-react'

type NavKey =
  | 'dashboard'
  | 'inventory'
  | 'recipes'
  | 'studio'
  | 'recommendations'
  | 'party'
  | 'knowledge'
  | 'admin'
  | 'settings'

type NavItem = {
  key: NavKey
  label: string
  shortLabel: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', shortLabel: 'DB', icon: Home },
  { key: 'inventory', label: 'Inventory', shortLabel: 'IN', icon: Package },
  { key: 'recipes', label: 'Recipes', shortLabel: 'RC', icon: BookOpen },
  { key: 'studio', label: 'Studio', shortLabel: 'ST', icon: Sparkles },
  { key: 'recommendations', label: 'Recommendations', shortLabel: 'RE', icon: Lightbulb },
  { key: 'party', label: 'Party', shortLabel: 'PT', icon: Users },
  { key: 'knowledge', label: 'Knowledge', shortLabel: 'KN', icon: GraduationCap },
  { key: 'admin', label: 'Admin', shortLabel: 'AD', icon: Shield },
  { key: 'settings', label: 'Settings', shortLabel: 'SE', icon: Settings },
]

const VIEW_DESCRIPTIONS: Record<NavKey, string> = {
  dashboard: 'Cross-feature operational overview',
  inventory: 'Ingredients, lots, conversions, and stock health',
  recipes: 'Library, ingestion, harvest, and moderation',
  studio: 'Constraint-based recipe generation and iteration',
  recommendations: 'Make-now, missing-one, unlock score, and flights',
  party: 'Batch planning and guest service flows',
  knowledge: 'Licensed knowledge ingestion and search',
  admin: 'Source policies, users, and system job controls',
  settings: 'Account and authentication configuration',
}

export type AppShellProps = {
  activeView: string
  onViewChange: (view: NavKey) => void
  onOpenSearch: () => void
  onOpenQuickAdd: () => void
  onOpenNotifications: () => void
  unreadNotifications: number
  children: ReactNode
}

export function AppShell({
  activeView,
  onViewChange,
  onOpenSearch,
  onOpenQuickAdd,
  onOpenNotifications,
  unreadNotifications,
  children,
}: AppShellProps) {
  const activeItem = useMemo(
    () => NAV_ITEMS.find((item) => item.key === activeView) ?? NAV_ITEMS[0],
    [activeView],
  )

  return (
    <div className="app-shell">
      <aside className="shell-rail">
        <div className="shell-brand">
          <Wine size={22} aria-hidden="true" />
        </div>
        <div className="shell-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.key}
                className={item.key === activeItem.key ? 'shell-nav-button is-active' : 'shell-nav-button'}
                onClick={() => onViewChange(item.key)}
                title={item.label}
                type="button"
                aria-label={item.label}
              >
                <span className="shell-nav-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span className="shell-nav-label">{item.shortLabel}</span>
              </button>
            )
          })}
        </div>
        <div className="shell-rail-role">{activeItem.label}</div>
      </aside>

      <section className="shell-main">
        <header className="shell-header">
          <div className="shell-header-copy">
            <h1 className="shell-title">{activeItem.label}</h1>
            <p className="shell-subtitle">{VIEW_DESCRIPTIONS[activeItem.key]}</p>
          </div>

          <div className="shell-actions">
            <button className="shell-action-button" onClick={onOpenSearch} type="button">
              <span className="shell-action-icon" aria-hidden="true">
                <Search size={16} />
              </span>
              Search
            </button>
            <button className="shell-action-button" onClick={onOpenNotifications} type="button">
              <span className="shell-action-icon" aria-hidden="true">
                <Bell size={16} />
              </span>
              Notifications
              {unreadNotifications > 0 && <span className="shell-badge">{unreadNotifications}</span>}
            </button>
            <button className="shell-action-button shell-action-button-primary" onClick={onOpenQuickAdd} type="button">
              <span className="shell-action-icon" aria-hidden="true">
                <Plus size={16} />
              </span>
              Quick Add
            </button>
          </div>
        </header>

        <div className="shell-content">{children}</div>
      </section>
    </div>
  )
}
