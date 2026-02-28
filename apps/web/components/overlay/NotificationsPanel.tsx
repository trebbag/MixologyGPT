import { useCallback, useEffect, useMemo, useState } from 'react'

type RawNotification = {
  id: string
  type: string
  status: string
  deliver_at: string
  payload?: Record<string, unknown> | null
}

type SupportedNotification = {
  id: string
  type: 'expiry_soon' | 'low_stock'
  status: string
  deliverAt: string
  payload: Record<string, unknown>
}

type NotificationsPanelProps = {
  isOpen: boolean
  onClose: () => void
  authHeaders: Record<string, string>
  itemNameById: Record<string, string>
  onUnreadCountChange?: (count: number) => void
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

function coerceNotification(value: RawNotification): SupportedNotification | null {
  if (value.type !== 'expiry_soon' && value.type !== 'low_stock') return null
  return {
    id: value.id,
    type: value.type,
    status: value.status,
    deliverAt: value.deliver_at,
    payload: value.payload ?? {},
  }
}

export function NotificationsPanel({
  isOpen,
  onClose,
  authHeaders,
  itemNameById,
  onUnreadCountChange,
}: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<SupportedNotification[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const unreadCount = useMemo(
    () => notifications.filter((item) => item.status === 'pending').length,
    [notifications],
  )

  useEffect(() => {
    onUnreadCountChange?.(unreadCount)
  }, [onUnreadCountChange, unreadCount])

  const loadNotifications = useCallback(async () => {
    if (!authHeaders.Authorization) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${apiUrl}/v1/notifications`, { headers: authHeaders })
      if (!response.ok) throw new Error('Failed to load notifications.')
      const payload: RawNotification[] = await response.json()
      const normalized = payload.map(coerceNotification).filter(Boolean) as SupportedNotification[]
      setNotifications(normalized)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications.')
    } finally {
      setLoading(false)
    }
  }, [authHeaders])

  const markRead = async (notificationId: string) => {
    const response = await fetch(`${apiUrl}/v1/notifications/${notificationId}/read`, {
      method: 'POST',
      headers: authHeaders,
    })
    if (!response.ok) {
      setError('Failed to mark notification as read.')
      return
    }
    await loadNotifications()
  }

  const dismissNotification = async (notificationId: string) => {
    const response = await fetch(`${apiUrl}/v1/notifications/${notificationId}`, {
      method: 'DELETE',
      headers: authHeaders,
    })
    if (!response.ok) {
      setError('Failed to dismiss notification.')
      return
    }
    await loadNotifications()
  }

  const markAllRead = async () => {
    const response = await fetch(`${apiUrl}/v1/notifications/read-all`, {
      method: 'POST',
      headers: authHeaders,
    })
    if (!response.ok) {
      setError('Failed to mark all notifications as read.')
      return
    }
    await loadNotifications()
  }

  useEffect(() => {
    if (isOpen) {
      void loadNotifications()
    }
  }, [isOpen, loadNotifications])

  const refreshNotifications = async () => {
    try {
      const response = await fetch(`${apiUrl}/v1/notifications/refresh`, {
        method: 'POST',
        headers: authHeaders,
      })
      if (!response.ok) {
        setError('Refresh requires admin or internal token.')
      }
    } catch {
      setError('Failed to refresh notifications.')
    }
    await loadNotifications()
  }

  if (!isOpen) return null

  return (
    <div className="overlay-root" role="dialog" aria-modal="true">
      <button className="overlay-backdrop" onClick={onClose} type="button" aria-label="Close notifications" />
      <div className="overlay-panel overlay-panel-side">
        <div className="overlay-header">
          <h2>Notifications</h2>
          <button className="overlay-close" onClick={onClose} type="button">
            Close
          </button>
        </div>

        <div className="overlay-body">
          <div className="row">
            <p className="muted">Unread: {unreadCount}</p>
            <button className="shell-action-button" onClick={markAllRead} type="button">
              Mark All Read
            </button>
            <button className="shell-action-button" onClick={refreshNotifications} type="button">
              Refresh
            </button>
          </div>

          {loading && <p className="muted">Loading notifications...</p>}
          {error && <p className="overlay-error">{error}</p>}
          {!loading && notifications.length === 0 && <p className="muted">No expiry or low-stock notifications.</p>}

          {notifications.map((notification) => {
            if (notification.type === 'expiry_soon') {
              const lotId = String(notification.payload.lot_id ?? '')
              const expiresAt = String(notification.payload.expires_at ?? notification.payload.expiry_date ?? '')
              return (
                <div className="notify-card" key={notification.id}>
                  <h3>Expiry Soon</h3>
                  <p className="muted">Lot: {lotId || 'unknown'} </p>
                  <p className="muted">Expires: {expiresAt || 'unknown'}</p>
                  <div className="row">
                    <button
                      className="shell-action-button"
                      type="button"
                      onClick={() => markRead(notification.id)}
                    >
                      Mark Read
                    </button>
                    <button
                      className="shell-action-button"
                      type="button"
                      onClick={() => dismissNotification(notification.id)}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )
            }

            const itemId = String(notification.payload.item_id ?? '')
            const itemName = itemNameById[itemId] ?? itemId
            const total = String(notification.payload.total ?? '')
            const unit = String(notification.payload.unit ?? '')
            return (
              <div className="notify-card" key={notification.id}>
                <h3>Low Stock</h3>
                <p className="muted">Item: {itemName || 'unknown'}</p>
                <p className="muted">
                  Remaining: {total || '?'} {unit}
                </p>
                <div className="row">
                  <button
                    className="shell-action-button"
                    type="button"
                    onClick={() => markRead(notification.id)}
                  >
                    Mark Read
                  </button>
                  <button
                    className="shell-action-button"
                    type="button"
                    onClick={() => dismissNotification(notification.id)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
