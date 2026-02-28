import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity } from 'lucide-react'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type SystemJob = {
  id: string
  name: string
  last_run_at?: string | null
  last_status?: string | null
  last_message?: string | null
}

function statusTone(status?: string | null): 'ok' | 'warn' | 'error' | 'muted' {
  const normalized = (status || '').toLowerCase()
  if (!normalized) return 'muted'
  if (normalized === 'ok' || normalized === 'success' || normalized === 'healthy') return 'ok'
  if (normalized.includes('warn')) return 'warn'
  if (normalized.includes('fail') || normalized.includes('error') || normalized.includes('down')) return 'error'
  return 'muted'
}

function badgeClasses(tone: ReturnType<typeof statusTone>): string {
  if (tone === 'ok') return 'bg-green-500/20 text-green-200 border-green-500/30'
  if (tone === 'warn') return 'bg-yellow-500/20 text-yellow-200 border-yellow-500/30'
  if (tone === 'error') return 'bg-red-500/20 text-red-200 border-red-500/30'
  return 'bg-white/10 text-gray-200 border-white/10'
}

export function AdminJobsView() {
  const [rows, setRows] = useState<SystemJob[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiJson<SystemJob[]>('/v1/admin/system-jobs')
      setRows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load system jobs.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const sorted = useMemo(() => {
    return rows.slice().sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">System Jobs</h2>
            <p className="text-sm text-gray-400 mt-1">Heartbeat status reported by workers and scheduled tasks.</p>
          </div>
          <button
            type="button"
            onClick={load}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white disabled:opacity-60"
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        {loading ? <LoadState tone="loading" title="Loading jobs" message="Fetching system job heartbeats." /> : null}
        {error ? <LoadState tone="error" title="Jobs error" message={error} actionLabel="Retry" onAction={load} /> : null}

        <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
          <div className="flex items-baseline justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-300" aria-hidden="true" />
              <h3 className="text-lg font-semibold text-white">Jobs</h3>
            </div>
            <p className="text-sm text-gray-300">{rows.length}</p>
          </div>

          {!loading && !error && sorted.length === 0 ? (
            <div className="mt-4">
              <LoadState
                tone="empty"
                title="No job heartbeats yet"
                message="Workers will populate this list once they report status updates."
              />
            </div>
          ) : null}

          {sorted.length ? (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {sorted.map((row) => {
                const tone = statusTone(row.last_status)
                return (
                  <div key={row.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-white font-semibold truncate">{row.name}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Last run: {row.last_run_at ? new Date(row.last_run_at).toLocaleString() : '—'}
                        </p>
                      </div>
                      <span className={`shrink-0 px-2 py-1 rounded-full text-[11px] border ${badgeClasses(tone)}`}>
                        {row.last_status || 'unknown'}
                      </span>
                    </div>
                    {row.last_message ? <p className="mt-3 text-sm text-gray-200 whitespace-pre-wrap">{row.last_message}</p> : null}
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

