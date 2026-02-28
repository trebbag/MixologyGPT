import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  GraduationCap,
  Home,
  Lightbulb,
  Package,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react'

export type UserRole = 'consumer' | 'power' | 'admin' | 'user'

export type NavSectionKey =
  | 'dashboard'
  | 'inventory'
  | 'recipes'
  | 'studio'
  | 'recommendations'
  | 'party'
  | 'knowledge'
  | 'admin'

export type NavItem = {
  key: NavSectionKey
  label: string
  icon: LucideIcon
  minRole?: UserRole
  paths: string[]
  subRoutes?: Array<{ path: string; label: string; minRole?: UserRole }>
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: Home, paths: ['/', '/dashboard'] },
  {
    key: 'inventory',
    label: 'Inventory',
    icon: Package,
    paths: ['/inventory'],
    subRoutes: [
      { path: '/inventory', label: 'Overview' },
      { path: '/inventory/settings', label: 'Settings' },
      { path: '/inventory/insights', label: 'Insights' },
      { path: '/inventory/events', label: 'Events' },
      { path: '/inventory/ontology', label: 'Ingredients' },
      { path: '/inventory/equivalencies', label: 'Equivalencies' },
      { path: '/inventory/expiry-rules', label: 'Expiry Rules' },
      { path: '/inventory/conversions', label: 'Conversions' },
      { path: '/inventory/equipment', label: 'Equipment' },
      { path: '/inventory/glassware', label: 'Glassware' },
    ],
  },
  {
    key: 'recipes',
    label: 'Recipes',
    icon: BookOpen,
    paths: ['/recipes'],
    subRoutes: [
      { path: '/recipes', label: 'Library' },
      { path: '/recipes/ingest', label: 'Ingest', minRole: 'power' },
      { path: '/recipes/harvest', label: 'Harvest', minRole: 'power' },
      { path: '/recipes/source-discovery', label: 'Sources', minRole: 'power' },
      { path: '/recipes/moderation', label: 'Moderation', minRole: 'admin' },
    ],
  },
  {
    key: 'studio',
    label: 'Studio',
    icon: Sparkles,
    minRole: 'power',
    paths: ['/studio'],
    subRoutes: [{ path: '/studio', label: 'Sessions' }],
  },
  {
    key: 'recommendations',
    label: 'Recommendations',
    icon: Lightbulb,
    paths: ['/recommendations'],
  },
  {
    key: 'party',
    label: 'Party',
    icon: Users,
    paths: ['/party'],
  },
  {
    key: 'knowledge',
    label: 'Knowledge',
    icon: GraduationCap,
    paths: ['/knowledge'],
  },
  {
    key: 'admin',
    label: 'Admin',
    icon: Shield,
    minRole: 'admin',
    paths: ['/admin'],
    subRoutes: [
      { path: '/admin', label: 'Overview' },
      { path: '/admin/sources', label: 'Source Policies' },
      { path: '/admin/crawler-ops', label: 'Crawler Ops' },
      { path: '/admin/jobs', label: 'System Jobs' },
      { path: '/admin/media', label: 'Media' },
    ],
  },
]

export function hasRole(role: string, minRole?: UserRole): boolean {
  if (!minRole) return true
  const normalized = (role || 'user') as UserRole
  const order: UserRole[] = ['consumer', 'user', 'power', 'admin']
  const currentIdx = order.indexOf(normalized)
  const requiredIdx = order.indexOf(minRole)
  if (currentIdx === -1 || requiredIdx === -1) return false
  return currentIdx >= requiredIdx
}
