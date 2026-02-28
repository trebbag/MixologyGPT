import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type StudioSession = {
  id: string
  status: string
  created_at?: string
  updated_at?: string
}

const OFFLINE_MESSAGE = 'Network appears offline. Check your connection and try again.'

function isOfflineError(message: string): boolean {
  return message.toLowerCase().includes('offline')
}

export function StudioSessionsView() {
  const router = useRouter()
  const [sessions, setSessions] = useState<StudioSession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const isOffline = isOfflineError(error) || isOfflineError(createError)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await apiJson<StudioSession[]>('/v1/studio/sessions')
      setSessions(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load studio sessions.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const createSession = async () => {
    setCreating(true)
    setCreateError('')
    try {
      const session = await apiJson<StudioSession>('/v1/studio/sessions', {
        method: 'POST',
        body: JSON.stringify({ status: 'active' }),
      })
      await load()
      await router.push(`/studio/${session.id}`)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create session.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">Studio Sessions</h2>
            <p className="text-sm text-gray-400 mt-1">
              Create constrained cocktail drafts, iterate versions, and export guided making steps.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={load}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white"
              disabled={loading || isOffline}
              data-testid="studio-sessions-refresh"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={createSession}
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium disabled:opacity-60"
              disabled={creating || isOffline}
              data-testid="studio-sessions-new"
            >
              {creating ? 'Creating…' : 'New Session'}
            </button>
          </div>
        </div>

        {isOffline ? (
          <LoadState
            tone="error"
            title="Offline Mode"
            message={OFFLINE_MESSAGE}
            actionLabel="Retry"
            onAction={load}
            disabled={loading}
          />
        ) : null}
        {loading ? (
          <LoadState tone="loading" title="Loading sessions" message="Fetching Studio session list." />
        ) : null}
        {error && !isOffline ? <LoadState tone="error" title="Studio error" message={error} actionLabel="Retry" onAction={load} /> : null}
        {createError && !isOffline ? (
          <LoadState tone="error" title="Create failed" message={createError} />
        ) : null}

        {!loading && !error && sessions.length === 0 ? (
          <LoadState
            tone="empty"
            title="No sessions yet"
            message="Start a new session to generate a first draft recipe."
            actionLabel="New Session"
            onAction={createSession}
            disabled={creating || isOffline}
          />
        ) : null}

        {isOffline ? (
          <p className="text-sm text-gray-300">Studio session actions are disabled while offline.</p>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {sessions
            .slice()
            .reverse()
            .slice(0, 24)
            .map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => router.push(`/studio/${session.id}`)}
                className="text-left bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6 hover:bg-white/5 transition-colors"
              >
                <p className="text-sm text-gray-400">Session</p>
                <p className="mt-1 text-white font-semibold break-all">{session.id}</p>
                <div className="mt-4 flex items-center gap-2 text-xs text-gray-400 flex-wrap">
                  <span className="px-2 py-1 rounded bg-white/10 border border-white/10">{session.status}</span>
                  {session.updated_at ? (
                    <span className="px-2 py-1 rounded bg-white/10 border border-white/10">
                      updated {new Date(session.updated_at).toLocaleString()}
                    </span>
                  ) : null}
                </div>
              </button>
            ))}
        </div>

        {sessions.length > 24 ? (
          <p className="text-xs text-gray-500">Showing 24 most recent sessions.</p>
        ) : null}
      </div>
    </div>
  )
}
