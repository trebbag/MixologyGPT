import { useEffect, useMemo, useState } from 'react'

import { apiJson, apiVoid } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type Notification = {
  id: string
  type: string
  status: string
  deliver_at: string
  payload?: Record<string, unknown> | null
}

export function NotificationsOverlay({
  open,
  onClose,
  onUnreadCountChange,
}: {
  open: boolean
  onClose: () => void
  onUnreadCountChange?: (count: number) => void
}) {
  const [rows, setRows] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const unreadCount = useMemo(() => rows.filter((n) => n.status === 'pending').length, [rows])

  useEffect(() => {
    onUnreadCountChange?.(unreadCount)
  }, [onUnreadCountChange, unreadCount])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const payload = await apiJson<Notification[]>('/v1/notifications')
      setRows(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void load()
  }, [open])

  const markRead = async (id: string) => {
    try {
      await apiVoid(`/v1/notifications/${id}/read`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as read.')
    }
  }

  const dismiss = async (id: string) => {
    try {
      await apiVoid(`/v1/notifications/${id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss.')
    }
  }

  const markAllRead = async () => {
    try {
      await apiVoid('/v1/notifications/read-all', { method: 'POST' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark all read.')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Notifications">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close notifications"
      />
      <div className="absolute right-0 top-0 h-full w-full max-w-md">
        <div className="h-full bg-black/60 backdrop-blur-xl border-l border-white/10 shadow-2xl flex flex-col">
          <div className="p-5 border-b border-white/10 flex items-start justify-between gap-6">
            <div>
              <h2 className="text-lg font-semibold text-white">Notifications</h2>
              <p className="text-sm text-gray-400 mt-1">Unread: {unreadCount}</p>
            </div>
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white"
              onClick={onClose}
            >
              Close
            </button>
          </div>

          <div className="p-5 flex items-center justify-between gap-3 flex-wrap border-b border-white/10">
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white disabled:opacity-60"
              onClick={markAllRead}
              disabled={rows.length === 0}
            >
              Mark All Read
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white disabled:opacity-60"
              onClick={load}
              disabled={loading}
            >
              Refresh
            </button>
          </div>

          <div className="flex-1 overflow-auto p-5 space-y-3">
            {loading ? <LoadState tone="loading" title="Loading" message="Fetching notifications." /> : null}
            {error ? (
              <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-xl p-3">{error}</div>
            ) : null}
            {!loading && !error && rows.length === 0 ? (
              <LoadState tone="empty" title="All clear" message="No low-stock or expiry notifications right now." />
            ) : null}

            {rows.map((n) => {
              const payload = n.payload ?? {}
              const title = n.type === 'expiry_soon' ? 'Expiry Soon' : n.type === 'low_stock' ? 'Low Stock' : n.type
              const meta = (() => {
                if (n.type === 'expiry_soon') return `Lot ${String(payload.lot_id ?? '')}`
                if (n.type === 'low_stock') return `Item ${String(payload.item_id ?? '')}`
                return ''
              })()
              return (
                <div key={n.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-white font-semibold">{title}</p>
                      {meta ? <p className="text-xs text-gray-400 mt-1">{meta}</p> : null}
                      <p className="text-[11px] text-gray-500 mt-2">
                        {new Date(n.deliver_at).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs border ${
                        n.status === 'pending'
                          ? 'bg-pink-500/20 border-pink-500/30 text-pink-200'
                          : 'bg-white/10 border-white/10 text-gray-300'
                      }`}
                    >
                      {n.status}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white disabled:opacity-60"
                      onClick={() => markRead(n.id)}
                      disabled={n.status !== 'pending'}
                    >
                      Mark Read
                    </button>
                    <button
                      type="button"
                      className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white"
                      onClick={() => dismiss(n.id)}
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
    </div>
  )
}

