import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  ExternalLink,
  Loader,
  Plus,
  RefreshCw,
  XCircle,
} from 'lucide-react'

import { apiJson } from '../../../lib/api'
import { LoadState } from '../../ui/LoadState'

type HarvestJobStatus = 'pending' | 'running' | 'succeeded' | 'failed'

type HarvestJob = {
  id: string
  source_url: string
  source_type: string
  status: HarvestJobStatus | string
  error?: string | null
  attempt_count?: number | null
  parse_strategy?: string | null
  compliance_reasons?: string[] | null
  next_retry_at?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type AutoHarvestResponse = {
  status: string
  discovered_urls: string[]
  parsed_count: number
  queued_job_ids: string[]
  parser_stats?: Record<string, number>
  confidence_buckets?: Record<string, number>
  fallback_class_counts?: Record<string, number>
  parse_failure_counts?: Record<string, number>
  compliance_rejections?: number
  compliance_reason_counts?: Record<string, number>
  errors?: string[]
}

const STATUS_CONFIG: Record<
  HarvestJobStatus,
  {
    icon: any
    bgClass: string
    textClass: string
    borderClass: string
    spin: boolean
    label: string
  }
> = {
  pending: {
    icon: Clock,
    label: 'Pending',
    bgClass: 'bg-yellow-500/20',
    textClass: 'text-yellow-300',
    borderClass: 'border-yellow-500/50',
    spin: false,
  },
  running: {
    icon: Loader,
    label: 'Running',
    bgClass: 'bg-blue-500/20',
    textClass: 'text-blue-300',
    borderClass: 'border-blue-500/50',
    spin: true,
  },
  succeeded: {
    icon: CheckCircle,
    label: 'Succeeded',
    bgClass: 'bg-green-500/20',
    textClass: 'text-green-300',
    borderClass: 'border-green-500/50',
    spin: false,
  },
  failed: {
    icon: XCircle,
    label: 'Failed',
    bgClass: 'bg-red-500/20',
    textClass: 'text-red-300',
    borderClass: 'border-red-500/50',
    spin: false,
  },
}

function normalizeStatus(value: string): HarvestJobStatus {
  const normalized = (value || '').toLowerCase()
  if (normalized === 'pending') return 'pending'
  if (normalized === 'running') return 'running'
  if (normalized === 'succeeded') return 'succeeded'
  return 'failed'
}

export function HarvestPipelineView() {
  const router = useRouter()
  const [jobs, setJobs] = useState<HarvestJob[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [autoUrl, setAutoUrl] = useState('')
  const [maxLinks, setMaxLinks] = useState('10')
  const [autoResult, setAutoResult] = useState<AutoHarvestResponse | null>(null)
  const [autoLoading, setAutoLoading] = useState(false)
  const [autoError, setAutoError] = useState('')

  const loadJobs = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiJson<HarvestJob[]>('/v1/recipes/harvest/jobs')
      setJobs(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load harvest jobs.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadJobs()
  }, [])

  const runAutoHarvest = async () => {
    setAutoLoading(true)
    setAutoError('')
    setAutoResult(null)
    try {
      const payload = {
        source_url: autoUrl.trim(),
        source_type: 'web',
        max_links: Number(maxLinks || '10'),
        enqueue: true,
      }
      const res = await apiJson<AutoHarvestResponse>('/v1/recipes/harvest/auto', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setAutoResult(res)
      await loadJobs()
    } catch (err) {
      setAutoError(err instanceof Error ? err.message : 'Auto harvest failed.')
    } finally {
      setAutoLoading(false)
    }
  }

  const runJob = async (jobId: string) => {
    setError('')
    try {
      await apiJson(`/v1/recipes/harvest/jobs/${jobId}/run`, { method: 'POST' })
      await loadJobs()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to run harvest job.')
    }
  }

  const retryDisabledReason = (job: HarvestJob) => {
    const retryAt = job.next_retry_at ? Date.parse(job.next_retry_at) : NaN
    if (Number.isFinite(retryAt) && retryAt > Date.now()) return `Retry available after ${job.next_retry_at}`
    return ''
  }

  const stats = useMemo(() => {
    return {
      total: jobs.length,
      succeeded: jobs.filter((j) => normalizeStatus(j.status) === 'succeeded').length,
      running: jobs.filter((j) => normalizeStatus(j.status) === 'running').length,
      failed: jobs.filter((j) => normalizeStatus(j.status) === 'failed').length,
    }
  }, [jobs])

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Harvest Pipeline</h2>
            <p className="text-gray-400">Automated recipe discovery and ingestion</p>
          </div>
          <button
            type="button"
            onClick={loadJobs}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white font-medium flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Refresh Jobs
          </button>
        </div>

        <div className="grid grid-cols-4 gap-6 mb-8">
          <div className="bg-black/40 backdrop-blur-xl rounded-xl border border-white/10 p-6">
            <p className="text-sm text-gray-400 mb-1">Total Jobs</p>
            <p className="text-3xl font-bold text-white">{stats.total}</p>
          </div>
          <div className="bg-black/40 backdrop-blur-xl rounded-xl border border-green-500/30 p-6">
            <p className="text-sm text-gray-400 mb-1">Completed</p>
            <p className="text-3xl font-bold text-green-400">{stats.succeeded}</p>
          </div>
          <div className="bg-black/40 backdrop-blur-xl rounded-xl border border-blue-500/30 p-6">
            <p className="text-sm text-gray-400 mb-1">Running</p>
            <p className="text-3xl font-bold text-blue-400">{stats.running}</p>
          </div>
          <div className="bg-black/40 backdrop-blur-xl rounded-xl border border-red-500/30 p-6">
            <p className="text-sm text-gray-400 mb-1">Failed</p>
            <p className="text-3xl font-bold text-red-400">{stats.failed}</p>
          </div>
        </div>

        <div className="mb-6 p-6 bg-purple-500/10 border border-purple-500/30 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-4">Auto Harvest</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-2">Source URL</label>
              <input
                type="url"
                value={autoUrl}
                onChange={(e) => setAutoUrl(e.target.value)}
                placeholder="https://punchdrink.com/recipes/"
                className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">Max links</label>
                <input
                  value={maxLinks}
                  onChange={(e) => setMaxLinks(e.target.value)}
                  className="w-full px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={runAutoHarvest}
              disabled={!autoUrl.trim() || autoLoading}
              className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium flex items-center gap-2"
            >
              <Plus className="w-5 h-5" aria-hidden="true" />
              {autoLoading ? 'Running…' : 'Run Auto Harvest'}
            </button>
          </div>

          {autoError && (
            <div className="mt-4">
              <LoadState tone="error" title="Auto harvest error" message={autoError} />
            </div>
          )}

          {autoResult && (
            <div className="mt-4 p-4 bg-black/30 border border-white/10 rounded-xl">
              <p className="text-sm text-gray-200">
                Parsed: <span className="font-semibold text-white">{autoResult.parsed_count}</span> · Queued:{' '}
                <span className="font-semibold text-white">{autoResult.queued_job_ids.length}</span>
              </p>
              {autoResult.errors && autoResult.errors.length > 0 && (
                <pre className="mt-3 text-xs text-gray-200 bg-black/40 border border-white/10 rounded-lg p-3 overflow-auto">
{autoResult.errors.slice(0, 12).join('\n')}
                </pre>
              )}
            </div>
          )}
        </div>

        {loading && <LoadState tone="loading" title="Loading jobs" message="Fetching harvest jobs." />}
        {error && <LoadState tone="error" title="Harvest error" message={error} actionLabel="Retry" onAction={loadJobs} />}

        {!loading && !error && (
          <div className="space-y-4">
            {jobs.map((job) => {
              const status = normalizeStatus(job.status)
              const cfg = STATUS_CONFIG[status]
              const Icon = cfg.icon
              const disabledReason = retryDisabledReason(job)
              const retryDisabled = Boolean(disabledReason)
              const showRetry = status === 'failed'

              return (
                <div key={job.id} className={`p-6 rounded-xl border ${cfg.bgClass} ${cfg.borderClass} backdrop-blur-xl`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start space-x-4 flex-1">
                      <div>
                        <Icon className={`w-5 h-5 ${cfg.textClass} ${cfg.spin ? 'animate-spin' : ''}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-semibold text-white capitalize">{job.source_type} Harvest</h3>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${cfg.bgClass} ${cfg.textClass}`}>
                            {cfg.label}
                          </span>
                        </div>

                        <a
                          href={job.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-blue-300 hover:text-blue-200 flex items-center gap-1 break-all"
                        >
                          {job.source_url}
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>

                        <div className="mt-2 flex items-center gap-6 text-sm text-gray-300">
                          <span>Attempts: {job.attempt_count ?? 0}</span>
                          {job.parse_strategy ? <span>Strategy: {job.parse_strategy}</span> : null}
                        </div>

                        {job.error && (
                          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                            <div className="flex items-start space-x-2">
                              <AlertTriangle className="w-4 h-4 text-red-300 flex-shrink-0 mt-0.5" />
                              <p className="text-sm text-red-200">{job.error}</p>
                            </div>
                            {job.compliance_reasons && job.compliance_reasons.length > 0 && (
                              <p className="mt-1 text-xs text-orange-200">
                                compliance: {job.compliance_reasons.join(', ')}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 ml-4">
                      <button
                        type="button"
                        onClick={() => router.push(`/recipes/harvest/${job.id}`)}
                        className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm"
                      >
                        Details
                      </button>
                      {showRetry && (
                        <button
                          type="button"
                          onClick={() => runJob(job.id)}
                          disabled={retryDisabled}
                          className="px-3 py-2 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/50 rounded-lg text-orange-200 text-sm flex items-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          title={disabledReason || undefined}
                        >
                          <RefreshCw className="w-4 h-4" aria-hidden="true" />
                          <span>{retryDisabled ? 'Queued Retry' : 'Retry'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {retryDisabled && (
                    <p className="text-xs text-gray-300">
                      Retry available after <span className="text-white">{job.next_retry_at}</span>
                    </p>
                  )}
                </div>
              )
            })}

            {jobs.length === 0 && (
              <LoadState tone="empty" title="No harvest jobs yet" message="Run auto harvest to queue jobs for ingestion." />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

