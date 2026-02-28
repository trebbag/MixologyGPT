import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { AlertTriangle, RefreshCw } from 'lucide-react'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type HarvestJob = {
  id: string
  source_url: string
  source_type: string
  status: string
  error?: string | null
  attempt_count?: number | null
  parse_strategy?: string | null
  compliance_reasons?: string[] | null
  next_retry_at?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export function HarvestJobDetailView({ jobId }: { jobId: string }) {
  const router = useRouter()
  const [job, setJob] = useState<HarvestJob | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!jobId) return
    setLoading(true)
    setError('')
    try {
      const data = await apiJson<HarvestJob>(`/v1/recipes/harvest/jobs/${jobId}`)
      setJob(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load harvest job.')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    void load()
  }, [load])

  const retryDeferred = useMemo(() => {
    const retryAt = job?.next_retry_at ? Date.parse(job.next_retry_at) : NaN
    return Boolean(job?.next_retry_at && Number.isFinite(retryAt) && retryAt > Date.now())
  }, [job?.next_retry_at])

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <button
          type="button"
          onClick={() => router.push('/recipes/harvest')}
          className="text-gray-400 hover:text-white mb-6 flex items-center space-x-2"
        >
          <span>← Back to Harvest Pipeline</span>
        </button>

        {loading && <LoadState tone="loading" title="Loading job" message="Fetching harvest job details." />}
        {error && <LoadState tone="error" title="Job error" message={error} actionLabel="Retry" onAction={load} />}

        {!loading && !error && job && (
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Harvest Job</h2>
                <p className="mt-1 text-sm text-gray-400 break-all">{job.source_url}</p>
                <p className="mt-2 text-sm text-gray-300">
                  status: <span className="text-white font-semibold">{job.status}</span> · attempts:{' '}
                  <span className="text-white font-semibold">{job.attempt_count ?? 0}</span>
                </p>
                {job.parse_strategy ? (
                  <p className="mt-1 text-xs text-gray-400">parse_strategy: {job.parse_strategy}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={load}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                Refresh
              </button>
            </div>

            {job.error && (
              <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-300 mt-0.5" aria-hidden="true" />
                  <div className="flex-1">
                    <p className="text-sm text-red-200">{job.error}</p>
                    {job.compliance_reasons && job.compliance_reasons.length > 0 && (
                      <p className="mt-2 text-xs text-orange-200">
                        compliance reasons: {job.compliance_reasons.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {retryDeferred && (
              <div className="mt-6">
                <LoadState
                  tone="empty"
                  title="Retry Deferred"
                  message={`Retry available after ${job.next_retry_at}.`}
                />
              </div>
            )}

            <details className="mt-6">
              <summary className="cursor-pointer text-sm text-purple-300 hover:text-purple-200">Raw job JSON</summary>
              <pre className="mt-2 text-xs text-gray-200 bg-black/30 border border-white/10 rounded-lg p-3 overflow-auto">
{JSON.stringify(job, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}
